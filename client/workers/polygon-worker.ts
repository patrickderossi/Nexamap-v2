import * as turf from "@turf/turf";
import * as martinez from "martinez-polygon-clipping";

// Exact geometric splitting functions (copied from exact operations)
interface IntersectionPoint {
  coords: [number, number];
  segmentIndex: number;
  ratio: number;
}

function getLineIntersection(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): { coords: [number, number]; ratio: number } | null {
  const x1 = p1[0],
    y1 = p1[1];
  const x2 = p2[0],
    y2 = p2[1];
  const x3 = p3[0],
    y3 = p3[1];
  const x4 = p4[0],
    y4 = p4[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denom) < 1e-12) {
    return null;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    const intersectionX = x1 + t * (x2 - x1);
    const intersectionY = y1 + t * (y2 - y1);

    return {
      coords: [intersectionX, intersectionY],
      ratio: t,
    };
  }

  return null;
}

function findExactIntersections(
  polygon: GeoJSON.Polygon,
  line: GeoJSON.LineString,
): IntersectionPoint[] {
  const intersections: IntersectionPoint[] = [];
  const boundary = polygon.coordinates[0];
  const tolerance = 1e-8; // Tolerance for deduplication

  // Extend the line slightly beyond its endpoints to ensure it reaches the boundary
  const extendedLine = extendLineSlightly(line);

  for (let i = 0; i < boundary.length - 1; i++) {
    const segmentStart = boundary[i];
    const segmentEnd = boundary[i + 1];

    for (let j = 0; j < extendedLine.coordinates.length - 1; j++) {
      const lineStart = extendedLine.coordinates[j];
      const lineEnd = extendedLine.coordinates[j + 1];

      const intersection = getLineIntersection(
        segmentStart,
        segmentEnd,
        lineStart,
        lineEnd,
      );

      if (intersection) {
        intersections.push({
          coords: intersection.coords,
          segmentIndex: i,
          ratio: intersection.ratio,
        });
      }
    }
  }

  // Remove duplicate intersections (same point within tolerance)
  const uniqueIntersections: IntersectionPoint[] = [];
  for (const intersection of intersections) {
    const isDuplicate = uniqueIntersections.some(
      (existing) =>
        Math.abs(existing.coords[0] - intersection.coords[0]) < tolerance &&
        Math.abs(existing.coords[1] - intersection.coords[1]) < tolerance,
    );
    if (!isDuplicate) {
      uniqueIntersections.push(intersection);
    }
  }

  uniqueIntersections.sort((a, b) => {
    if (a.segmentIndex !== b.segmentIndex) {
      return a.segmentIndex - b.segmentIndex;
    }
    return a.ratio - b.ratio;
  });

  return uniqueIntersections;
}

// Helper function to extend a line slightly beyond its endpoints
function extendLineSlightly(line: GeoJSON.LineString): GeoJSON.LineString {
  const coords = line.coordinates;
  if (coords.length < 2) return line;

  // Extension factor - 0.1% longer on each end
  const extensionFactor = 0.001;

  // Extend from start
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[1];
  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const extendedStart: [number, number] = [
    x1 + dx1 * extensionFactor,
    y1 + dy1 * extensionFactor,
  ];

  // Extend from end
  const [xn, yn] = coords[coords.length - 1];
  const [xnm1, ynm1] = coords[coords.length - 2];
  const dxn = xn - xnm1;
  const dyn = yn - ynm1;
  const extendedEnd: [number, number] = [
    xn + dxn * extensionFactor,
    yn + dyn * extensionFactor,
  ];

  return {
    type: "LineString",
    coordinates: [extendedStart, ...coords, extendedEnd],
  };
}

function splitPolygonExactWorker(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLine: GeoJSON.Feature<GeoJSON.LineString>,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    const intersections = findExactIntersections(
      polygon.geometry,
      splitLine.geometry,
    );

    if (intersections.length !== 2) {
      return [polygon];
    }

    const boundary = polygon.geometry.coordinates[0];
    const [int1, int2] = intersections;

    // Create two polygons by tracing exact boundaries
    const poly1Coords: [number, number][] = [];
    const poly2Coords: [number, number][] = [];

    // First polygon: start to int1, split line, int2 to end
    for (let i = 0; i <= int1.segmentIndex; i++) {
      poly1Coords.push(boundary[i]);
    }
    poly1Coords.push(int1.coords);
    poly1Coords.push(int2.coords);
    for (let i = int2.segmentIndex + 1; i < boundary.length; i++) {
      poly1Coords.push(boundary[i]);
    }
    if (
      poly1Coords[0][0] !== poly1Coords[poly1Coords.length - 1][0] ||
      poly1Coords[0][1] !== poly1Coords[poly1Coords.length - 1][1]
    ) {
      poly1Coords.push(poly1Coords[0]);
    }

    // Second polygon: int1 to int2 along boundary, back along split line
    poly2Coords.push(int1.coords);
    for (let i = int1.segmentIndex + 1; i <= int2.segmentIndex; i++) {
      poly2Coords.push(boundary[i]);
    }
    poly2Coords.push(int2.coords);
    if (
      poly2Coords[0][0] !== poly2Coords[poly2Coords.length - 1][0] ||
      poly2Coords[0][1] !== poly2Coords[poly2Coords.length - 1][1]
    ) {
      poly2Coords.push(poly2Coords[0]);
    }

    const poly1: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [poly1Coords],
    };
    const poly2: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [poly2Coords],
    };

    const area1 = turf.area({
      type: "Feature",
      geometry: poly1,
      properties: {},
    });
    const area2 = turf.area({
      type: "Feature",
      geometry: poly2,
      properties: {},
    });

    const results: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
    if (area1 > 5) {
      results.push({
        type: "Feature",
        geometry: poly1,
        properties: {
          lotNumber: 1,
          method: "worker-exact",
          area: Math.round(area1),
          ...polygon.properties,
        },
      });
    }
    if (area2 > 5) {
      results.push({
        type: "Feature",
        geometry: poly2,
        properties: {
          lotNumber: results.length + 1,
          method: "worker-exact",
          area: Math.round(area2),
          ...polygon.properties,
        },
      });
    }

    return results.length > 1 ? results : [polygon];
  } catch (error) {
    console.warn("Worker exact split error:", error);
    return [polygon];
  }
}

// Define message types for worker communication
interface WorkerMessage {
  id: string;
  type: "split-polygon" | "simplify-geometry";
  payload: any;
}

interface SplitPolygonPayload {
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[];
}

interface SimplifyGeometryPayload {
  geometry: GeoJSON.Geometry;
  tolerance: number;
  highQuality: boolean;
}

// Geometry simplification function (copied from main thread)
function simplifyGeometryForPerformance<T extends GeoJSON.Geometry>(
  geometry: T,
  tolerance: number = 0.0001, // Much smaller tolerance for cadastral precision
  highQuality: boolean = true, // Always use high quality for property boundaries
): T {
  try {
    if (geometry.type === "Polygon") {
      const polygon = geometry as GeoJSON.Polygon;
      const totalVertices = polygon.coordinates.reduce(
        (sum, ring) => sum + ring.length,
        0,
      );

      // Only simplify very complex polygons (>500 vertices) and with minimal tolerance
      if (totalVertices > 500) {
        const simplified = turf.simplify(turf.feature(polygon), {
          tolerance,
          highQuality,
        });
        return simplified.geometry as T;
      }
    } else if (geometry.type === "LineString") {
      const linestring = geometry as GeoJSON.LineString;
      // Only simplify very complex lines (>200 points)
      if (linestring.coordinates.length > 200) {
        const simplified = turf.simplify(turf.feature(linestring), {
          tolerance,
          highQuality,
        });
        return simplified.geometry as T;
      }
    }

    return geometry;
  } catch (error) {
    console.warn("Error simplifying geometry in worker:", error);
    return geometry;
  }
}

// Martinez helper functions
function geoJsonToMartinez(polygon: GeoJSON.Polygon): martinez.Polygon {
  return polygon.coordinates.map((ring) =>
    ring.map((coord) => [coord[0], coord[1]] as martinez.Position),
  ) as martinez.Polygon;
}

function martinezToGeoJson(polygon: martinez.Polygon): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: polygon.map((ring) =>
      ring.map((coord) => [coord[0], coord[1]] as [number, number]),
    ),
  };
}

function lineToPolygon(
  line: GeoJSON.LineString,
  _width: number,
): GeoJSON.Polygon {
  // NOTE: Buffer width parameter is ignored to prevent area loss during subdivision
  // Use the line coordinates directly to create a zero-width polygon for intersection testing only
  const coords = line.coordinates;

  if (coords.length < 2) {
    throw new Error("LineString must have at least 2 coordinates");
  }

  // Create a polygon that follows the line - used only for geometric operations
  // No buffer is applied to preserve exact lot areas
  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

// Martinez-based polygon splitting
function splitPolygonWithMartinez(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    const polygonFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [polygon];
    const cuttingPolygons: GeoJSON.Polygon[] = [];

    // Convert split lines to cutting polygons
    splitLines.forEach((line) => {
      try {
        const cuttingPolygon = lineToPolygon(line.geometry, 0.00001); // Smaller buffer for precision
        cuttingPolygons.push(cuttingPolygon);
      } catch (error) {
        console.warn("Error creating cutting polygon from line:", error);
      }
    });

    let resultPolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [
      ...polygonFeatures,
    ];

    // Apply each cutting polygon
    cuttingPolygons.forEach((cuttingPoly) => {
      const newResults: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

      resultPolygons.forEach((poly) => {
        try {
          const martinezPoly = geoJsonToMartinez(poly.geometry);
          const martinezCutter = geoJsonToMartinez(cuttingPoly);

          const diffResults = martinez.diff(martinezPoly, martinezCutter);

          if (diffResults && diffResults.length > 0) {
            diffResults.forEach((resultPoly) => {
              const geoJsonResult = martinezToGeoJson(resultPoly);
              const area = turf.area(geoJsonResult);

              if (area > 1) {
                // Filter out tiny polygons
                newResults.push({
                  type: "Feature",
                  properties: {
                    ...poly.properties,
                    area: area,
                    splitMethod: "martinez",
                    lotNumber: newResults.length + 1,
                  },
                  geometry: geoJsonResult,
                });
              }
            });
          } else {
            newResults.push(poly);
          }
        } catch (error) {
          console.warn("Martinez splitting error for polygon:", error);
          newResults.push(poly);
        }
      });

      resultPolygons = newResults;
    });

    return resultPolygons.length > 1 ? resultPolygons : [polygon];
  } catch (error) {
    console.error("Martinez polygon splitting failed:", error);
    return [polygon];
  }
}

// Precision-preserving polygon split using exact intersection calculation
function precisionPreservingSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLine: GeoJSON.Feature<GeoJSON.LineString>,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    const intersections = findExactIntersections(
      polygon.geometry,
      splitLine.geometry,
    );

    if (intersections.length !== 2) {
      return [polygon];
    }

    const boundary = polygon.geometry.coordinates[0];
    const [int1, int2] = intersections;

    // Create two polygons by tracing exact boundaries with split line
    const poly1Coords: [number, number][] = [];
    const poly2Coords: [number, number][] = [];

    // First polygon: boundary from start to int1, then split line to int2, then boundary to end
    for (let i = 0; i <= int1.segmentIndex; i++) {
      poly1Coords.push(boundary[i]);
    }
    poly1Coords.push(int1.coords);
    poly1Coords.push(int2.coords);
    for (let i = int2.segmentIndex + 1; i < boundary.length; i++) {
      poly1Coords.push(boundary[i]);
    }
    if (
      poly1Coords[0][0] !== poly1Coords[poly1Coords.length - 1][0] ||
      poly1Coords[0][1] !== poly1Coords[poly1Coords.length - 1][1]
    ) {
      poly1Coords.push(poly1Coords[0]);
    }

    // Second polygon: int1 to int2 along boundary, back along split line
    poly2Coords.push(int1.coords);
    for (let i = int1.segmentIndex + 1; i <= int2.segmentIndex; i++) {
      poly2Coords.push(boundary[i]);
    }
    poly2Coords.push(int2.coords);
    if (
      poly2Coords[0][0] !== poly2Coords[poly2Coords.length - 1][0] ||
      poly2Coords[0][1] !== poly2Coords[poly2Coords.length - 1][1]
    ) {
      poly2Coords.push(poly2Coords[0]);
    }

    const poly1: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [cleanCoordinates(poly1Coords, 12)],
      },
      properties: {
        ...polygon.properties,
        method: "precision-preserving",
        lotNumber: 1,
      },
    };

    const poly2: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [cleanCoordinates(poly2Coords, 12)],
      },
      properties: {
        ...polygon.properties,
        method: "precision-preserving",
        lotNumber: 2,
      },
    };

    const area1 = turf.area(poly1);
    const area2 = turf.area(poly2);

    const results: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
    if (area1 > 5) {
      poly1.properties.area = Math.round(area1);
      results.push(poly1);
    }
    if (area2 > 5) {
      poly2.properties.area = Math.round(area2);
      results.push(poly2);
    }

    return results.length > 1 ? results : [polygon];
  } catch (error) {
    console.warn("Precision-preserving split error:", error);
    return [polygon];
  }
}

/**
 * Ultra-high precision coordinate handling (same as main thread)
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
 * Precision-first polygon splitting for worker
 */
function precisionLineSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLine: GeoJSON.Feature<GeoJSON.LineString>,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    const polygonLine = turf.polygonToLine(polygon);
    const intersections = turf.lineIntersect(polygonLine, splitLine);

    if (intersections.features.length < 2) {
      return [polygon];
    }

    // Ultra-small buffer with maximum precision
    const microBuffer = 0.000001;

    const bufferedLine = turf.buffer(splitLine, microBuffer, {
      units: "degrees",
      steps: 64,
    });

    if (bufferedLine && bufferedLine.geometry.type === "Polygon") {
      bufferedLine.geometry = cleanPolygonGeometry(bufferedLine.geometry, 12);
    }

    const difference = turf.difference(polygon, bufferedLine);

    if (difference && difference.geometry.type === "MultiPolygon") {
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
            method: "worker-precision",
            ...polygon.properties,
          },
        };

        const area = turf.area(splitPoly);
        if (area > 5) {
          results.push(splitPoly);
        }
      });

      return results.length > 1 ? results : [polygon];
    }

    return [polygon];
  } catch (error) {
    console.warn("Worker precision split error:", error);
    return [polygon];
  }
}

// Main polygon splitting function (precision-preserving, no buffering)
function robustPolygonSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  // Clean coordinates for maximum precision (don't simplify for cadastral data)
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

  let currentPolygons = [precisionPolygon];

  // Apply each split line using precision-preserving method (no buffering, exact area preservation)
  precisionSplitLines.forEach((line) => {
    const newPolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    currentPolygons.forEach((poly) => {
      // Primary method: precision-preserving split (uses exact intersection calculation)
      const precisionResults = precisionPreservingSplit(poly, line);

      if (precisionResults.length > 1) {
        newPolygons.push(...precisionResults);
      } else {
        // Fallback to exact geometric splitting if precision split doesn't work
        const exactResults = splitPolygonExactWorker(poly, line);

        if (exactResults.length > 1) {
          newPolygons.push(...exactResults);
        } else {
          // Final fallback to Martinez for complex cases
          const martinezResults = splitPolygonWithMartinez(poly, [line]);
          newPolygons.push(...martinezResults);
        }
      }
    });

    currentPolygons = newPolygons.length > 0 ? newPolygons : currentPolygons;
  });

  return currentPolygons;
}

// Worker message handler
self.onmessage = function (event: MessageEvent<WorkerMessage>) {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case "split-polygon": {
        const { polygon, splitLines } = payload as SplitPolygonPayload;
        const result = robustPolygonSplit(polygon, splitLines);

        self.postMessage({
          id,
          type: "split-polygon-result",
          payload: { success: true, result },
        });
        break;
      }

      case "simplify-geometry": {
        const { geometry, tolerance, highQuality } =
          payload as SimplifyGeometryPayload;
        const result = simplifyGeometryForPerformance(
          geometry,
          tolerance,
          highQuality,
        );

        self.postMessage({
          id,
          type: "simplify-geometry-result",
          payload: { success: true, result },
        });
        break;
      }

      default:
        self.postMessage({
          id,
          type: "error",
          payload: { success: false, error: `Unknown message type: ${type}` },
        });
    }
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      payload: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};

// Export types for main thread
export type { WorkerMessage, SplitPolygonPayload, SimplifyGeometryPayload };
