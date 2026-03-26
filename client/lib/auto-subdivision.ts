/**
 * Auto-Subdivision Algorithm for WA Cadastral Parcels
 *
 * Generates side-by-side, battleaxe, and strata-CP lot configurations
 * using intersection-based geometry that fills the entire parcel.
 */

import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { getZoningRequirements } from "./zoning-requirements";

const METERS_PER_DEGREE = 111320;
// Large extension that guarantees coverage of any suburban lot (<2km)
const BIG = 2000 / METERS_PER_DEGREE;
const BATTLEAXE_HANDLE_WIDTH_M = 3;
const STRATA_CP_WIDTH_M = 4;

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
  type: "side-by-side" | "battleaxe" | "strata-access" | "strata-cp";
  name: string;
  description: string;
  lots: AutoLot[];
  totalLots: number;
  privateLotCount: number;
  overallCompliant: boolean;
  frontEdgeIndex: number;
  widthM: number;
  depthM: number;
  /** Which axis the interactive handles slide along */
  divisionType: "width" | "depth";
  /** Division line positions in metres from frontStart (along the division axis) */
  divisionPointsM: number[];
  /** For battleaxe: handle width in metres */
  handleWidthM?: number;
  /** For strata-cp: CP driveway width in metres */
  cpWidthM?: number;
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

  // Use all meaningful edges (skip slivers < 2 m)
  const meaningful = edges.filter((e) => e.length > 2);

  // For angled blocks we can't just use latitude — use a score that combines:
  //   1. How southerly the midpoint is (primary for Perth)
  //   2. How "exterior-facing" the edge is (edges whose outward normal points most south)
  //   3. Prefer edges that are part of the boundary of the parcel's bounding box (convex hull face)
  const bbox = turf.bbox(turf.feature(polygon));
  const bboxMinLat = bbox[1];
  const bboxMaxLat = bbox[3];
  const bboxLatRange = bboxMaxLat - bboxMinLat || 1;

  // For each edge, compute a "street-facing score":
  //   lower = more likely to be the street
  const scored = meaningful.map((e) => {
    // Normalised distance from the south boundary of the bounding box
    const latNorm = (e.midpoint[1] - bboxMinLat) / bboxLatRange; // 0 = south, 1 = north

    // Edge direction: how horizontal (east-west) is the edge?
    // A perfectly horizontal edge has |dy|/(|dx|+|dy|) = 0
    const dx = Math.abs(e.end[0] - e.start[0]);
    const dy = Math.abs(e.end[1] - e.start[1]);
    const horizontality = dy / (dx + dy + 1e-9); // 0=horizontal, 1=vertical

    // Combined score: weight southerliness heavily, horizontality as tiebreaker
    // For angled blocks the horizontality matters less, so we cap its contribution
    return { edge: e, score: latNorm * 3 + horizontality * 0.5 };
  });

  scored.sort((a, b) => a.score - b.score);
  const detected = scored[0].edge;

  const parcelFeature = turf.feature(polygon);
  const { depthM } = computeLotDimensions(parcelFeature, detected.index);

  // Candidates sorted by score (most likely first)
  const candidatesSorted = scored.map((s) => s.edge);

  return {
    detectedIndex: detected.index,
    candidateIndices: candidatesSorted.map((e) => e.index),
    edges,
    widthM: Math.round(detected.length),
    depthM: Math.round(depthM),
  };
}

/**
 * Return the edge index that is most perpendicular to the current front edge
 * (used for 90° rotation).
 */
export function getRotatedFrontEdgeIndex(
  polygon: GeoJSON.Polygon,
  currentEdgeIndex: number,
  rotationStep: number = 1
): number {
  const coords = polygon.coordinates[0];
  const n = coords.length - 1;

  const frontStart = coords[currentEdgeIndex] as [number, number];
  const frontEnd = coords[(currentEdgeIndex + 1) % n] as [number, number];
  const dx = frontEnd[0] - frontStart[0];
  const dy = frontEnd[1] - frontStart[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const u_front = [dx / len, dy / len];

  // Build all other edge directions
  const others: { index: number; dot: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i === currentEdgeIndex) continue;
    const s = coords[i] as [number, number];
    const e = coords[(i + 1) % n] as [number, number];
    const ex = e[0] - s[0];
    const ey = e[1] - s[1];
    const el = Math.sqrt(ex * ex + ey * ey);
    if (el < 2 / METERS_PER_DEGREE) continue;
    const dot = Math.abs(u_front[0] * (ex / el) + u_front[1] * (ey / el));
    others.push({ index: i, dot });
  }

  // dot ≈ 0 → perpendicular, dot ≈ 1 → parallel
  // Sort by most perpendicular (lowest dot)
  others.sort((a, b) => a.dot - b.dot);

  const step = ((rotationStep - 1) % Math.max(others.length, 1));
  return others[step]?.index ?? currentEdgeIndex;
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

  const { p_deg } = getDirectionVectors(frontStart, frontEnd, parcel.geometry);

  const depthProjs = coords.slice(0, n).map((c) => {
    const dc = [c[0] - frontStart[0], c[1] - frontStart[1]];
    return dc[0] * p_deg[0] + dc[1] * p_deg[1];
  });

  const maxDepth_deg = Math.max(...depthProjs);
  const widthM = turf.distance(turf.point(frontStart), turf.point(frontEnd), {
    units: "meters",
  });
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

  const p1 = [-dy / len, dx / len];
  const p2 = [dy / len, -dx / len];

  const centroid = turf.centroid(turf.feature(polygon)).geometry.coordinates;
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
 * Clip a strip that spans [uStart_m, uEnd_m] along the front edge
 * and extends infinitely (BIG) in the depth direction.
 * Pass uStart_m = -BIG_M or uEnd_m = widthM + BIG_M to cover irregular parcel corners.
 */
function createWidthSlice(
  parcelPolygon: Feature<Polygon>,
  frontStart: [number, number],
  u_deg: number[],
  p_deg: number[],
  uStart_m: number,
  uEnd_m: number
): Feature<Polygon> | null {
  const uS = uStart_m / METERS_PER_DEGREE;
  const uE = uEnd_m / METERS_PER_DEGREE;

  const p1: [number, number] = [
    frontStart[0] + uS * u_deg[0],
    frontStart[1] + uS * u_deg[1],
  ];
  const p2: [number, number] = [
    frontStart[0] + uE * u_deg[0],
    frontStart[1] + uE * u_deg[1],
  ];

  const corners: [number, number][] = [
    [p1[0] - BIG * p_deg[0], p1[1] - BIG * p_deg[1]],
    [p2[0] - BIG * p_deg[0], p2[1] - BIG * p_deg[1]],
    [p2[0] + BIG * p_deg[0], p2[1] + BIG * p_deg[1]],
    [p1[0] + BIG * p_deg[0], p1[1] + BIG * p_deg[1]],
    [p1[0] - BIG * p_deg[0], p1[1] - BIG * p_deg[1]],
  ];

  return intersectWithParcel(parcelPolygon, corners);
}

/**
 * Clip a rectangle bounded in BOTH width [uStart_m, uEnd_m] and depth [dStart_m, dEnd_m].
 * Use BIG values for the boundary lots to ensure edge coverage.
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
    // intersection failed — skip
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

// Metres of BIG extension — large enough to cover any suburban lot
const BIG_M = 2000;

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

  const widthM = turf.distance(turf.point(frontStart), turf.point(frontEnd), {
    units: "meters",
  });
  const { depthM } = computeLotDimensions(parcelPolygon, frontEdgeIndex);
  const lotWidthM = widthM / totalLots;

  const lots: AutoLot[] = [];
  const divisionPointsM: number[] = [];

  for (let i = 0; i < totalLots; i++) {
    // Extend first lot left and last lot right to capture any irregular parcel edges
    const uStart_m = i === 0 ? -BIG_M : i * lotWidthM;
    const uEnd_m = i === totalLots - 1 ? widthM + BIG_M : (i + 1) * lotWidthM;

    if (i < totalLots - 1) divisionPointsM.push((i + 1) * lotWidthM);

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
    name: "All Street Facing",
    description: `${totalLots} lots, each with ${Math.round(lotWidthM)} m direct street frontage`,
    lots,
    totalLots: lots.length,
    privateLotCount: lots.length,
    overallCompliant,
    frontEdgeIndex,
    widthM: Math.round(widthM),
    depthM: Math.round(depthM),
    divisionType: "width",
    divisionPointsM,
  };
}

// =====================
// Battleaxe — strictly 1 front lot + 3m handle + 1 rear lot (always 2 private lots)
// =====================

function generateBattleaxe(
  parcelPolygon: Feature<Polygon>,
  frontEdgeIndex: number,
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

  const widthM = turf.distance(turf.point(frontStart), turf.point(frontEnd), {
    units: "meters",
  });
  const { depthM } = computeLotDimensions(parcelPolygon, frontEdgeIndex);

  const handleW = BATTLEAXE_HANDLE_WIDTH_M;
  const mainW = widthM - handleW;

  if (mainW < Math.max(minFrontage, 6) + 1) return null;

  const halfDepth = depthM / 2;
  const lots: AutoLot[] = [];

  // Front lot: first half of depth, main block width
  const frontSlice = createWidthDepthSlice(
    parcelPolygon, frontStart, u_deg, p_deg,
    -BIG_M, mainW,
    -BIG_M, halfDepth
  );
  if (!frontSlice) return null;
  const frontArea = turf.area(frontSlice);
  const frontIssues: string[] = [];
  if (frontArea < minArea) frontIssues.push(`Area ${Math.round(frontArea)} m² < min ${minArea} m²`);
  if (mainW < minFrontage) frontIssues.push(`Frontage ${Math.round(mainW)} m < min ${minFrontage} m`);
  lots.push({
    id: "lot_1",
    name: "Lot 1 (Street)",
    type: "private",
    geometry: frontSlice.geometry,
    area: Math.round(frontArea),
    frontage: Math.round(mainW),
    compliant: frontIssues.length === 0,
    issues: frontIssues,
  });

  // Rear lot: second half of depth, main block width
  const rearSlice = createWidthDepthSlice(
    parcelPolygon, frontStart, u_deg, p_deg,
    -BIG_M, mainW,
    halfDepth, depthM + BIG_M
  );
  if (!rearSlice) return null;
  const rearArea = turf.area(rearSlice);
  const rearIssues: string[] = [];
  if (rearArea < minArea) rearIssues.push(`Area ${Math.round(rearArea)} m² < min ${minArea} m²`);
  lots.push({
    id: "lot_2",
    name: "Lot 2 (Rear)",
    type: "private",
    geometry: rearSlice.geometry,
    area: Math.round(rearArea),
    frontage: 0,
    compliant: rearIssues.length === 0,
    issues: rearIssues,
  });

  // Access handle — right side, full depth
  const handleSlice = createWidthSlice(
    parcelPolygon, frontStart, u_deg, p_deg,
    mainW, widthM + BIG_M
  );
  if (handleSlice) {
    lots.push({
      id: "cp_handle",
      name: "Access Handle (CP)",
      type: "common-property",
      geometry: handleSlice.geometry,
      area: Math.round(turf.area(handleSlice)),
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
    description: `1 street lot + 1 rear lot, accessed via ${handleW} m side handle (CP)`,
    lots,
    totalLots: lots.length,
    privateLotCount: 2,
    overallCompliant,
    frontEdgeIndex,
    widthM: Math.round(widthM),
    depthM: Math.round(depthM),
    divisionType: "depth",
    divisionPointsM: [halfDepth],
    handleWidthM: handleW,
  };
}

// =====================
// Strata Side Access — N lots stacked front-to-rear + side handle (CP)
// =====================

function generateStrataAccess(
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

  const widthM = turf.distance(turf.point(frontStart), turf.point(frontEnd), {
    units: "meters",
  });
  const { depthM } = computeLotDimensions(parcelPolygon, frontEdgeIndex);

  const handleW = BATTLEAXE_HANDLE_WIDTH_M;
  const mainW = widthM - handleW;

  if (mainW < Math.max(minFrontage, 6) + 1) return null;

  const lotDepthM = depthM / totalLots;
  const lots: AutoLot[] = [];
  const divisionPointsM: number[] = [];

  for (let i = 0; i < totalLots; i++) {
    const dStart_m = i === 0 ? -BIG_M : i * lotDepthM;
    const dEnd_m = i === totalLots - 1 ? depthM + BIG_M : (i + 1) * lotDepthM;

    if (i < totalLots - 1) divisionPointsM.push((i + 1) * lotDepthM);

    const slice = createWidthDepthSlice(
      parcelPolygon, frontStart, u_deg, p_deg,
      -BIG_M, mainW,
      dStart_m, dEnd_m
    );
    if (!slice) return null;

    const area = turf.area(slice);
    const issues: string[] = [];
    if (area < minArea) issues.push(`Area ${Math.round(area)} m² < min ${minArea} m²`);
    if (i === 0 && mainW < minFrontage)
      issues.push(`Frontage ${Math.round(mainW)} m < min ${minFrontage} m`);

    lots.push({
      id: `lot_${i + 1}`,
      name: i === 0 ? `Lot 1 (Street)` : `Lot ${i + 1} (Rear)`,
      type: "private",
      geometry: slice.geometry,
      area: Math.round(area),
      frontage: i === 0 ? Math.round(mainW) : 0,
      compliant: issues.length === 0,
      issues,
    });
  }

  const handleSlice = createWidthSlice(
    parcelPolygon, frontStart, u_deg, p_deg,
    mainW, widthM + BIG_M
  );
  if (handleSlice) {
    lots.push({
      id: "cp_handle",
      name: "Side Driveway (CP)",
      type: "common-property",
      geometry: handleSlice.geometry,
      area: Math.round(turf.area(handleSlice)),
      frontage: handleW,
      compliant: true,
      issues: [],
    });
  }

  const privateLots = lots.filter((l) => l.type === "private");
  const overallCompliant = privateLots.every((l) => l.compliant);

  return {
    id: "strata-access",
    type: "strata-access",
    name: "Strata — Side Access",
    description: `${totalLots} lots stacked front-to-rear, shared ${handleW} m side driveway (CP)`,
    lots,
    totalLots: lots.length,
    privateLotCount: privateLots.length,
    overallCompliant,
    frontEdgeIndex,
    widthM: Math.round(widthM),
    depthM: Math.round(depthM),
    divisionType: "depth",
    divisionPointsM,
    handleWidthM: handleW,
  };
}

// =====================
// Strata CP (central driveway) config
// =====================

function generateStrataCP(
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

  const widthM = turf.distance(turf.point(frontStart), turf.point(frontEnd), {
    units: "meters",
  });
  const { depthM } = computeLotDimensions(parcelPolygon, frontEdgeIndex);

  const cpW = STRATA_CP_WIDTH_M;
  const halfCP = cpW / 2;
  const centerU = widthM / 2;

  // Left block: from left edge to centre minus half-CP
  const leftW = centerU - halfCP;
  // Right block: from centre plus half-CP to right edge
  const rightW = widthM - (centerU + halfCP);

  if (leftW < 4 || rightW < 4) return null; // Too narrow

  // How many lots on each side
  const leftCount = Math.ceil(totalLots / 2);
  const rightCount = Math.floor(totalLots / 2);

  const lots: AutoLot[] = [];
  const divisionPointsM: number[] = [];

  // Left side lots (stacked depth if >1)
  const leftDepthPerLot = depthM / leftCount;
  for (let i = 0; i < leftCount; i++) {
    const dStart_m = i === 0 ? -BIG_M : i * leftDepthPerLot;
    const dEnd_m =
      i === leftCount - 1 ? depthM + BIG_M : (i + 1) * leftDepthPerLot;

    const slice = createWidthDepthSlice(
      parcelPolygon,
      frontStart,
      u_deg,
      p_deg,
      -BIG_M,
      centerU - halfCP,
      dStart_m,
      dEnd_m
    );
    if (!slice) return null;

    const area = turf.area(slice);
    const { compliant, issues } = checkCompliance(
      area,
      leftW,
      minArea,
      minFrontage
    );

    lots.push({
      id: `lot_left_${i + 1}`,
      name: `Lot ${i + 1}`,
      type: "private",
      geometry: slice.geometry,
      area: Math.round(area),
      frontage: Math.round(leftW),
      compliant,
      issues,
    });

    if (i < leftCount - 1) divisionPointsM.push((i + 1) * leftDepthPerLot);
  }

  // Right side lots (stacked depth if >1)
  const rightDepthPerLot = rightCount > 0 ? depthM / rightCount : depthM;
  for (let i = 0; i < rightCount; i++) {
    const dStart_m = i === 0 ? -BIG_M : i * rightDepthPerLot;
    const dEnd_m =
      i === rightCount - 1 ? depthM + BIG_M : (i + 1) * rightDepthPerLot;

    const slice = createWidthDepthSlice(
      parcelPolygon,
      frontStart,
      u_deg,
      p_deg,
      centerU + halfCP,
      widthM + BIG_M,
      dStart_m,
      dEnd_m
    );
    if (!slice) return null;

    const area = turf.area(slice);
    const { compliant, issues } = checkCompliance(
      area,
      rightW,
      minArea,
      minFrontage
    );

    lots.push({
      id: `lot_right_${i + 1}`,
      name: `Lot ${leftCount + i + 1}`,
      type: "private",
      geometry: slice.geometry,
      area: Math.round(area),
      frontage: Math.round(rightW),
      compliant,
      issues,
    });
  }

  // Central CP driveway — full depth, centre strip
  const cpSlice = createWidthSlice(
    parcelPolygon,
    frontStart,
    u_deg,
    p_deg,
    centerU - halfCP,
    centerU + halfCP
  );
  if (cpSlice) {
    const cpArea = turf.area(cpSlice);
    lots.push({
      id: "cp_driveway",
      name: "Driveway (CP)",
      type: "common-property",
      geometry: cpSlice.geometry,
      area: Math.round(cpArea),
      frontage: cpW,
      compliant: true,
      issues: [],
    });
  }

  const privateLots = lots.filter((l) => l.type === "private");
  const overallCompliant = privateLots.every((l) => l.compliant);

  return {
    id: "strata-cp",
    type: "strata-cp",
    name: "Strata — Central Access",
    description: `${totalLots} lots sharing a ${cpW} m wide central driveway (CP)`,
    lots,
    totalLots: lots.length,
    privateLotCount: privateLots.length,
    overallCompliant,
    frontEdgeIndex,
    widthM: Math.round(widthM),
    depthM: Math.round(depthM),
    divisionType: "width",
    divisionPointsM,
    cpWidthM: cpW,
  };
}

// =====================
// Rebuild a config from updated division points (for draggable handles)
// =====================

export function rebuildConfigFromDivisions(
  config: AutoSubdivisionConfig,
  parcelPolygon: Feature<Polygon>,
  newDivisions: number[],
  rCode: string
): AutoSubdivisionConfig | null {
  const zoningReqs = getZoningRequirements(rCode, "single");
  const req = zoningReqs[0] ?? { minSiteArea: 350, minFrontage: 10 };
  const minArea = req.minSiteArea;
  const minFrontage = req.minFrontage ?? 6;

  const coords = parcelPolygon.geometry.coordinates[0];
  const n = coords.length - 1;
  const frontStart = coords[config.frontEdgeIndex] as [number, number];
  const frontEnd =
    coords[(config.frontEdgeIndex + 1) % n] as [number, number];
  const { u_deg, p_deg } = getDirectionVectors(
    frontStart,
    frontEnd,
    parcelPolygon.geometry
  );
  const { widthM, depthM } = computeLotDimensions(
    parcelPolygon,
    config.frontEdgeIndex
  );

  if (config.type === "side-by-side") {
    // newDivisions are the u-positions of division lines
    const boundaries = [0, ...newDivisions, widthM];
    const lots: AutoLot[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const uStart_m = i === 0 ? -BIG_M : boundaries[i];
      const uEnd_m =
        i === boundaries.length - 2 ? widthM + BIG_M : boundaries[i + 1];
      const lotWidthM = boundaries[i + 1] - boundaries[i];

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
      const { compliant, issues } = checkCompliance(
        area,
        lotWidthM,
        minArea,
        minFrontage
      );

      lots.push({
        id: `lot_${i + 1}`,
        name: `Lot ${i + 1}`,
        type: "private",
        geometry: slice.geometry,
        area: Math.round(area),
        frontage: Math.round(lotWidthM),
        compliant,
        issues,
      });
    }

    return {
      ...config,
      lots,
      totalLots: lots.length,
      privateLotCount: lots.length,
      overallCompliant: lots.every((l) => l.compliant),
      divisionPointsM: newDivisions,
    };
  }

  if (config.type === "battleaxe") {
    const handleW = config.handleWidthM ?? BATTLEAXE_HANDLE_WIDTH_M;
    const mainW = widthM - handleW;
    const boundaries = [0, ...newDivisions, depthM];
    const lots: AutoLot[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const dStart_m = i === 0 ? -BIG_M : boundaries[i];
      const dEnd_m =
        i === boundaries.length - 2 ? depthM + BIG_M : boundaries[i + 1];
      const lotDepthM = boundaries[i + 1] - boundaries[i];

      const slice = createWidthDepthSlice(
        parcelPolygon,
        frontStart,
        u_deg,
        p_deg,
        -BIG_M,
        mainW,
        dStart_m,
        dEnd_m
      );
      if (!slice) return null;

      const area = turf.area(slice);
      const issues: string[] = [];
      if (area < minArea)
        issues.push(`Area ${Math.round(area)} m² < min ${minArea} m²`);
      if (i === 0 && mainW < minFrontage)
        issues.push(`Frontage ${Math.round(mainW)} m < min ${minFrontage} m`);

      lots.push({
        id: `lot_${i + 1}`,
        name: i === 0 ? `Lot 1 (Street)` : `Lot ${i + 1} (Rear)`,
        type: "private",
        geometry: slice.geometry,
        area: Math.round(area),
        frontage: i === 0 ? Math.round(mainW) : Math.round(lotDepthM),
        compliant: issues.length === 0,
        issues,
      });
    }

    const handleSlice = createWidthSlice(
      parcelPolygon,
      frontStart,
      u_deg,
      p_deg,
      mainW,
      widthM + BIG_M
    );
    if (handleSlice) {
      lots.push({
        id: "cp_handle",
        name: "Access Handle (CP)",
        type: "common-property",
        geometry: handleSlice.geometry,
        area: Math.round(turf.area(handleSlice)),
        frontage: handleW,
        compliant: true,
        issues: [],
      });
    }

    const privateLots = lots.filter((l) => l.type === "private");
    return {
      ...config,
      lots,
      totalLots: lots.length,
      privateLotCount: privateLots.length,
      overallCompliant: privateLots.every((l) => l.compliant),
      divisionPointsM: newDivisions,
    };
  }

  // strata-access uses the same depth-slicing logic as battleaxe rebuild
  if (config.type === "strata-access") {
    const handleW = config.handleWidthM ?? BATTLEAXE_HANDLE_WIDTH_M;
    const mainW = widthM - handleW;
    const boundaries = [0, ...newDivisions, depthM];
    const lots: AutoLot[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const dStart_m = i === 0 ? -BIG_M : boundaries[i];
      const dEnd_m =
        i === boundaries.length - 2 ? depthM + BIG_M : boundaries[i + 1];
      const lotDepthM = boundaries[i + 1] - boundaries[i];

      const slice = createWidthDepthSlice(
        parcelPolygon,
        frontStart,
        u_deg,
        p_deg,
        -BIG_M,
        mainW,
        dStart_m,
        dEnd_m
      );
      if (!slice) return null;

      const area = turf.area(slice);
      const issues: string[] = [];
      if (area < minArea)
        issues.push(`Area ${Math.round(area)} m² < min ${minArea} m²`);
      if (i === 0 && mainW < minFrontage)
        issues.push(`Frontage ${Math.round(mainW)} m < min ${minFrontage} m`);

      lots.push({
        id: `lot_${i + 1}`,
        name: i === 0 ? `Lot 1 (Street)` : `Lot ${i + 1} (Rear)`,
        type: "private",
        geometry: slice.geometry,
        area: Math.round(area),
        frontage: i === 0 ? Math.round(mainW) : Math.round(lotDepthM),
        compliant: issues.length === 0,
        issues,
      });
    }

    const handleSlice = createWidthSlice(
      parcelPolygon,
      frontStart,
      u_deg,
      p_deg,
      mainW,
      widthM + BIG_M
    );
    if (handleSlice) {
      lots.push({
        id: "cp_handle",
        name: "Side Driveway (CP)",
        type: "common-property",
        geometry: handleSlice.geometry,
        area: Math.round(turf.area(handleSlice)),
        frontage: handleW,
        compliant: true,
        issues: [],
      });
    }

    const privateLots = lots.filter((l) => l.type === "private");
    return {
      ...config,
      lots,
      totalLots: lots.length,
      privateLotCount: privateLots.length,
      overallCompliant: privateLots.every((l) => l.compliant),
      divisionPointsM: newDivisions,
    };
  }

  return null;
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
    // Battleaxe is always 2 private lots (1 front + 1 rear) regardless of targetLots
    const battleaxe = generateBattleaxe(
      parcelPolygon,
      frontEdgeIndex,
      minArea,
      minFrontage
    );
    if (battleaxe) configs.push(battleaxe);

    // Strata Side Access: N lots stacked + side driveway CP
    const strataAccess = generateStrataAccess(
      parcelPolygon,
      frontEdgeIndex,
      targetLots,
      minArea,
      minFrontage
    );
    if (strataAccess) configs.push(strataAccess);

    const strataCP = generateStrataCP(
      parcelPolygon,
      frontEdgeIndex,
      targetLots,
      minArea,
      minFrontage
    );
    if (strataCP) configs.push(strataCP);
  }

  return configs;
}
