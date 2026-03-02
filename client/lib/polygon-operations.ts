import * as turf from "@turf/turf";
import * as martinez from "martinez-polygon-clipping";
import { devLog } from "./logger";
import { polygonWorkerManager } from "./polygon-worker-manager";
import { exactPolygonSplit } from "./polygon-operations-exact";

/**
 * Simplify geometry to improve performance for complex polygons
 * This prevents browser crashes on polygons with many vertices
 */
function simplifyGeometryForPerformance<T extends GeoJSON.Geometry>(
  geometry: T,
  tolerance: number = 0.0001, // Much smaller tolerance for cadastral precision
  highQuality: boolean = true, // Always use high quality for property boundaries
): T {
  try {
    // Only simplify if geometry has many vertices
    if (geometry.type === "Polygon") {
      const polygon = geometry as GeoJSON.Polygon;
      const totalVertices = polygon.coordinates.reduce(
        (sum, ring) => sum + ring.length,
        0,
      );

      // Only simplify very complex polygons (>500 vertices) and with minimal tolerance
      if (totalVertices > 500) {
        devLog.log(
          `🔧 Simplifying complex polygon with ${totalVertices} vertices (tolerance: ${tolerance})`,
        );
        const simplified = turf.simplify(turf.feature(polygon), {
          tolerance,
          highQuality,
        });
        const newVertices = simplified.geometry.coordinates.reduce(
          (sum: number, ring: any) => sum + ring.length,
          0,
        );
        devLog.log(
          `✅ Simplified to ${newVertices} vertices (${Math.round((1 - newVertices / totalVertices) * 100)}% reduction)`,
        );
        return simplified.geometry as T;
      }
    } else if (geometry.type === "LineString") {
      const linestring = geometry as GeoJSON.LineString;
      // Only simplify very complex lines (>200 points)
      if (linestring.coordinates.length > 200) {
        devLog.log(
          `🔧 Simplifying complex line with ${linestring.coordinates.length} points`,
        );
        const simplified = turf.simplify(turf.feature(linestring), {
          tolerance,
          highQuality,
        });
        return simplified.geometry as T;
      }
    }

    return geometry;
  } catch (error) {
    devLog.warn("Error simplifying geometry, using original:", error);
    return geometry;
  }
}

/**
 * Convert Turf/GeoJSON polygon coordinates to Martinez format
 */
function geoJsonToMartinez(polygon: GeoJSON.Polygon): martinez.Polygon {
  return polygon.coordinates.map((ring) =>
    ring.map((coord) => [coord[0], coord[1]] as martinez.Position),
  ) as martinez.Polygon;
}

/**
 * Convert Martinez polygon back to GeoJSON format
 */
function martinezToGeoJson(polygon: martinez.Polygon): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: polygon.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]] as [number, number]),
    ),
  };
}

/**
 * Convert a LineString to a thin Polygon for cutting operations
 */
function lineToPolygon(
  line: GeoJSON.LineString,
  width: number,
): GeoJSON.Polygon {
  const coords = line.coordinates;

  if (coords.length < 2) {
    throw new Error("LineString must have at least 2 coordinates");
  }

  // Use turf.buffer for more precise polygon creation
  try {
    const buffered = turf.buffer(turf.lineString(coords), width, {
      units: "degrees",
    });

    if (buffered && buffered.geometry.type === "Polygon") {
      return buffered.geometry;
    }
  } catch (error) {
    devLog.warn("Turf buffer failed, using manual method:", error);
  }

  // Fallback to manual method with precision
  const leftSide: [number, number][] = [];
  const rightSide: [number, number][] = [];

  for (let i = 0; i < coords.length; i++) {
    const [x, y] = coords[i];
    leftSide.push([x - width, y]);
    rightSide.unshift([x + width, y]); // Add to beginning for reverse order
  }

  return {
    type: "Polygon",
    coordinates: [leftSide.concat(rightSide).concat([leftSide[0]])],
  };
}

/**
 * Split polygon using Martinez polygon clipping library
 */
function splitPolygonWithMartinez(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    devLog.log("🔧 Using Martinez polygon clipping for splitting...");

    const originalArea = turf.area(polygon);
    devLog.log("📐 Original polygon area:", Math.round(originalArea), "m²");

    // Convert to Martinez format
    const martinezPolygon = geoJsonToMartinez(polygon.geometry);

    let currentPolygons = [martinezPolygon];

    // Apply each split line sequentially
    splitLines.forEach((line, lineIndex) => {
      devLog.log(
        `✂️ Applying split line ${lineIndex + 1}/${splitLines.length}`,
      );

      try {
        // Create a very thin cutting polygon from the line
        const cuttingPolygon = lineToPolygon(line.geometry, 0.00001); // Slightly larger for better splitting
        const martinezCutter = geoJsonToMartinez(cuttingPolygon);

        const newPolygons: martinez.Polygon[] = [];

        currentPolygons.forEach((poly, polyIndex) => {
          try {
            devLog.log(`🔍 Splitting polygon ${polyIndex + 1}`);

            // Use Martinez difference operation to "cut" the polygon
            const difference = martinez.diff(poly, martinezCutter);

            if (difference && difference.length > 0) {
              difference.forEach((resultPoly) => {
                // Convert back to GeoJSON to calculate area
                const geoJsonPoly = martinezToGeoJson(resultPoly);
                const area = turf.area({
                  type: "Feature",
                  geometry: geoJsonPoly,
                  properties: {},
                });

                // Only keep polygons with meaningful area (> 10 m²)
                if (area > 10) {
                  newPolygons.push(resultPoly);
                  devLog.log(
                    `✅ Created polygon fragment with area: ${Math.round(area)} m²`,
                  );
                } else {
                  devLog.log(
                    `❌ Rejected tiny polygon fragment: ${Math.round(area)} m²`,
                  );
                }
              });
            } else {
              // No split occurred, keep original
              devLog.log("⚠️ No split occurred, keeping original polygon");
              newPolygons.push(poly);
            }
          } catch (err) {
            devLog.warn("Error in Martinez split:", err);
            newPolygons.push(poly);
          }
        });

        currentPolygons = newPolygons;
        devLog.log(
          `📊 After split line ${lineIndex + 1}: ${currentPolygons.length} polygons`,
        );
      } catch (err) {
        devLog.warn(`Error processing split line ${lineIndex + 1}:`, err);
      }
    });

    // Convert results back to GeoJSON features
    const resultFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    currentPolygons.forEach((poly, index) => {
      try {
        const geoJsonPoly = martinezToGeoJson(poly);
        const area = turf.area({
          type: "Feature",
          geometry: geoJsonPoly,
          properties: {},
        });

        if (area > 10) {
          resultFeatures.push({
            type: "Feature",
            geometry: geoJsonPoly,
            properties: {
              lotNumber: index + 1,
              area: Math.round(area),
              method: "martinez-clipping",
            },
          });
          devLog.log(`📦 Final lot ${index + 1}: ${Math.round(area)} m²`);
        }
      } catch (err) {
        devLog.warn("Error converting Martinez result:", err);
      }
    });

    if (resultFeatures.length > 1) {
      devLog.log(
        `✅ Martinez successfully split polygon into ${resultFeatures.length} parts`,
      );
      return resultFeatures;
    } else {
      devLog.log("❌ Martinez splitting did not produce multiple polygons");
      return [polygon];
    }
  } catch (error) {
    console.error("❌ Martinez splitting failed:", error);
    return [polygon];
  }
}

/**
 * Ultra-high precision coordinate handling functions
 */
function roundCoordinatePrecise(coord: number, precision: number = 10): number {
  return Math.round(coord * Math.pow(10, precision)) / Math.pow(10, precision);
}

function cleanCoordinates(coordinates: any[], precision: number = 10): any[] {
  if (Array.isArray(coordinates[0])) {
    return coordinates.map((coord) => cleanCoordinates(coord, precision));
  } else {
    return [
      roundCoordinatePrecise(coordinates[0], precision),
      roundCoordinatePrecise(coordinates[1], precision),
    ];
  }
}

function cleanPolygonGeometry(
  polygon: GeoJSON.Polygon,
  precision: number = 10,
): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: cleanCoordinates(polygon.coordinates, precision),
  };
}

/**
 * Precision line-splitting algorithm using coordinate intersection
 */
function precisionLineSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLine: GeoJSON.Feature<GeoJSON.LineString>,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    // Get polygon boundary as line
    const polygonLine = turf.polygonToLine(polygon);
    const intersections = turf.lineIntersect(polygonLine, splitLine);

    if (intersections.features.length < 2) {
      return [polygon];
    }

    // Use an extremely small buffer with high precision
    const microBuffer = 0.000001; // 1 meter at equator

    try {
      // Create a very thin cutting polygon using precise buffering
      const bufferedLine = turf.buffer(splitLine, microBuffer, {
        units: "degrees",
        steps: 64, // More steps for smoother curves
      });

      // Clean the buffer geometry for precision
      if (bufferedLine && bufferedLine.geometry.type === "Polygon") {
        bufferedLine.geometry = cleanPolygonGeometry(bufferedLine.geometry, 12);
      }

      // Perform difference operation
      const difference = turf.difference(polygon, bufferedLine);

      if (difference) {
        if (difference.geometry.type === "MultiPolygon") {
          const results: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

          difference.geometry.coordinates.forEach((coords, idx) => {
            const cleanedCoords = cleanCoordinates(coords, 12);
            const splitPoly: GeoJSON.Feature<GeoJSON.Polygon> = {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: cleanedCoords,
              },
              properties: {
                lotNumber: idx + 1,
                method: "precision-split",
                ...polygon.properties,
              },
            };

            const area = turf.area(splitPoly);
            if (area > 5) {
              // Very small threshold for precision
              results.push(splitPoly);
            }
          });

          return results.length > 1 ? results : [polygon];
        } else if (difference.geometry.type === "Polygon") {
          // Single polygon result - split didn't work
          return [polygon];
        }
      }
    } catch (err) {
      devLog.warn("Precision split failed:", err);
    }

    return [polygon];
  } catch (error) {
    devLog.warn("Precision line split error:", error);
    return [polygon];
  }
}

/**
 * Enhanced Turf-based approach with ultra-high precision
 */
function enhancedTurfSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  devLog.log("🔧 Using ultra-high precision polygon splitting...");

  // Clean input polygon coordinates for maximum precision
  const cleanedPolygon: GeoJSON.Feature<GeoJSON.Polygon> = {
    ...polygon,
    geometry: cleanPolygonGeometry(polygon.geometry, 12),
  };

  let currentPolygons = [cleanedPolygon];

  splitLines.forEach((line, lineIndex) => {
    devLog.log(
      `✂️ Precision Split: Applying line ${lineIndex + 1}/${splitLines.length}`,
    );

    const newPolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    currentPolygons.forEach((poly) => {
      // Try precision line split first
      const precisionResults = precisionLineSplit(poly, line);

      if (precisionResults.length > 1) {
        newPolygons.push(...precisionResults);
        devLog.log(
          `✅ Precision split successful: ${precisionResults.length} polygons`,
        );
      } else {
        // Fallback to buffered approach with ultra-small buffers
        try {
          const polygonLine = turf.polygonToLine(poly);
          const intersections = turf.lineIntersect(polygonLine, line);

          if (intersections.features.length >= 2) {
            // Ultra-small buffer sizes for maximum precision
            const bufferSizes = [0.000001, 0.000005, 0.00001, 0.00005];
            let splitSuccessful = false;

            for (const bufferSize of bufferSizes) {
              try {
                const bufferedLine = turf.buffer(line, bufferSize, {
                  units: "degrees",
                  steps: 64, // High resolution
                });

                // Clean buffer coordinates
                if (bufferedLine && bufferedLine.geometry.type === "Polygon") {
                  bufferedLine.geometry = cleanPolygonGeometry(
                    bufferedLine.geometry,
                    12,
                  );
                }

                const difference = turf.difference(poly, bufferedLine);

                if (difference && difference.geometry.type === "MultiPolygon") {
                  devLog.log(
                    `✅ Enhanced precision: Split successful with buffer ${bufferSize}`,
                  );

                  difference.geometry.coordinates.forEach((coords, idx) => {
                    const cleanedCoords = cleanCoordinates(coords, 12);
                    const splitPoly: GeoJSON.Feature<GeoJSON.Polygon> = {
                      type: "Feature",
                      geometry: {
                        type: "Polygon",
                        coordinates: cleanedCoords,
                      },
                      properties: {
                        lotNumber: newPolygons.length + 1,
                        method: "enhanced-precision",
                        bufferSize,
                        ...poly.properties,
                      },
                    };

                    const area = turf.area(splitPoly);
                    if (area > 5) {
                      newPolygons.push(splitPoly);
                      devLog.log(
                        `✅ Created precision polygon ${idx + 1}: ${Math.round(area)} m²`,
                      );
                    }
                  });

                  splitSuccessful = true;
                  break;
                }
              } catch (err) {
                devLog.warn(`Precision buffer ${bufferSize} failed:`, err);
              }
            }

            if (!splitSuccessful) {
              devLog.log("❌ All precision methods failed, keeping original");
              newPolygons.push(poly);
            }
          } else {
            devLog.log("❌ Insufficient intersections, keeping original");
            newPolygons.push(poly);
          }
        } catch (error) {
          devLog.warn("Enhanced precision error:", error);
          newPolygons.push(poly);
        }
      }
    });

    currentPolygons = newPolygons.length > 0 ? newPolygons : currentPolygons;
  });

  return currentPolygons;
}

/**
 * Original Turf-based splitting approach (final fallback)
 */
function originalTurfSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  devLog.log("🔧 Using original Turf buffer method (fallback)...");

  let currentPolygons = [polygon];

  splitLines.forEach((line) => {
    const newPolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    currentPolygons.forEach((poly) => {
      try {
        const polygonLine = turf.polygonToLine(poly);
        const intersections = turf.lineIntersect(polygonLine, line);

        if (intersections.features.length >= 2) {
          const bufferedLine = turf.buffer(line, 0.00001, {
            units: "degrees",
          });
          const difference = turf.difference(
            turf.featureCollection([poly, bufferedLine]),
          );

          if (difference) {
            if (difference.geometry.type === "MultiPolygon") {
              difference.geometry.coordinates.forEach((coords) => {
                const splitPoly = {
                  type: "Feature" as const,
                  geometry: {
                    type: "Polygon" as const,
                    coordinates: coords,
                  },
                  properties: {
                    lotNumber: newPolygons.length + 1,
                    method: "original-turf",
                  },
                };

                const area = turf.area(splitPoly);
                if (area > 10) {
                  newPolygons.push(splitPoly);
                }
              });
            } else {
              const area = turf.area(difference);
              if (area > 10) {
                newPolygons.push({
                  type: "Feature",
                  geometry: difference.geometry,
                  properties: {
                    lotNumber: newPolygons.length + 1,
                    method: "original-turf",
                  },
                });
              }
            }
          }
        }

        if (newPolygons.length === 0) {
          newPolygons.push(poly);
        }
      } catch (error) {
        devLog.warn("Original Turf splitting error:", error);
        newPolygons.push(poly);
      }
    });

    currentPolygons = newPolygons;
  });

  return currentPolygons;
}

/**
 * Async Web Worker version of polygon splitting (preferred for performance)
 */
export async function robustPolygonSplitAsync(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): Promise<GeoJSON.Feature<GeoJSON.Polygon>[]> {
  try {
    if (polygonWorkerManager.isWorkerAvailable()) {
      devLog.log("🚀 Using Web Worker for polygon splitting (non-blocking)");
      return await polygonWorkerManager.splitPolygon(polygon, splitLines);
    } else {
      devLog.log("⚠️ Web Worker not available, falling back to main thread");
      return robustPolygonSplitSync(polygon, splitLines);
    }
  } catch (error) {
    devLog.error(
      "Web Worker polygon splitting failed, falling back to main thread:",
      error,
    );
    return robustPolygonSplitSync(polygon, splitLines);
  }
}

/**
 * Synchronous polygon splitting (fallback for when Web Worker fails)
 */
export function robustPolygonSplitSync(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  devLog.log("🎯 Starting robust polygon splitting with multiple algorithms");

  // Ultra-high precision: Clean coordinates but don't simplify for cadastral data
  const precisionPolygon: GeoJSON.Feature<GeoJSON.Polygon> = {
    ...polygon,
    geometry: cleanPolygonGeometry(polygon.geometry, 12),
  };

  const precisionSplitLines = splitLines.map((line) => ({
    ...line,
    geometry: {
      type: "LineString" as const,
      coordinates: cleanCoordinates(line.geometry.coordinates, 12),
    },
  }));

  // Try exact geometric splitting first (perfect for cadastral data)
  devLog.log("🎯 Trying exact geometric splitting (no buffering)...");
  const exactResults = exactPolygonSplit(precisionPolygon, precisionSplitLines);

  if (exactResults.length > 1) {
    devLog.log("✅ Exact geometric splitting succeeded");
    return exactResults;
  }

  // Try ultra-high precision approach as fallback
  devLog.log("🔄 Falling back to ultra-high precision approach...");
  const precisionResults = enhancedTurfSplit(
    precisionPolygon,
    precisionSplitLines,
  );

  if (precisionResults.length > 1) {
    devLog.log("✅ Ultra-high precision approach succeeded");
    return precisionResults;
  }

  // Try Martinez polygon clipping as fallback
  devLog.log("🔄 Falling back to Martinez clipping...");
  const martinezResults = splitPolygonWithMartinez(
    precisionPolygon,
    precisionSplitLines,
  );

  if (martinezResults.length > 1) {
    devLog.log("✅ Martinez polygon clipping succeeded");
    return martinezResults;
  }

  // Fall back to original Turf approach
  devLog.log("🔄 Falling back to original Turf method...");
  const originalResults = originalTurfSplit(
    precisionPolygon,
    precisionSplitLines,
  );

  if (originalResults.length > 1) {
    devLog.log("✅ Original Turf approach succeeded");
    return originalResults;
  }

  // If all methods fail, return original polygon
  devLog.log("❌ All splitting methods failed, returning original polygon");
  return [polygon];
}

/**
 * Robust polygon splitting that tries multiple approaches
 * This is the synchronous version for backwards compatibility
 * Use robustPolygonSplitAsync for better performance
 */
export function robustPolygonSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  return robustPolygonSplitSync(polygon, splitLines);
}
