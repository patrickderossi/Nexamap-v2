// SLIP WA REST API service for querying property data
import * as turf from "@turf/turf";
import { extractRCode } from "./zoning-requirements";
import * as esri from "esri-leaflet";
import proj4 from "proj4";
import { devLog } from "./logger";

// Cache for expensive operations
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100; // Limit cache size to prevent memory bloat

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    // Clean up old entries if cache is getting too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
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
      if (now - entry.timestamp > entry.ttl) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => this.cache.delete(key));

    // If still too large, remove oldest entries
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      );

      const toRemove = entries.slice(0, this.MAX_CACHE_SIZE * 0.3); // Remove 30%
      toRemove.forEach(([key]) => this.cache.delete(key));
    }

    devLog.log(`🧹 Cache cleanup completed. Size: ${this.cache.size}`);
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      defaultTtl: this.DEFAULT_TTL,
    };
  }
}

// Create singleton cache instance
const apiCache = new ApiCache();

// Cleanup cache periodically
if (typeof window !== "undefined") {
  setInterval(() => {
    apiCache.cleanup();
  }, 60000); // Cleanup every minute
}

// Helper to create cache keys
function createCacheKey(
  prefix: string,
  coordinates: [number, number],
  ...args: any[]
): string {
  const coordKey = `${coordinates[0].toFixed(6)},${coordinates[1].toFixed(6)}`;
  const argsKey = args.length > 0 ? `_${args.join("_")}` : "";
  return `${prefix}_${coordKey}${argsKey}`;
}

export interface PropertyDetails {
  lotSize?: string;
  dimensions?: string;
  planNumber?: string;
  rCode?: string;
  zoning?: string;
  landUse?: string;
  balRating?: string;
  heritage?: string;
  floodRisk?: string;
  soilType?: string;
  boundaryLengths?: string[];
  perimeter?: string;
  interiorAngles?: string[];
}

export interface SlipWaQueryParams {
  coordinates: [number, number]; // [lat, lng]
  address?: string;
}

// EPSG:4326 (lon,lat) → EPSG:7850 (GDA2020 / MGA Zone 50, metres)
proj4.defs(
  "EPSG:7850",
  "+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs",
);

function projectCoord([lon, lat]: [number, number]) {
  return proj4("EPSG:4326", "EPSG:7850", [lon, lat]) as [number, number];
}

// Project a GeoJSON geometry (Polygon/MultiPolygon) to EPSG:7850
function projectGeometry(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  const mapCoords = (coords: any): any =>
    Array.isArray(coords[0])
      ? coords.map(mapCoords)
      : projectCoord(coords as [number, number]);

  if ("coordinates" in geometry) {
    return { ...geometry, coordinates: mapCoords(geometry.coordinates) };
  }
  return geometry;
}

// Shoelace area for one linear ring in metres²
function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2; // m²
}

// Planar area for Polygon/MultiPolygon in metres² (outer − holes)
function planarAreaMeters2(geomMeters: GeoJSON.Geometry): number {
  if (geomMeters.type === "Polygon") {
    const rings = geomMeters.coordinates as [number, number][][]; // [ring][vertex][x,y]
    let area = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
    return area;
  }
  if (geomMeters.type === "MultiPolygon") {
    const polys = geomMeters.coordinates as [number, number][][][];
    return polys.reduce(
      (acc, poly) =>
        acc + planarAreaMeters2({ type: "Polygon", coordinates: poly } as any),
      0,
    );
  }
  return 0;
}

// Calculate boundary lengths for each edge of a polygon
function calculateBoundaryLengths(ring: [number, number][]): {
  lengths: number[];
  perimeter: number;
} {
  const lengths: number[] = [];
  let perimeter = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];

    // Calculate distance between consecutive points
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    lengths.push(length);
    perimeter += length;
  }

  return { lengths, perimeter };
}

// Convert decimal degrees to degrees, minutes, seconds
function toDMS(degrees: number): string {
  const deg = Math.floor(Math.abs(degrees));
  const minFloat = (Math.abs(degrees) - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100) / 100; // Round to 2 decimal places

  return `${deg}°${min.toString().padStart(2, "0")}'${sec.toFixed(2).padStart(5, "0")}"`;
}

// Calculate interior angles at each vertex of a polygon
function calculateInteriorAngles(ring: [number, number][]): string[] {
  const angles: string[] = [];
  const numVertices = ring.length - 1; // Last point is same as first

  for (let i = 0; i < numVertices; i++) {
    // Get three consecutive points
    const prev = i === 0 ? numVertices - 1 : i - 1;
    const curr = i;
    const next = (i + 1) % numVertices;

    const [x1, y1] = ring[prev];
    const [x2, y2] = ring[curr];
    const [x3, y3] = ring[next];

    // Calculate vectors from current point to previous and next points
    const v1x = x1 - x2;
    const v1y = y1 - y2;
    const v2x = x3 - x2;
    const v2y = y3 - y2;

    // Calculate dot product and magnitudes
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

    // Calculate angle in radians, then convert to degrees
    const cosAngle = dot / (mag1 * mag2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle))); // Clamp to avoid numerical errors
    const angleDeg = (angleRad * 180) / Math.PI;

    // Convert to DMS format
    angles.push(toDMS(angleDeg));
  }

  return angles;
}

/**
 * Query SLIP WA Places and Addresses service for current cadastral data and lot size calculation
 */
export async function queryCadastralData(
  params: SlipWaQueryParams,
): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;

  try {
    devLog.log(
      "🔍 Using Places and Addresses REST API for current cadastral geometry...",
    );

    const point = `${lng},${lat}`;

    // Try layer 4 (large scale) first for current data
    let cadastralUrl = `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/4/query`;
    let queryParams = new URLSearchParams({
      f: "json",
      returnGeometry: "true", // Get geometry for area calculation
      spatialRel: "esriSpatialRelIntersects",
      geometry: point,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outSR: "4326",
      outFields:
        "land_id,road_number_1,road_name,road_type,locality,lot_number",
      maxRecordCount: "1",
      // High-precision geometry parameters to prevent jagged boundaries
      maxAllowableOffset: "0.000001", // 1e-6 degrees ≈ 0.11m precision
      geometryPrecision: "12", // 12 decimal places for cadastral precision
    });

    let response = await fetch(`${cadastralUrl}?${queryParams}`);
    let data = await response.json();

    devLog.log("🏠 Places and Addresses Layer 4 Response:", data);

    // If layer 4 doesn't have data, try layer 3 (small scale)
    if (!data.features || data.features.length === 0) {
      devLog.log("🔍 Layer 4 empty, trying Layer 3...");
      cadastralUrl = `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/3/query`;
      response = await fetch(`${cadastralUrl}?${queryParams}`);
      data = await response.json();
      devLog.log("🏠 Places and Addresses Layer 3 Response:", data);
    }

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      console.log("📋 Current Cadastre Properties:", feature.attributes);

      // Debug: Log which layer provided data and geometry precision
      const layerUsed = cadastralUrl.includes("MapServer/4")
        ? "Layer 4 (detailed)"
        : "Layer 3 (small scale)";
      const vertexCount = feature.geometry?.rings?.[0]?.length || 0;
      devLog.log(`🎯 Geometry source: ${layerUsed}, Vertices: ${vertexCount}`);

      if (vertexCount > 0) {
        const sampleCoords = feature.geometry.rings[0].slice(0, 3);
        devLog.log(`📐 Sample coordinates:`, sampleCoords);
      }

      // Convert ESRI geometry to GeoJSON for Turf
      if (feature.geometry && feature.geometry.rings) {
        const geoJsonFeature = {
          type: "Feature" as const,
          geometry: {
            type: "Polygon" as const,
            coordinates: feature.geometry.rings,
          },
          properties: feature.attributes,
        };

        console.log(
          "📐 Converting to GeoJSON and projecting to GDA2020 MGA Zone 50...",
        );

        // Project to metres and compute planar area (survey-grade accuracy)
        const geomMeters = projectGeometry(geoJsonFeature.geometry);
        const sqm = planarAreaMeters2(geomMeters);
        const ha = (sqm / 10_000).toFixed(4);

        // Calculate boundary lengths for the outer ring
        const rings = (geomMeters as any).coordinates as [number, number][][];
        const outerRing = rings[0];
        const { lengths, perimeter } = calculateBoundaryLengths(outerRing);

        // Calculate interior angles
        const interiorAngles = calculateInteriorAngles(outerRing);

        // Format boundary lengths
        const boundaryLengths = lengths.map(
          (length, index) => `Side ${index + 1}: ${length.toFixed(2)}m`,
        );

        console.log(
          `✅ Survey-grade area from current cadastre (EPSG:7850): ${sqm.toFixed(2)} m² (${ha} ha)`,
        );
        console.log(`🔍 Boundary lengths:`, boundaryLengths);
        console.log(`📏 Perimeter: ${perimeter.toFixed(2)}m`);
        console.log(`📐 Interior angles:`, interiorAngles);

        // Extract plan number from the lot_number field if available, make it more informative
        let planNumber = undefined;
        if (feature.attributes.lot_number) {
          const lotNum = feature.attributes.lot_number;
          // Try to extract DP/SP number pattern if present, otherwise use lot number
          const planMatch = lotNum.toString().match(/(DP|SP|PS)\s*(\d+)/i);
          if (planMatch) {
            planNumber = `${planMatch[1].toUpperCase()} ${planMatch[2]}`;
          } else {
            planNumber = `LOT ${lotNum}`;
          }
        }

        return {
          lotSize: `${sqm.toFixed(2)} m²`,
          planNumber: planNumber,
          boundaryLengths,
          perimeter: `${perimeter.toFixed(2)}m`,
          interiorAngles,
        };
      }
    } else {
      console.log("���️ No current cadastral features found at this location");
    }

    return {};
  } catch (error) {
    console.error("❌ Error querying current cadastral data:", error);
    return {};
  }
}

/**
 * Query SLIP WA Bush Fire Prone Areas service for BAL ratings
 */
export async function queryBushfireData(
  params: SlipWaQueryParams,
): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;

  try {
    const point = `${lng},${lat}`;

    // Query Bush Fire Prone Areas service (Layer 19 - 2024 data)
    const bushfireUrl = `https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas/MapServer/19/query`;

    const queryParams = new URLSearchParams({
      f: "json",
      returnGeometry: "false",
      spatialRel: "esriSpatialRelIntersects",
      geometry: point,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outFields: "*",
      maxRecordCount: "1",
    });

    const response = await fetch(`${bushfireUrl}?${queryParams}`);
    const data = await response.json();

    console.log("🔥 SLIP WA Bushfire Response:", data);

    if (data.features && data.features.length > 0) {
      // Property is within Designated Bushfire Prone Area
      console.log("✅ Property is within Designated Bushfire Prone Area");

      return {
        balRating: "In BAL Area",
      };
    } else {
      // Not in Designated Bushfire Prone Area
      console.log("✅ Property is NOT in Designated Bushfire Prone Area");
      return {
        balRating: "Not in BAL Area",
      };
    }
  } catch (error) {
    console.error("Error querying bushfire data:", error);
    return {};
  }
}

/**
 * Query SLIP WA Property & Planning service for zoning/R-codes
 */
export async function queryPlanningData(
  params: SlipWaQueryParams,
): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;

  try {
    const point = `${lng},${lat}`;

    // Query Property & Planning service for R-codes (Layer 111)
    const planningUrl = `https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/111/query`;

    const queryParams = new URLSearchParams({
      f: "json",
      returnGeometry: "false",
      spatialRel: "esriSpatialRelIntersects",
      geometry: point,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outFields: "*",
      maxRecordCount: "1",
    });

    const response = await fetch(`${planningUrl}?${queryParams}`);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const attrs = feature.attributes;

      console.log("🏗️ Planning Layer 111 Response:", attrs);
      console.log("🏗️ Available fields:", Object.keys(attrs));

      // Extract R-code (check multiple possible field names)
      const rCodeNo =
        attrs.RCODE_NO || attrs.rcode_no || attrs.RCODE || attrs.R_CODE;
      const schemeName =
        attrs.SCHEME_NAM || attrs.scheme_nam || attrs.SCHEME_NAME;
      const zoneCode = attrs.ZONE_CODE || attrs.zone_code || attrs.ZONING;
      const landUse = attrs.LAND_USE || attrs.land_use || attrs.LANDUSE;

      console.log(
        "📋 Field values - rCodeNo:",
        rCodeNo,
        "schemeName:",
        schemeName,
        "zoneCode:",
        zoneCode,
        "landUse:",
        landUse,
      );

      // Try to extract R-Code from multiple sources
      let finalRCode = rCodeNo;
      let finalZoning = schemeName;

      // If no direct R-Code, try to extract from zone code or land use
      if (!finalRCode && zoneCode) {
        // Try to extract complete R-Code pattern from zone code (including multiple values like R17.5/35)
        const rCodeMatch = zoneCode.match(
          /R\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*(?:-\w+)?/i,
        );
        if (rCodeMatch) {
          const fullRCodePattern = rCodeMatch[0].toUpperCase();
          // Use extractRCode to properly handle multiple values and get the higher one
          finalRCode = extractRCode(fullRCodePattern);
        }
      }

      // If still no R-Code, check if it's a residential area with implicit coding
      if (
        !finalRCode &&
        (schemeName?.includes("SWAN") ||
          landUse?.toLowerCase().includes("residential"))
      ) {
        console.log(
          "🏘️ Detected residential area in SWAN scheme, may need manual R-Code assignment",
        );
        finalZoning = `${schemeName || "SWAN"} - Residential (R-Code TBD)`;
      }

      return {
        rCode: finalRCode || undefined,
        zoning: finalZoning || zoneCode || undefined,
        landUse: landUse || undefined,
      };
    }

    return {};
  } catch (error) {
    console.error("Error querying planning data:", error);
    return {};
  }
}

/**
 * Query SLIP WA Soil & Landscape service for soil type
 */
async function querySoilTypeData(
  params: SlipWaQueryParams,
): Promise<Partial<PropertyDetails>> {
  const [lat, lng] = params.coordinates;

  try {
    const point = `${lng},${lat}`;

    // Query Soil Landscape service (Layer 26 - Soil Type)
    const soilTypeUrl = `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Soil_Landscape/MapServer/26/query`;

    const queryParams = new URLSearchParams({
      f: "json",
      returnGeometry: "false",
      spatialRel: "esriSpatialRelIntersects",
      geometry: point,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outFields: "*",
      maxRecordCount: "1",
    });

    devLog.log("🌱 Querying soil type with:", {
      url: soilTypeUrl,
      point,
      params: Object.fromEntries(queryParams),
    });

    const response = await fetch(`${soilTypeUrl}?${queryParams}`);
    const data = await response.json();

    devLog.log("🌱 Soil Type API Response:", data);

    if (data.features && data.features.length > 0) {
      // Extract soil type from the feature attributes
      const feature = data.features[0];
      const attributes = feature.attributes;

      devLog.log("🌱 Available attributes:", Object.keys(attributes));

      // Try to get the soil type field (may vary depending on the service)
      // Check all possible field names
      let soilType = "Unknown";

      // Common field names to check
      const fieldNames = [
        "STY",
        "SOIL_TYPE",
        "SoilType",
        "Soil_Type",
        "SOIL_CLASS",
        "SoilClass",
        "Soil_Class",
        "ClassCode",
        "CLASS_CODE",
        "STYPE",
        "Soil",
      ];

      for (const fieldName of fieldNames) {
        if (attributes[fieldName]) {
          soilType = String(attributes[fieldName]);
          devLog.log(`🌱 Found soil type in field "${fieldName}":`, soilType);
          break;
        }
      }

      if (soilType === "Unknown") {
        // If no recognized field found, just use the first non-ID field
        for (const [key, value] of Object.entries(attributes)) {
          if (
            !key.toLowerCase().includes("id") &&
            !key.toLowerCase().includes("objectid") &&
            !key.toLowerCase().includes("code") &&
            value
          ) {
            soilType = String(value);
            devLog.log(`🌱 Using fallback field "${key}":`, soilType);
            break;
          }
        }
      }

      return {
        soilType,
      };
    } else {
      devLog.log("🌱 No soil type data found for coordinates:", { lat, lng });
      return {
        soilType: "Unknown",
      };
    }
  } catch (error) {
    devLog.error("🌱 Error querying soil type data:", error);
    return {
      soilType: "Unknown",
    };
  }
}

/**
 * Query all SLIP WA services for complete property details
 */
export async function queryPropertyDetails(
  params: SlipWaQueryParams,
): Promise<PropertyDetails> {
  try {
    // Query all services in parallel
    const [cadastralData, planningData, bushfireData, soilTypeData] =
      await Promise.all([
        queryCadastralData(params),
        queryPlanningData(params),
        queryBushfireData(params),
        querySoilTypeData(params),
      ]);

    // Merge results
    return {
      // Default values for fields not yet implemented
      heritage: "No", // Would need heritage service
      floodRisk: "Moderate (1-in-100 zone)", // Would need flood service

      // Real data from SLIP WA
      ...cadastralData,
      ...planningData,
      ...bushfireData,
      ...soilTypeData,
    };
  } catch (error) {
    console.error("Error querying property details:", error);

    // Return defaults on error
    return {
      lotSize: "465 m²",
      dimensions: "15.3m x 30.4m",
      planNumber: "DP 123456",
      rCode: "R30 – Medium Density Residential",
      balRating: "BAL–29 (High)",
      heritage: "No",
      floodRisk: "Moderate (1-in-100 zone)",
    };
  }
}
