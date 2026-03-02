import * as turf from "@turf/turf";
import * as jsts from "jsts";
import { devLog } from "./logger";

/**
 * High-precision polygon splitting using JSTS (JavaScript Topology Suite)
 * This maintains coordinate precision better than Turf for cadastral data
 */
export class PrecisionPolygonSplitter {
  private geometryFactory: jsts.geom.GeometryFactory;
  private reader: jsts.io.GeoJSONReader;
  private writer: jsts.io.GeoJSONWriter;

  constructor() {
    this.geometryFactory = new jsts.geom.GeometryFactory();
    this.reader = new jsts.io.GeoJSONReader(this.geometryFactory);
    this.writer = new jsts.io.GeoJSONWriter();
  }

  /**
   * Convert GeoJSON to JSTS geometry with high precision
   */
  private geoJsonToJsts(geoJson: GeoJSON.Geometry): jsts.geom.Geometry {
    return this.reader.read(geoJson);
  }

  /**
   * Convert JSTS geometry back to GeoJSON
   */
  private jstsToGeoJson(jstsGeom: jsts.geom.Geometry): GeoJSON.Geometry {
    return this.writer.write(jstsGeom);
  }

  /**
   * Create a precise cutting line from subdivision line
   * Uses JSTS buffer for better precision than manual polygon creation
   */
  private createCuttingGeometry(
    line: GeoJSON.LineString,
    bufferWidth: number = 0.000001,
  ): jsts.geom.Geometry {
    const jstsLine = this.geoJsonToJsts(line);

    // Use JSTS buffer which maintains higher precision
    const buffered = jstsLine.buffer(bufferWidth);

    // Ensure the buffer is valid
    if (!buffered.isValid()) {
      // Try to fix invalid geometry
      const fixed = buffered.buffer(0);
      return fixed.isValid() ? fixed : buffered;
    }

    return buffered;
  }

  /**
   * Split polygon using JSTS difference operation
   * This maintains much higher coordinate precision than Turf/Martinez
   */
  splitPolygonPrecise(
    polygon: GeoJSON.Feature<GeoJSON.Polygon>,
    splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
  ): GeoJSON.Feature<GeoJSON.Polygon>[] {
    try {
      devLog.log("🔧 Using high-precision JSTS polygon splitting...");

      // Convert polygon to JSTS
      let currentGeom = this.geoJsonToJsts(polygon.geometry);

      // Ensure polygon is valid
      if (!currentGeom.isValid()) {
        devLog.log("⚠️ Invalid input polygon, attempting to fix...");
        currentGeom = currentGeom.buffer(0);
      }

      const resultGeometries: jsts.geom.Geometry[] = [currentGeom];

      // Apply each split line
      splitLines.forEach((line, lineIndex) => {
        devLog.log(
          `✂️ JSTS: Applying split line ${lineIndex + 1}/${splitLines.length}`,
        );

        const cuttingGeom = this.createCuttingGeometry(line.geometry);
        const newResults: jsts.geom.Geometry[] = [];

        resultGeometries.forEach((geom, geomIndex) => {
          try {
            // Use JSTS difference operation for precise cutting
            const difference = geom.difference(cuttingGeom);

            if (difference.isEmpty()) {
              // No cut occurred, keep original
              newResults.push(geom);
              return;
            }

            // Handle different geometry types returned by difference
            if (difference instanceof jsts.geom.MultiPolygon) {
              // Multiple polygons created
              for (let i = 0; i < difference.getNumGeometries(); i++) {
                const subGeom = difference.getGeometryN(i);
                if (subGeom.getArea() > 0.000001) {
                  // Filter tiny polygons
                  newResults.push(subGeom);
                }
              }
            } else if (difference instanceof jsts.geom.Polygon) {
              // Single polygon
              if (difference.getArea() > 0.000001) {
                newResults.push(difference);
              }
            } else if (difference instanceof jsts.geom.GeometryCollection) {
              // Collection of geometries
              for (let i = 0; i < difference.getNumGeometries(); i++) {
                const subGeom = difference.getGeometryN(i);
                if (
                  subGeom instanceof jsts.geom.Polygon &&
                  subGeom.getArea() > 0.000001
                ) {
                  newResults.push(subGeom);
                }
              }
            } else {
              // Other geometry type, keep original
              newResults.push(geom);
            }

            devLog.log(
              `✅ JSTS: Split geometry ${geomIndex + 1}, created ${newResults.length - geomIndex} new parts`,
            );
          } catch (error) {
            devLog.warn(
              `❌ JSTS: Error splitting geometry ${geomIndex + 1}:`,
              error,
            );
            newResults.push(geom);
          }
        });

        resultGeometries.length = 0;
        resultGeometries.push(...newResults);
      });

      // Convert results back to GeoJSON features
      const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

      resultGeometries.forEach((geom, index) => {
        try {
          const geoJsonGeom = this.jstsToGeoJson(geom);

          if (geoJsonGeom.type === "Polygon") {
            const area = turf.area({
              type: "Feature",
              geometry: geoJsonGeom,
              properties: {},
            });

            if (area > 10) {
              // Only include lots larger than 10 m²
              features.push({
                type: "Feature",
                geometry: geoJsonGeom,
                properties: {
                  lotNumber: index + 1,
                  area: Math.round(area),
                  method: "jsts-precision",
                  ...polygon.properties,
                },
              });
            }
          }
        } catch (error) {
          devLog.warn(
            `❌ JSTS: Error converting geometry ${index + 1} to GeoJSON:`,
            error,
          );
        }
      });

      if (features.length > 1) {
        devLog.log(
          `✅ JSTS precision splitting: Created ${features.length} polygons`,
        );
        return features;
      } else {
        devLog.log("❌ JSTS precision splitting: No split occurred");
        return [polygon];
      }
    } catch (error) {
      devLog.error("❌ JSTS precision polygon splitting failed:", error);
      return [polygon];
    }
  }

  /**
   * Clean and validate polygon geometry
   */
  cleanPolygon(
    polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  ): GeoJSON.Feature<GeoJSON.Polygon> {
    try {
      const jstsGeom = this.geoJsonToJsts(polygon.geometry);

      // Clean the geometry using JSTS buffer(0) trick
      const cleaned = jstsGeom.buffer(0);

      if (cleaned.isValid()) {
        const cleanedGeoJson = this.jstsToGeoJson(cleaned);

        if (cleanedGeoJson.type === "Polygon") {
          return {
            ...polygon,
            geometry: cleanedGeoJson,
          };
        }
      }

      return polygon;
    } catch (error) {
      devLog.warn("Error cleaning polygon:", error);
      return polygon;
    }
  }
}

// Create singleton instance
export const precisionSplitter = new PrecisionPolygonSplitter();

/**
 * High-precision polygon splitting function
 * Use this for cadastral-quality subdivision work
 */
export function splitPolygonHighPrecision(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  return precisionSplitter.splitPolygonPrecise(polygon, splitLines);
}

/**
 * Clean polygon geometry for better rendering
 */
export function cleanPolygonGeometry(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return precisionSplitter.cleanPolygon(polygon);
}
