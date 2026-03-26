/**
 * Auto-Subdivision Algorithm for WA Cadastral Parcels
 *
 * Generates side-by-side and battleaxe lot configurations
 * based on parcel geometry and R-Code zoning requirements.
 */

import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { getZoningRequirements } from "./zoning-requirements";

const METERS_PER_DEGREE = 111320;
const EXTEND_BIG = 2000 / METERS_PER_DEGREE; // 2km extension for rectangle clipping
const BATTLEAXE_HANDLE_WIDTH_M = 3;

// =====================
// Public types
// =====================

export interface AutoLot {
  id: string;
  name: string;
  type: "private" | "common-property";
  geometry: GeoJSON.Polygon;
  area: number; // m²
  frontage: number; // m
  compliant: boolean;
  issues: string[];
}

export interface AutoSubdivisionConfig {
  id: string;
  type: "side-by-side" | "battleaxe";
  name: string;
  description: string;
  lots: AutoLot[];
  totalLots: number;
  privateLotCount: number;
  overallCompliant: boolean;
  frontEdgeIndex: number;
  widthM: number;
  depthM: number;
}

export interface DetectedEdge {
  index: number;
  start: [number, number];
  end: [number, number];
  length: number; // meters
  midpoint: [number, number];
}

export interface FrontBoundaryInfo {
  detectedIndex: number;
  candidateIndices: number[];
  edges: DetectedEdge[];
  widthM: number;
  depthM: number;
}

// =====================
// Front boundary detection
// =====================

export function detectFrontBoundary(
  polygon: GeoJSON.Polygon
): FrontBoundaryInfo {
  const coords = polygon.coordinates[0];
  const n = coords.length - 1;

  const edges: DetectedEdge[] = [];
  for (let i = 0; i < n; i++) {
    const start = coords[i] as [number, number];
    const end = coords[(i + 1) % n] as [number, number];
    const length = turf.distance(turf.point(start), turf.point(end), {
      units: "meters",
    });
    const midpoint: [number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
    ];
    edges.push({ index: i, start, end, length, midpoint });
  }

  // Sort by length ascending — shorter edges are typically front/rear
  const sorted = [...edges].sort((a, b) => a.length - b.length);

  // Take the shorter half as candidates
  const candidateCount = Math.max(2, Math.ceil(n / 3));
  const candidates = sorted.slice(0, candidateCount);

  // Among candidates, pick the most southerly midpoint
  // (Perth is ~32°S — street-facing edges tend to be the southerly ones)
  candidates.sort((a, b) => a.midpoint[1] - b.midpoint[1]);
  const detected = candidates[0];

  const parcelFeature = turf.feature(polygon);
  const { depthM } = computeLotDimensions(parcelFeature, detected.index);

  return {
    detectedIndex: detected.index,
    candidateIndices: candidates.map((c) => c.index),
    edges,
    widthM: Math.round(detected.length),
    depthM: Math.round(depthM),
  };
}

// =====================
// Internal geometry helpers
// =====================

function computeLotDimensions(
  parcel: Feature<Polygon>,
  frontEdgeIndex: number
): { widthM: number; depthM: number } {
  const coords = parcel.geometry.coordinates[0];
  const n = coords.length - 1;
  const frontStart = coords[frontEdgeIndex] as [number, number];
  const frontEnd = coords[(frontEdgeIndex + 1) % n] as [number, number];

  const { p_deg } = getDirectionVectors(
    frontStart,
    frontEnd,
    parcel.geometry
  );

  const depthProjs = coords.slice(0, n).map((c) => {
    const dc = [c[0] - frontStart[0], c[1] - frontStart[1]];
    return dc[0] * p_deg[0] + dc[1] * p_deg[1];
  });

  const maxDepth_deg = Math.max(...depthProjs);
  const widthM = turf.distance(
    turf.point(frontStart),
    turf.point(frontEnd),
    { units: "meters" }
  );
  const depthM = maxDepth_deg * METERS_PER_DEGREE;

  return { widthM, depthM };
}

function getDirectionVectors(
  frontStart: [number, number],
  frontEnd: [number, number],
  polygon: GeoJSON.Polygon
): { u_deg: number[]; p_deg: number[] } {
  const dx = frontEnd[0] - frontStart[0];
  const dy = frontEnd[1] - frontStart[1];
  const len = Math.sqrt(dx * dx + dy * dy);

  const u_deg = [dx / len, dy / len];

  // Two perpendicular candidates
  const p1 = [-dy / len, dx / len];
  const p2 = [dy / len, -dx / len];

  // Pick the one pointing INTO the polygon
  const centroid = turf
    .centroid(turf.feature(polygon))
    .geometry.coordinates;
  const frontMid = [
    (frontStart[0] + frontEnd[0]) / 2,
    (frontStart[1] + frontEnd[1]) / 2,
  ];
  const toCentroid = [centroid[0] - frontMid[0], centroid[1] - frontMid[1]];
  const dot1 = toCentroid[0] * p1[0] + toCentroid[1] * p1[1];
  const p_deg = dot1 > 0 ? p1 : p2;

  return { u_deg, p_deg };
}

/**
 * Clip a width-direction slice of the parcel.
 * uStart_m and uEnd_m are measured in metres from frontStart along the front edge.
 */
function createWidthSlice(
  parcelPolygon: Feature<Polygon>,
  frontStart: [number, number],
  u_deg: number[],
  p_deg: number[],
  uStart_m: number,
  uEnd_m: number
): Feature<Polygon> | null {
  const uStart_deg = uStart_m / METERS_PER_DEGREE;
  const uEnd_deg = uEnd_m / METERS_PER_DEGREE;

  const p1: [number, number] = [
    frontStart[0] + uStart_deg * u_deg[0],
    frontStart[1] + uStart_deg * u_deg[1],
  ];
  const p2: [number, number] = [
    frontStart[0] + uEnd_deg * u_deg[0],
    frontStart[1] + uEnd_deg * u_deg[1],
  ];

  const corners: [number, number][] = [
    [p1[0] - EXTEND_BIG * p_deg[0], p1[1] - EXTEND_BIG * p_deg[1]],
    [p2[0] - EXTEND_BIG * p_deg[0], p2[1] - EXTEND_BIG * p_deg[1]],
    [p2[0] + EXTEND_BIG * p_deg[0], p2[1] + EXTEND_BIG * p_deg[1]],
    [p1[0] + EXTEND_BIG * p_deg[0], p1[1] + EXTEND_BIG * p_deg[1]],
    [p1[0] - EXTEND_BIG * p_deg[0], p1[1] - EXTEND_BIG * p_deg[1]],
  ];

  return intersectWithParcel(parcelPolygon, corners);
}

/**
 * Clip a rectangle bounded in BOTH width and depth dimensions.
 */
function createWidthDepthSlice(
  parcelPolygon: Feature<Polygon>,
  frontStart: [number, number],
  u_deg: number[],
  p_deg: number[],
  uStart_m: number,
  uEnd_m: number,
  dStart_m: number,
  dEnd_m: number
): Feature<Polygon> | null {
  const uS = uStart_m / METERS_PER_DEGREE;
  const uE = uEnd_m / METERS_PER_DEGREE;
  const dS = dStart_m / METERS_PER_DEGREE;
  const dE = dEnd_m / METERS_PER_DEGREE;

  const corner = (u: number, d: number): [number, number] => [
    frontStart[0] + u * u_deg[0] + d * p_deg[0],
    frontStart[1] + u * u_deg[1] + d * p_deg[1],
  ];

  const corners: [number, number][] = [
    corner(uS, dS),
    corner(uE, dS),
    corner(uE, dE),
    corner(uS, dE),
    corner(uS, dS),
  ];

  return intersectWithParcel(parcelPolygon, corners);
}

function intersectWithParcel(
  parcelPolygon: Feature<Polygon>,
  corners: [number, number][]
): Feature<Polygon> | null {
  try {
    const sliceRect = turf.polygon([corners]);
    const intersection = turf.intersect(
      turf.featureCollection([parcelPolygon, sliceRect])
    );
    if (intersection?.geometry.type === "Polygon") {
      return intersection as Feature<Polygon>;
    }
  } catch {
    // intersection failed — irregular lot edge case
  }
  return null;
}

function checkCompliance(
  area: number,
  frontage: number,
  minArea: number,
  minFrontage: number
): { compliant: boolean; issues: string[] } {
  const issues: string[] = [];
  if (area < minArea)
    issues.push(`Area ${Math.round(area)} m² < min ${minArea} m²`);
  if (minFrontage > 0 && frontage < minFrontage)
    issues.push(
      `Frontage ${Math.round(frontage)} m < min ${minFrontage} m`
    );
  return { compliant: issues.length === 0, issues };
}

// =====================
// Side-by-side config
// =====================

function generateSideBySide(
  parcelPolygon: Feature<Polygon>,
  frontEdgeIndex: number,
  totalLots: number,
  minArea: number,
  minFrontage: number
): AutoSubdivisionConfig | null {
  const coords = parcelPolygon.geometry.coordinates[0];
  const n = coords.length - 1;
  const frontStart = coords[frontEdgeIndex] as [number, number];
  const frontEnd = coords[(frontEdgeIndex + 1) % n] as [number, number];

  const { u_deg, p_deg } = getDirectionVectors(
    frontStart,
    frontEnd,
    parcelPolygon.geometry
  );

  const widthM = turf.distance(
    turf.point(frontStart),
    turf.point(frontEnd),
    { units: "meters" }
  );
  const { depthM } = computeLotDimensions(parcelPolygon, frontEdgeIndex);
  const lotWidthM = widthM / totalLots;

  const lots: AutoLot[] = [];

  for (let i = 0; i < totalLots; i++) {
    const uStart_m = i * lotWidthM;
    const uEnd_m = (i + 1) * lotWidthM;

    const slice = createWidthSlice(
      parcelPolygon,
      frontStart,
      u_deg,
      p_deg,
      uStart_m,
      uEnd_m
    );
    if (!slice) return null;

    const area = turf.area(slice);
    const frontage = lotWidthM;
    const { compliant, issues } = checkCompliance(
      area,
      frontage,
      minArea,
      minFrontage
    );

    lots.push({
      id: `lot_${i + 1}`,
      name: `Lot ${i + 1}`,
      type: "private",
      geometry: slice.geometry,
      area: Math.round(area),
      frontage: Math.round(frontage),
      compliant,
      issues,
    });
  }

  const overallCompliant = lots.every((l) => l.compliant);

  return {
    id: "side-by-side",
    type: "side-by-side",
    name: "Side by Side",
    description: `${totalLots} equal lots, each with ${Math.round(lotWidthM)} m street frontage`,
    lots,
    totalLots: lots.length,
    privateLotCount: lots.length,
    overallCompliant,
    frontEdgeIndex,
    widthM: Math.round(widthM),
    depthM: Math.round(depthM),
  };
}

// =====================
// Battleaxe config
// =====================

function generateBattleaxe(
  parcelPolygon: Feature<Polygon>,
  frontEdgeIndex: number,
  totalLots: number,
  minArea: number,
  minFrontage: number
): AutoSubdivisionConfig | null {
  const coords = parcelPolygon.geometry.coordinates[0];
  const n = coords.length - 1;
  const frontStart = coords[frontEdgeIndex] as [number, number];
  const frontEnd = coords[(frontEdgeIndex + 1) % n] as [number, number];

  const { u_deg, p_deg } = getDirectionVectors(
    frontStart,
    frontEnd,
    parcelPolygon.geometry
  );

  const widthM = turf.distance(
    turf.point(frontStart),
    turf.point(frontEnd),
    { units: "meters" }
  );
  const { depthM } = computeLotDimensions(parcelPolygon, frontEdgeIndex);

  // Handle strip on the right side of the front edge
  const handleW = BATTLEAXE_HANDLE_WIDTH_M;
  const mainW = widthM - handleW;

  if (mainW < minFrontage + 1) {
    // Not enough width to fit handle + compliant lots
    return null;
  }

  // Depth divided equally among all private lots
  const lotDepthM = depthM / totalLots;

  const lots: AutoLot[] = [];

  // Private lots — stacked front-to-rear within the main block
  for (let i = 0; i < totalLots; i++) {
    const dStart_m = i * lotDepthM;
    const dEnd_m = (i + 1) * lotDepthM;

    const slice = createWidthDepthSlice(
      parcelPolygon,
      frontStart,
      u_deg,
      p_deg,
      0,
      mainW,
      dStart_m,
      dEnd_m
    );
    if (!slice) return null;

    const area = turf.area(slice);
    const frontage = i === 0 ? mainW : mainW; // width of the main block
    const issues: string[] = [];

    if (area < minArea)
      issues.push(`Area ${Math.round(area)} m² < min ${minArea} m²`);

    // Front lot has direct street frontage; rear lots access via handle
    if (i === 0 && mainW < minFrontage)
      issues.push(`Frontage ${Math.round(mainW)} m < min ${minFrontage} m`);

    lots.push({
      id: `lot_${i + 1}`,
      name: i === 0 ? `Lot 1 (Front)` : `Lot ${i + 1} (Rear)`,
      type: "private",
      geometry: slice.geometry,
      area: Math.round(area),
      frontage: Math.round(frontage),
      compliant: issues.length === 0,
      issues,
    });
  }

  // Handle / access strip (Common Property) — full depth, right side
  const handleSlice = createWidthSlice(
    parcelPolygon,
    frontStart,
    u_deg,
    p_deg,
    mainW,
    widthM
  );

  if (handleSlice) {
    const handleArea = turf.area(handleSlice);
    lots.push({
      id: "cp_handle",
      name: "Access Handle (CP)",
      type: "common-property",
      geometry: handleSlice.geometry,
      area: Math.round(handleArea),
      frontage: handleW,
      compliant: true,
      issues: [],
    });
  }

  const privateLots = lots.filter((l) => l.type === "private");
  const overallCompliant = privateLots.every((l) => l.compliant);

  return {
    id: "battleaxe",
    type: "battleaxe",
    name: "Battleaxe / Flag Lot",
    description: `${totalLots} lots stacked front-to-rear, rear lots access via ${handleW} m wide handle (Common Property)`,
    lots,
    totalLots: lots.length,
    privateLotCount: privateLots.length,
    overallCompliant,
    frontEdgeIndex,
    widthM: Math.round(widthM),
    depthM: Math.round(depthM),
  };
}

// =====================
// Main entry point
// =====================

export function generateAutoSubdivisionConfigs(
  parcelPolygon: Feature<Polygon>,
  targetLots: number,
  rCode: string,
  frontEdgeIndex: number
): AutoSubdivisionConfig[] {
  const zoningReqs = getZoningRequirements(rCode, "single");
  const req = zoningReqs[0] ?? {
    minSiteArea: 350,
    avgSiteArea: 450,
    minFrontage: 10,
  };
  const minArea = req.minSiteArea;
  const minFrontage = req.minFrontage ?? 6;

  const configs: AutoSubdivisionConfig[] = [];

  const sideBySide = generateSideBySide(
    parcelPolygon,
    frontEdgeIndex,
    targetLots,
    minArea,
    minFrontage
  );
  if (sideBySide) configs.push(sideBySide);

  if (targetLots >= 2) {
    const battleaxe = generateBattleaxe(
      parcelPolygon,
      frontEdgeIndex,
      targetLots,
      minArea,
      minFrontage
    );
    if (battleaxe) configs.push(battleaxe);
  }

  return configs;
}
