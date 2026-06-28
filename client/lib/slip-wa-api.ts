// SLIP WA REST API service for querying property data
import { extractRCode } from "./zoning-requirements";
import proj4 from "proj4";
import { devLog } from "./logger";
import { queryExternalApis } from "./external-apis";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 100;

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) this.cleanup();
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) toDelete.push(key);
    }
    toDelete.forEach((key) => this.cache.delete(key));
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      );
      entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3)).forEach(([k]) => this.cache.delete(k));
    }
    devLog.log(`🧹 Cache cleanup completed. Size: ${this.cache.size}`);
  }

  getStats() {
    return { size: this.cache.size, maxSize: this.MAX_CACHE_SIZE, defaultTtl: this.DEFAULT_TTL };
  }
}

const apiCache = new ApiCache();

if (typeof window !== "undefined") {
  setInterval(() => apiCache.cleanup(), 60000);
}

// ---------------------------------------------------------------------------
// SLIP WA endpoint registry
// Confirmed live 2026-06 via direct probe + research.
// public-services host: cadastre, soil, boundaries, heritage, soil-risk
// services host: planning, bushfire, water, environment
// ---------------------------------------------------------------------------

const PS = "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services";
const SV = "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services";

const EP = {
  // Cadastre / lot boundary (Places_and_Addresses)
  cadastre:         `${PS}/Places_and_Addresses/MapServer/4/query`,
  cadastreFallback: `${PS}/Places_and_Addresses/MapServer/3/query`,

  // Bushfire (Bush_Fire_Prone_Areas) — layer 20 confirmed working, 19 does NOT exist
  bushfire:         `${SV}/Bush_Fire_Prone_Areas/MapServer/20/query`,

  // Planning — Property_and_Planning
  rCodes:           `${SV}/Property_and_Planning/MapServer/111/query`,   // R-codes
  mrsZone:          `${SV}/Property_and_Planning/MapServer/48/query`,    // Metropolitan Region Scheme
  lpsZones:         `${SV}/Property_and_Planning/MapServer/112/query`,   // LPS Zones & Reserves
  lpsOverlays:      `${SV}/Property_and_Planning/MapServer/109/query`,   // LPS Special Areas (overlays)
  airportNoise:     `${SV}/Property_and_Planning/MapServer/77/query`,    // Airport vicinity (Jandakot)
  airportNoise2:    `${SV}/Property_and_Planning/MapServer/78/query`,    // Airport vicinity (Perth)
  roadRailNoise:    `${SV}/Property_and_Planning/MapServer/100/query`,   // Road & rail noise buffer
  bushForever:      `${SV}/Property_and_Planning/MapServer/31/query`,    // Bush Forever 2000

  // Water (Water service)
  floodway:         `${SV}/Water/MapServer/18/query`,   // FPM Floodway polygon
  floodFringe:      `${SV}/Water/MapServer/19/query`,   // FPM Flood Fringe polygon
  floodControl:     `${SV}/Water/MapServer/54/query`,   // 1-in-100 AEP Development Control Area
  drinkingWater:    `${SV}/Water/MapServer/24/query`,   // Public Drinking Water Source Areas

  // Environment (Environment service)
  contamination:    `${SV}/Environment/MapServer/5/query`,    // Contaminated Sites Database (DWER-059)
  envSensitive:     `${SV}/Environment/MapServer/6/query`,    // Environmentally Sensitive Areas

  // Heritage (People_and_Society service — confirmed working)
  heritageState:    `${PS}/People_and_Society/MapServer/7/query`,   // Heritage Council WA - State Register
  heritageLocal:    `${PS}/People_and_Society/MapServer/9/query`,   // Heritage Council WA - Local Heritage Survey
  aboriginalSurvey: `${PS}/People_and_Society/MapServer/10/query`,  // Aboriginal Cultural Heritage Survey Areas

  // Soil
  soilLandscape:    `${PS}/Soil_Landscape/MapServer/26/query`,      // Soil landscape mapping (DPIRD-076)
  acidSulfateSoil:  `${PS}/Soil_Risk_Map/MapServer/3/query`,        // Acid Sulfate Soil Risk (Swan Coastal Plain)

  // Boundaries
  lga:              `${PS}/Boundaries/MapServer/14/query`,   // LGA boundaries (confirmed returns council name)
} as const;

// ---------------------------------------------------------------------------
// Coordinate projection helpers
// ---------------------------------------------------------------------------

proj4.defs("EPSG:7850", "+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs");

function projectCoord([lon, lat]: [number, number]) {
  return proj4("EPSG:4326", "EPSG:7850", [lon, lat]) as [number, number];
}

function projectGeometry(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  const mapCoords = (coords: any): any =>
    Array.isArray(coords[0]) ? coords.map(mapCoords) : projectCoord(coords as [number, number]);
  if ("coordinates" in geometry) return { ...geometry, coordinates: mapCoords(geometry.coordinates) };
  return geometry;
}

function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function planarAreaMeters2(geomMeters: GeoJSON.Geometry): number {
  if (geomMeters.type === "Polygon") {
    const rings = geomMeters.coordinates as [number, number][][];
    let area = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
    return area;
  }
  if (geomMeters.type === "MultiPolygon") {
    const polys = geomMeters.coordinates as [number, number][][][];
    return polys.reduce(
      (acc, poly) => acc + planarAreaMeters2({ type: "Polygon", coordinates: poly } as any),
      0,
    );
  }
  return 0;
}

function calculateBoundaryLengths(ring: [number, number][]): { lengths: number[]; perimeter: number } {
  const lengths: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    lengths.push(length);
    perimeter += length;
  }
  return { lengths, perimeter };
}

function toDMS(degrees: number): string {
  const deg = Math.floor(Math.abs(degrees));
  const minFloat = (Math.abs(degrees) - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100) / 100;
  return `${deg}°${min.toString().padStart(2, "0")}'${sec.toFixed(2).padStart(5, "0")}"`;
}

function calculateInteriorAngles(ring: [number, number][]): string[] {
  const angles: string[] = [];
  const numVertices = ring.length - 1;
  for (let i = 0; i < numVertices; i++) {
    const prev = i === 0 ? numVertices - 1 : i - 1;
    const curr = i;
    const next = (i + 1) % numVertices;
    const [x1, y1] = ring[prev];
    const [x2, y2] = ring[curr];
    const [x3, y3] = ring[next];
    const v1x = x1 - x2, v1y = y1 - y2;
    const v2x = x3 - x2, v2y = y3 - y2;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    const cosAngle = dot / (mag1 * mag2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    angles.push(toDMS((angleRad * 180) / Math.PI));
  }
  return angles;
}

// ---------------------------------------------------------------------------
// Shared query helper
// ---------------------------------------------------------------------------

async function slipPointQuery(
  url: string,
  lng: number,
  lat: number,
  outFields: string = "*",
  maxRecordCount: number = 1,
): Promise<any[]> {
  const params = new URLSearchParams({
    f: "json",
    returnGeometry: "false",
    spatialRel: "esriSpatialRelIntersects",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outFields,
    maxRecordCount: String(maxRecordCount),
  });
  const res = await fetch(`${url}?${params}`);
  const data = await res.json();
  return data.features ?? [];
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PropertyDetails {
  // --- Cadastre ---
  lotSize?: string;
  dimensions?: string;
  planNumber?: string;
  boundaryLengths?: string[];
  perimeter?: string;
  interiorAngles?: string[];

  // --- Planning / Zoning ---
  rCode?: string;            // R-code from LPS R-codes layer (e.g. "R20")
  zoning?: string;           // Scheme name (e.g. "Local Planning Scheme No.3")
  landUse?: string;          // Land use classification
  mrsZone?: string;          // Metropolitan Region Scheme zone (e.g. "Urban", "Industrial")
  lpsZone?: string;          // LPS Zone & Reserve description
  lpsOverlays?: string[];    // LPS Special Area overlay names (can be multiple)

  // --- Constraints / Hazards ---
  balRating?: string;        // Bushfire — "Bushfire Prone Area" or "Not Designated"
  bushfirePlanningArea?: string; // Planning area sub-description (e.g. "Bushfire Prone Area 2")
  floodZone?: string;        // "Floodway" | "Flood Fringe" | "Development Control Area" | "No flood risk"
  floodRisk?: string;        // backward-compat alias → same as floodZone
  contamination?: string;    // "Listed site" | "No known contamination"
  acidSulfateSoil?: string;  // ASS risk category (e.g. "High", "Moderate", "Low", "Nil")
  publicDrinkingWater?: string; // Water source area name/priority
  airportNoiseBuf?: string;  // Airport noise buffer zone description
  roadRailNoiseBuf?: string; // Road/rail noise buffer description
  bushForever?: string;      // "Within Bush Forever area" | undefined

  // --- Heritage ---
  heritage?: string;         // backward-compat → "Yes (State Register)" | "No"
  heritageState?: string;    // Heritage Council WA State Register place name
  heritageStateId?: string;  // State Register place number
  heritageLocal?: string;    // Local Heritage Survey entry name
  aboriginalHeritage?: string; // "Within survey area" | "No known constraints"

  // --- Soil ---
  soilType?: string;         // SLIP soil landscape code (e.g. "212Bs__Ja")

  // --- Administration ---
  lgaName?: string;          // Local Government Authority name (e.g. "STIRLING, CITY OF")

  // --- External APIs (non-SLIP) ---
  elevationM?: number;         // Site elevation metres AHD (OpenTopoData SRTM 30m)
  postcode?: string;           // ABS postcode (e.g. "6153")
  sa2Name?: string;            // ABS SA2 suburb area name (e.g. "Mount Pleasant")
  roadClassification?: string; // Main Roads WA road hierarchy (e.g. "Local Distributor")
  roadNetworkType?: string;    // "Local Road" | "State Road"
}

export interface SlipWaQueryParams {
  coordinates: [number, number]; // [lat, lng]
  address?: string;
}

export interface CadastralFeature {
  geometry: { rings: number[][][] };
  attributes: Record<string, any>;
}

// ---------------------------------------------------------------------------
// 1. Cadastre
// ---------------------------------------------------------------------------

export async function fetchCadastralFeature(params: SlipWaQueryParams): Promise<CadastralFeature | null> {
  const [lat, lng] = params.coordinates;
  const queryParams = new URLSearchParams({
    f: "json",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    outFields: "land_id,road_number_1,road_number_2,road_name,road_type,locality,lot_number",
    maxRecordCount: "1",
    maxAllowableOffset: "0.000001",
    geometryPrecision: "12",
  });

  let res = await fetch(`${EP.cadastre}?${queryParams}`);
  let data = await res.json();

  if (!data.features?.length) {
    res = await fetch(`${EP.cadastreFallback}?${queryParams}`);
    data = await res.json();
  }

  return data.features?.[0] ?? null;
}

// Pure, network-free: derive lot size / dimensions / angles from parcel rings.
// Used both by queryCadastralData and by the click handler, which already has
// the geometry from the boundary-highlight fetch and can show these instantly.
export function computeCadastralMetrics(
  rings: number[][][],
  attributes?: Record<string, any>,
): Partial<PropertyDetails> {
  const geomMeters = projectGeometry({ type: "Polygon", coordinates: rings } as GeoJSON.Geometry);
  const sqm = planarAreaMeters2(geomMeters);
  const outerRing = (geomMeters as any).coordinates[0] as [number, number][];
  const { lengths, perimeter } = calculateBoundaryLengths(outerRing);
  const interiorAngles = calculateInteriorAngles(outerRing);
  const boundaryLengths = lengths.map((l, i) => `Side ${i + 1}: ${l.toFixed(2)}m`);

  let planNumber: string | undefined;
  if (attributes?.lot_number) {
    const lotNum = attributes.lot_number;
    const planMatch = lotNum.toString().match(/(DP|SP|PS)\s*(\d+)/i);
    planNumber = planMatch ? `${planMatch[1].toUpperCase()} ${planMatch[2]}` : `LOT ${lotNum}`;
  }

  return {
    lotSize: `${sqm.toFixed(2)} m²`,
    planNumber,
    boundaryLengths,
    perimeter: `${perimeter.toFixed(2)}m`,
    interiorAngles,
  };
}

export async function queryCadastralData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  try {
    devLog.log("🔍 Querying cadastral geometry (Places_and_Addresses)...");
    const feature = await fetchCadastralFeature(params);

    if (!feature?.geometry?.rings) return {};

    devLog.log("📋 Cadastral attributes:", feature.attributes);
    return computeCadastralMetrics(feature.geometry.rings, feature.attributes);
  } catch (err) {
    console.error("❌ Error querying cadastral data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 2. Bushfire / BAL  — layer 20 (layer 19 does NOT exist on this service)
// ---------------------------------------------------------------------------

export async function queryBushfireData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.bushfire, lng, lat);
    devLog.log("🔥 Bushfire response:", features);

    if (features.length > 0) {
      const attrs = features[0].attributes;
      const planningArea = attrs.PlanningArea || attrs.planningarea || attrs.planning_area || "";
      devLog.log("✅ Property IS in bushfire prone area. PlanningArea:", planningArea);
      return {
        balRating: "Bushfire Prone Area — BAL Assessment Required",
        bushfirePlanningArea: planningArea || undefined,
      };
    }

    devLog.log("✅ Property NOT in designated bushfire prone area");
    return { balRating: "Not in Designated Bushfire Prone Area" };
  } catch (err) {
    console.error("❌ Error querying bushfire data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 3. Planning — R-codes, MRS, LPS zones, overlays
// ---------------------------------------------------------------------------

export async function queryPlanningData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;

  try {
    // Run all planning sub-queries in parallel
    const [rCodeFeatures, mrsFeatures, lpsZoneFeatures, overlayFeatures] = await Promise.all([
      slipPointQuery(EP.rCodes, lng, lat),
      slipPointQuery(EP.mrsZone, lng, lat),
      slipPointQuery(EP.lpsZones, lng, lat),
      slipPointQuery(EP.lpsOverlays, lng, lat, "*", 10),
    ]);

    const result: Partial<PropertyDetails> = {};

    // R-codes (layer 111)
    if (rCodeFeatures.length > 0) {
      const attrs = rCodeFeatures[0].attributes;
      devLog.log("🏗️ R-codes layer:", attrs);

      const rCodeNo = attrs.RCODE_NO || attrs.rcode_no || attrs.RCODE || attrs.R_CODE;
      const schemeName = attrs.SCHEME_NAM || attrs.scheme_nam || attrs.SCHEME_NAME;
      const zoneCode = attrs.ZONE_CODE || attrs.zone_code || attrs.ZONING;
      const landUse = attrs.LAND_USE || attrs.land_use || attrs.LANDUSE;

      let finalRCode = rCodeNo;
      if (!finalRCode && zoneCode) {
        const rCodeMatch = zoneCode.match(/R\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*(?:-\w+)?/i);
        if (rCodeMatch) finalRCode = extractRCode(rCodeMatch[0].toUpperCase());
      }

      result.rCode = finalRCode || undefined;
      result.zoning = schemeName || zoneCode || undefined;
      result.landUse = landUse || undefined;
    }

    // MRS zone (layer 48)
    if (mrsFeatures.length > 0) {
      const attrs = mrsFeatures[0].attributes;
      devLog.log("🗺️ MRS zone:", attrs);
      const desc = attrs.descriptio || attrs.description || attrs.DESCRIPTIO;
      const rsClass = attrs.rs_class || attrs.RS_CLASS;
      if (desc || rsClass) {
        result.mrsZone = [rsClass, desc].filter(Boolean).join(" — ") || undefined;
      }
    }

    // LPS zone/reserve (layer 112)
    if (lpsZoneFeatures.length > 0) {
      const attrs = lpsZoneFeatures[0].attributes;
      devLog.log("🏘️ LPS zones:", attrs);
      const zoneName = attrs.ZONE_NAM || attrs.zone_nam || attrs.ZONE_NAME ||
                       attrs.zone_name || attrs.ZONE_CODE || attrs.zone_code;
      const schemeName = attrs.SCHEME_NAM || attrs.scheme_nam || attrs.SCHEME_NAME || attrs.scheme_name;
      if (zoneName) {
        result.lpsZone = zoneName;
        // Supplement scheme name if not already set from R-codes layer
        if (!result.zoning && schemeName) result.zoning = schemeName;
      }
    }

    // LPS overlays / Special Areas (layer 109)
    if (overlayFeatures.length > 0) {
      devLog.log("🏷️ LPS overlays:", overlayFeatures);
      const overlays = overlayFeatures
        .map((f) => {
          const a = f.attributes;
          return a.special_na || a.SPECIAL_NA || a.special_name || a.SPECIAL_NAME || null;
        })
        .filter((v): v is string => Boolean(v));
      if (overlays.length > 0) result.lpsOverlays = overlays;
    }

    return result;
  } catch (err) {
    console.error("❌ Error querying planning data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 4. Flood
// ---------------------------------------------------------------------------

export async function queryFloodData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    // Query floodway (most severe), flood fringe, and development control area in parallel
    const [floodwayFeats, floodFringeFeats, controlFeats] = await Promise.all([
      slipPointQuery(EP.floodway, lng, lat),
      slipPointQuery(EP.floodFringe, lng, lat),
      slipPointQuery(EP.floodControl, lng, lat),
    ]);

    devLog.log("🌊 Flood layers:", { floodwayFeats, floodFringeFeats, controlFeats });

    if (floodwayFeats.length > 0) {
      return { floodZone: "Floodway (1-in-100 AEP)", floodRisk: "Floodway (1-in-100 AEP)" };
    }
    if (floodFringeFeats.length > 0) {
      return { floodZone: "Flood Fringe (1-in-100 AEP)", floodRisk: "Flood Fringe (1-in-100 AEP)" };
    }
    if (controlFeats.length > 0) {
      return { floodZone: "Floodplain Development Control Area", floodRisk: "Floodplain Development Control Area" };
    }

    return { floodZone: "No flood risk mapped", floodRisk: "No flood risk mapped" };
  } catch (err) {
    console.error("❌ Error querying flood data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 5. Heritage — State Register + Local Heritage Survey
// ---------------------------------------------------------------------------

export async function queryHeritageData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const [stateFeats, localFeats] = await Promise.all([
      slipPointQuery(EP.heritageState, lng, lat, "*", 5),
      slipPointQuery(EP.heritageLocal, lng, lat, "*", 5),
    ]);

    devLog.log("🏛️ Heritage state:", stateFeats, "local:", localFeats);

    const result: Partial<PropertyDetails> = {};

    if (stateFeats.length > 0) {
      const attrs = stateFeats[0].attributes;
      const name = attrs.name || attrs.NAME || attrs.place_name || attrs.PLACE_NAME;
      const placeId = attrs.place_no || attrs.PLACE_NO || attrs.placeno || attrs.PLACENO;
      result.heritageState = name || "State Register Place";
      result.heritageStateId = placeId ? String(placeId) : undefined;
      result.heritage = "Yes (State Register)";
    }

    if (localFeats.length > 0) {
      const attrs = localFeats[0].attributes;
      const name = attrs.name || attrs.NAME || attrs.place_name || attrs.PLACE_NAME || "Local Heritage Place";
      result.heritageLocal = name;
      if (!result.heritage) result.heritage = "Yes (Local Heritage Survey)";
    }

    if (!result.heritage) result.heritage = "No";

    return result;
  } catch (err) {
    console.error("❌ Error querying heritage data:", err);
    return { heritage: "No" };
  }
}

// ---------------------------------------------------------------------------
// 6. Contaminated Sites
// ---------------------------------------------------------------------------

export async function queryContaminationData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.contamination, lng, lat, "*", 5);
    devLog.log("⚠️ Contamination response:", features);

    if (features.length > 0) {
      const attrs = features[0].attributes;
      const classification = attrs.site_class || attrs.SITE_CLASS || attrs.classification ||
                             attrs.CLASSIFICATION || "Contaminated Site";
      return { contamination: `Listed — DWER Contaminated Sites Database (${classification})` };
    }

    return { contamination: "No known contamination (DWER database)" };
  } catch (err) {
    console.error("❌ Error querying contamination data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 7. Acid Sulfate Soil (Swan Coastal Plain)
// ---------------------------------------------------------------------------

export async function queryAcidSulfateSoilData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.acidSulfateSoil, lng, lat);
    devLog.log("🧪 Acid sulfate soil response:", features);

    if (features.length > 0) {
      const attrs = features[0].attributes;
      const riskCat = attrs.risk_category || attrs.RISK_CATEGORY || attrs.risk_cat || attrs.RISK_CAT;
      const riskClass = attrs.risk_class || attrs.RISK_CLASS;
      const label = riskCat || (riskClass != null ? `Risk Class ${riskClass}` : null) || "Present";
      return { acidSulfateSoil: label };
    }

    return { acidSulfateSoil: "Not mapped (Swan Coastal Plain dataset)" };
  } catch (err) {
    console.error("❌ Error querying acid sulfate soil data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 8. Public Drinking Water Source Area
// ---------------------------------------------------------------------------

export async function queryDrinkingWaterData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.drinkingWater, lng, lat, "objectid,name,priority,resource_");
    devLog.log("💧 Drinking water response:", features);

    if (features.length > 0) {
      const attrs = features[0].attributes;
      const name = attrs.name || attrs.NAME;
      const priority = attrs.priority || attrs.PRIORITY;
      const resource = attrs.resource_ || attrs.RESOURCE_;
      const parts = [name, resource, priority ? `Priority ${priority}` : null].filter(Boolean);
      return { publicDrinkingWater: parts.join(" — ") || "Within Public Drinking Water Source Area" };
    }

    return { publicDrinkingWater: "Not in a Public Drinking Water Source Area" };
  } catch (err) {
    console.error("❌ Error querying drinking water data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 9. Noise buffers — airport & road/rail
// ---------------------------------------------------------------------------

export async function queryNoiseData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const [jandakotFeats, perthAirportFeats, roadRailFeats] = await Promise.all([
      slipPointQuery(EP.airportNoise, lng, lat),
      slipPointQuery(EP.airportNoise2, lng, lat),
      slipPointQuery(EP.roadRailNoise, lng, lat),
    ]);

    devLog.log("✈️ Noise layers:", { jandakotFeats, perthAirportFeats, roadRailFeats });

    const result: Partial<PropertyDetails> = {};

    if (jandakotFeats.length > 0 || perthAirportFeats.length > 0) {
      const feats = [...jandakotFeats, ...perthAirportFeats];
      const attrs = feats[0].attributes;
      const desc = attrs.zone || attrs.ZONE || attrs.description || attrs.DESCRIPTION ||
                   attrs.noise_zone || attrs.NOISE_ZONE || "Airport Noise Affected";
      result.airportNoiseBuf = String(desc);
    }

    if (roadRailFeats.length > 0) {
      const attrs = roadRailFeats[0].attributes;
      const desc = attrs.noise_zone || attrs.NOISE_ZONE || attrs.description ||
                   attrs.DESCRIPTION || "Road/Rail Noise Buffer";
      result.roadRailNoiseBuf = String(desc);
    }

    return result;
  } catch (err) {
    console.error("❌ Error querying noise data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 10. Aboriginal Cultural Heritage Survey Areas
// ---------------------------------------------------------------------------

export async function queryAboriginalHeritageData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.aboriginalSurvey, lng, lat);
    devLog.log("🪃 Aboriginal heritage survey response:", features);

    if (features.length > 0) {
      return { aboriginalHeritage: "Within Aboriginal Cultural Heritage Survey Area — Section 18 consent may be required" };
    }
    return { aboriginalHeritage: "No known cultural heritage survey area constraints" };
  } catch (err) {
    console.error("❌ Error querying aboriginal heritage data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// 11. Soil landscape (existing, refactored)
// ---------------------------------------------------------------------------

async function querySoilTypeData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.soilLandscape, lng, lat);
    devLog.log("🌱 Soil landscape response:", features);

    if (features.length > 0) {
      const attrs = features[0].attributes;
      devLog.log("🌱 Soil attributes:", Object.keys(attrs));

      for (const field of ["STY", "SOIL_TYPE", "SoilType", "Soil_Type", "SOIL_CLASS", "STYPE", "Soil", "PROJ_CODE"]) {
        if (attrs[field]) {
          devLog.log(`🌱 Soil code from field "${field}":`, attrs[field]);
          return { soilType: String(attrs[field]) };
        }
      }

      // Fallback: first non-id field with a value
      for (const [key, value] of Object.entries(attrs)) {
        if (value && !key.toLowerCase().includes("id") && !key.toLowerCase().includes("objectid")) {
          devLog.log(`🌱 Soil code fallback field "${key}":`, value);
          return { soilType: String(value) };
        }
      }
    }

    return { soilType: "Unknown" };
  } catch (err) {
    console.error("❌ Error querying soil type data:", err);
    return { soilType: "Unknown" };
  }
}

// ---------------------------------------------------------------------------
// 12. LGA identification
// ---------------------------------------------------------------------------

export async function queryLGAData(params: SlipWaQueryParams): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;
  try {
    const features = await slipPointQuery(EP.lga, lng, lat, "name,abs_lga_number");
    devLog.log("🏛️ LGA response:", features);

    if (features.length > 0) {
      const attrs = features[0].attributes;
      const name = attrs.name || attrs.NAME;
      if (name) return { lgaName: String(name) };
    }

    return {};
  } catch (err) {
    console.error("❌ Error querying LGA data:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Master query — runs everything in parallel
// ---------------------------------------------------------------------------

export async function queryPropertyDetails(
  params: SlipWaQueryParams,
  opts: { includeExternal?: boolean } = {},
): Promise<PropertyDetails> {
  // External APIs (elevation, ABS postcode, road class) are supplementary, not
  // authoritative planning data. When includeExternal is false the caller
  // fetches them separately (see queryExternalApis) so the core SLIP report
  // renders without waiting on them.
  const { includeExternal = true } = opts;
  try {
    devLog.log("🚀 Starting parallel SLIP WA queries...", { includeExternal });
    const [lat, lng] = params.coordinates;

    const [
      cadastralData,
      planningData,
      bushfireData,
      floodData,
      heritageData,
      contaminationData,
      acidSulfateSoilData,
      drinkingWaterData,
      noiseData,
      aboriginalData,
      soilTypeData,
      lgaData,
      externalData,
    ] = await Promise.all([
      queryCadastralData(params),
      queryPlanningData(params),
      queryBushfireData(params),
      queryFloodData(params),
      queryHeritageData(params),
      queryContaminationData(params),
      queryAcidSulfateSoilData(params),
      queryDrinkingWaterData(params),
      queryNoiseData(params),
      queryAboriginalHeritageData(params),
      querySoilTypeData(params),
      queryLGAData(params),
      includeExternal ? queryExternalApis(lat, lng) : Promise.resolve({}),
    ]);

    const result: PropertyDetails = {
      ...cadastralData,
      ...planningData,
      ...bushfireData,
      ...floodData,
      ...heritageData,
      ...contaminationData,
      ...acidSulfateSoilData,
      ...drinkingWaterData,
      ...noiseData,
      ...aboriginalData,
      ...soilTypeData,
      ...lgaData,
      ...externalData,
    };

    devLog.log("✅ SLIP WA queries complete:", result);
    return result;
  } catch (err) {
    console.error("❌ Fatal error in queryPropertyDetails:", err);
    return {};
  }
}
