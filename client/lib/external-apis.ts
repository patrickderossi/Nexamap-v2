// External (non-SLIP) public APIs for NexaMap property intelligence.
// All endpoints are free, no API key required, confirmed live 2026-06.
//
//   ABS ASGS2021  — postcode, SA2 suburb area        geo.abs.gov.au
//   OpenTopoData  — site elevation (SRTM 30m AHD)    api.opentopodata.org
//   Main Roads WA — road classification               gisservices.mainroads.wa.gov.au

import { devLog } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExternalPropertyData {
  elevationM?: number;
  postcode?: string;
  sa2Name?: string;
  roadClassification?: string;
  roadNetworkType?: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function absAsgsPoint(service: string, lng: number, lat: number): Promise<Record<string, any> | null> {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(
    `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/${service}/MapServer/0/query?${params}`,
  );
  const data = await res.json();
  return data?.features?.[0]?.attributes ?? null;
}

// ---------------------------------------------------------------------------
// 1. Elevation — OpenTopoData SRTM 30m (free, no auth)
//    Returns elevation in metres AHD (~30m horizontal resolution)
// ---------------------------------------------------------------------------

export async function queryElevation(lat: number, lng: number): Promise<number | undefined> {
  try {
    const res = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${lat},${lng}`);
    const data = await res.json();
    const elevation = data?.results?.[0]?.elevation;
    if (elevation != null) {
      devLog.log(`⛰️ Elevation [${lat},${lng}]: ${elevation}m AHD`);
      return typeof elevation === "number" ? Math.round(elevation * 10) / 10 : undefined;
    }
  } catch (err) {
    devLog.error("❌ Elevation query failed:", err);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 2. Postcode + SA2 suburb — ABS ASGS2021 (free, no auth)
//    POA → Australian postcode (e.g. "6153")
//    SA2 → ABS Statistical Area Level 2 name (suburb-scale, e.g. "Mount Pleasant")
// ---------------------------------------------------------------------------

export async function queryPostcodeAndSA2(
  lat: number,
  lng: number,
): Promise<Pick<ExternalPropertyData, "postcode" | "sa2Name">> {
  try {
    const [poaAttrs, sa2Attrs] = await Promise.all([
      absAsgsPoint("POA", lng, lat),
      absAsgsPoint("SA2", lng, lat),
    ]);
    devLog.log("📮 ABS POA:", poaAttrs?.POA_CODE_2021, "SA2:", sa2Attrs?.SA2_NAME_2021);
    return {
      postcode: poaAttrs?.POA_CODE_2021 ? String(poaAttrs.POA_CODE_2021) : undefined,
      sa2Name: sa2Attrs?.SA2_NAME_2021 || undefined,
    };
  } catch (err) {
    devLog.error("❌ ABS ASGS query failed:", err);
    return {};
  }
}


// ---------------------------------------------------------------------------
// 4. Road classification — Main Roads WA ArcGIS (free, no auth)
//    Uses Road Hierarchy layer (16) with 30m buffer to handle polyline geometry.
//    Returns the road type fronting the property.
// ---------------------------------------------------------------------------

export async function queryRoadClassification(
  lat: number,
  lng: number,
): Promise<Pick<ExternalPropertyData, "roadClassification" | "roadNetworkType">> {
  try {
    const params = new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "ROAD_NAME,ROAD_HIERARCHY,NETWORK_TYPE,LG_NAME",
      returnGeometry: "false",
      maxRecordCount: "1",
      distance: "30",
      units: "esriSRUnit_Meter",
    });
    const res = await fetch(
      `https://gisservices.mainroads.wa.gov.au/arcgis/rest/services/OpenData/RoadAssets_DataPortal/MapServer/16/query?${params}`,
    );
    const data = await res.json();
    const attrs = data?.features?.[0]?.attributes;
    devLog.log("🛣️ Road hierarchy:", attrs);

    if (attrs?.ROAD_HIERARCHY) {
      return {
        roadClassification: attrs.ROAD_HIERARCHY,
        roadNetworkType: attrs.NETWORK_TYPE || undefined,
      };
    }
  } catch (err) {
    devLog.error("❌ Road classification query failed:", err);
  }
  return {};
}

// ---------------------------------------------------------------------------
// Master external query — all sources run in parallel
// ---------------------------------------------------------------------------

export async function queryExternalApis(lat: number, lng: number): Promise<ExternalPropertyData> {
  devLog.log("🌐 Starting external API queries (elevation, ABS, roads)...");

  const [elevResult, absResult, roadResult] = await Promise.all([
    queryElevation(lat, lng).then((elevationM) => ({ elevationM })),
    queryPostcodeAndSA2(lat, lng),
    queryRoadClassification(lat, lng),
  ]);

  const result: ExternalPropertyData = {
    ...elevResult,
    ...absResult,
    ...roadResult,
  };

  devLog.log("✅ External APIs complete:", result);
  return result;
}
