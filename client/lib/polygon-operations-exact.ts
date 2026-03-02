import * as turf from "@turf/turf";
import { devLog } from "./logger";

/**
 * Exact geometric polygon splitting using line intersection
 * No buffering - maintains perfect coordinate precision
 */

interface IntersectionPoint {
  coords: [number, number];
  segmentIndex: number;
  ratio: number; // Position along the segment (0-1)
}

/**
 * Find exact intersection points between a line and polygon boundary
 */
function findExactIntersections(
  polygon: GeoJSON.Polygon,
  line: GeoJSON.LineString,
): IntersectionPoint[] {
  const intersections: IntersectionPoint[] = [];
  const boundary = polygon.coordinates[0]; // Outer ring

  // Check each segment of the polygon boundary
  for (let i = 0; i < boundary.length - 1; i++) {
    const segmentStart = boundary[i];
    const segmentEnd = boundary[i + 1];

    // Check intersection with each segment of the split line
    for (let j = 0; j < line.coordinates.length - 1; j++) {
      const lineStart = line.coordinates[j];
      const lineEnd = line.coordinates[j + 1];

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

  // Sort intersections by segment index and ratio
  intersections.sort((a, b) => {
    if (a.segmentIndex !== b.segmentIndex) {
      return a.segmentIndex - b.segmentIndex;
    }
    return a.ratio - b.ratio;
  });

  return intersections;
}

/**
 * Calculate exact intersection between two line segments
 */
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
    return null; // Lines are parallel
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection is within both line segments
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

/**
 * Split polygon using exact geometric intersection points
 */
function splitPolygonExact(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLine: GeoJSON.Feature<GeoJSON.LineString>,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  try {
    devLog.log("🎯 Using exact geometric polygon splitting (no buffering)");

    const intersections = findExactIntersections(
      polygon.geometry,
      splitLine.geometry,
    );

    if (intersections.length < 2) {
      devLog.log("❌ Insufficient intersections for exact split");
      return [polygon];
    }

    devLog.log(`✅ Found ${intersections.length} exact intersection points`);

    // Create new polygons by tracing boundaries
    const resultPolygons = createPolygonsFromIntersections(
      polygon.geometry,
      intersections,
      splitLine.geometry,
    );

    if (resultPolygons.length > 1) {
      const features = resultPolygons.map((poly, index) => ({
        type: "Feature" as const,
        geometry: poly,
        properties: {
          lotNumber: index + 1,
          method: "exact-geometric",
          area: Math.round(
            turf.area({ type: "Feature", geometry: poly, properties: {} }),
          ),
          ...polygon.properties,
        },
      }));

      devLog.log(
        `✅ Exact geometric split: Created ${features.length} precise polygons`,
      );
      return features;
    }

    return [polygon];
  } catch (error) {
    devLog.error("❌ Exact geometric splitting failed:", error);
    return [polygon];
  }
}

/**
 * Create new polygons by tracing exact boundaries
 */
function createPolygonsFromIntersections(
  polygon: GeoJSON.Polygon,
  intersections: IntersectionPoint[],
  splitLine: GeoJSON.LineString,
): GeoJSON.Polygon[] {
  if (intersections.length !== 2) {
    // For now, handle simple case of exactly 2 intersections
    return [];
  }

  const boundary = polygon.coordinates[0];
  const [int1, int2] = intersections;

  // Create first polygon: from start to first intersection, along split line, from second intersection to start
  const poly1Coords: [number, number][] = [];

  // Add boundary vertices up to first intersection
  for (let i = 0; i <= int1.segmentIndex; i++) {
    poly1Coords.push(boundary[i]);
  }

  // Add first intersection point (exact coordinates)
  poly1Coords.push(int1.coords);

  // Add the split line between intersections (in correct direction)
  const lineSegments = getLineSegmentsBetweenPoints(
    splitLine,
    int1.coords,
    int2.coords,
  );
  poly1Coords.push(...lineSegments);

  // Add second intersection point
  poly1Coords.push(int2.coords);

  // Add remaining boundary vertices from second intersection back to start
  for (let i = int2.segmentIndex + 1; i < boundary.length; i++) {
    poly1Coords.push(boundary[i]);
  }

  // Close the polygon
  if (
    poly1Coords[0][0] !== poly1Coords[poly1Coords.length - 1][0] ||
    poly1Coords[0][1] !== poly1Coords[poly1Coords.length - 1][1]
  ) {
    poly1Coords.push(poly1Coords[0]);
  }

  // Create second polygon: the remaining area
  const poly2Coords: [number, number][] = [];

  // Add first intersection
  poly2Coords.push(int1.coords);

  // Add boundary vertices between intersections
  for (let i = int1.segmentIndex + 1; i <= int2.segmentIndex; i++) {
    poly2Coords.push(boundary[i]);
  }

  // Add second intersection
  poly2Coords.push(int2.coords);

  // Add split line in reverse direction
  const reverseLineSegments = getLineSegmentsBetweenPoints(
    splitLine,
    int2.coords,
    int1.coords,
  );
  poly2Coords.push(...reverseLineSegments);

  // Close the polygon
  if (
    poly2Coords[0][0] !== poly2Coords[poly2Coords.length - 1][0] ||
    poly2Coords[0][1] !== poly2Coords[poly2Coords.length - 1][1]
  ) {
    poly2Coords.push(poly2Coords[0]);
  }

  // Validate polygons have sufficient area
  const poly1: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [poly1Coords],
  };
  const poly2: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [poly2Coords],
  };

  const area1 = turf.area({ type: "Feature", geometry: poly1, properties: {} });
  const area2 = turf.area({ type: "Feature", geometry: poly2, properties: {} });

  const results: GeoJSON.Polygon[] = [];
  if (area1 > 5) results.push(poly1);
  if (area2 > 5) results.push(poly2);

  devLog.log(
    `📐 Created polygons with areas: ${Math.round(area1)}m², ${Math.round(area2)}m²`,
  );

  return results;
}

/**
 * Get line segment coordinates between two points
 */
function getLineSegmentsBetweenPoints(
  line: GeoJSON.LineString,
  startPoint: [number, number],
  endPoint: [number, number],
): [number, number][] {
  const segments: [number, number][] = [];

  // Find which segments of the line contain our points
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < line.coordinates.length - 1; i++) {
    const segStart = line.coordinates[i];
    const segEnd = line.coordinates[i + 1];

    if (pointOnSegment(startPoint, segStart, segEnd)) {
      startIndex = i;
    }
    if (pointOnSegment(endPoint, segStart, segEnd)) {
      endIndex = i;
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    // Add intermediate vertices
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    for (let i = minIndex + 1; i <= maxIndex; i++) {
      segments.push(line.coordinates[i]);
    }
  }

  return segments;
}

/**
 * Check if a point lies on a line segment
 */
function pointOnSegment(
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number],
): boolean {
  const tolerance = 1e-10;

  // Check if point is collinear with segment
  const crossProduct =
    (point[1] - segStart[1]) * (segEnd[0] - segStart[0]) -
    (point[0] - segStart[0]) * (segEnd[1] - segStart[1]);

  if (Math.abs(crossProduct) > tolerance) {
    return false;
  }

  // Check if point is within segment bounds
  const dotProduct =
    (point[0] - segStart[0]) * (segEnd[0] - segStart[0]) +
    (point[1] - segStart[1]) * (segEnd[1] - segStart[1]);

  const squaredLength =
    (segEnd[0] - segStart[0]) * (segEnd[0] - segStart[0]) +
    (segEnd[1] - segStart[1]) * (segEnd[1] - segStart[1]);

  return dotProduct >= 0 && dotProduct <= squaredLength;
}

/**
 * Split polygon using multiple lines with exact geometry
 */
export function splitPolygonExactMultiple(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  let currentPolygons = [polygon];

  splitLines.forEach((line, index) => {
    devLog.log(
      `🎯 Applying exact split line ${index + 1}/${splitLines.length}`,
    );

    const newPolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    currentPolygons.forEach((poly) => {
      const splitResult = splitPolygonExact(poly, line);
      newPolygons.push(...splitResult);
    });

    currentPolygons = newPolygons;
  });

  return currentPolygons;
}

/**
 * Main export function for exact polygon splitting
 */
export function exactPolygonSplit(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  return splitPolygonExactMultiple(polygon, splitLines);
}
