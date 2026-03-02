/**
 * Utility to fetch all distinct soil codes from SLIP WA Soil_Landscape layer 26
 */

import { devLog } from "./logger";

interface SoilCodeResult {
  codes: string[];
  count: number;
  error?: string;
}

/**
 * Fetch all distinct soil codes from the SLIP WA Soil_Landscape layer 26
 * Uses the MapServer query endpoint with statistics to get unique values
 */
export async function getAllSoilCodes(): Promise<SoilCodeResult> {
  try {
    const baseUrl = `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Soil_Landscape/MapServer/26/query`;

    // First, try to query with distinct values for PROJ_CODE field
    const queryParams = new URLSearchParams({
      f: "json",
      returnDistinctValues: "true",
      returnGeometry: "false",
      orderByFields: "PROJ_CODE",
      outFields: "PROJ_CODE",
      where: "1=1",
    });

    devLog.log("🌱 Fetching distinct soil codes from SLIP WA...");

    const response = await fetch(`${baseUrl}?${queryParams}`);
    const data = await response.json();

    devLog.log("🌱 SLIP WA distinct values response:", data);

    if (data.features && Array.isArray(data.features)) {
      const codes = data.features
        .map((f: any) => f.attributes?.PROJ_CODE)
        .filter((code: any) => code !== null && code !== undefined)
        .sort();

      devLog.log(`🌱 Found ${codes.length} distinct soil codes`);
      return {
        codes: Array.from(new Set(codes)), // Remove duplicates
        count: codes.length,
      };
    }

    // If that doesn't work, try alternative approach - query with statistics
    const statsParams = new URLSearchParams({
      f: "json",
      where: "1=1",
      outStatistics: JSON.stringify([
        {
          statisticType: "count",
          onStatisticField: "PROJ_CODE",
          outStatisticFieldName: "count",
        },
      ]),
    });

    const statsResponse = await fetch(`${baseUrl}?${statsParams}`);
    const statsData = await statsResponse.json();

    devLog.log("🌱 Stats response:", statsData);

    // Try another approach - get all records and extract unique codes
    const allCodesParams = new URLSearchParams({
      f: "json",
      returnGeometry: "false",
      where: "1=1",
      outFields: "PROJ_CODE",
      resultRecordCount: "10000", // Get up to 10k records
      resultOffset: "0",
    });

    const allResponse = await fetch(`${baseUrl}?${allCodesParams}`);
    const allData = await allResponse.json();

    devLog.log("🌱 All records response:", allData);

    if (allData.features && Array.isArray(allData.features)) {
      const uniqueCodes = Array.from(
        new Set(
          allData.features
            .map((f: any) => f.attributes?.PROJ_CODE)
            .filter((code: any) => code !== null && code !== undefined),
        ),
      ).sort();

      devLog.log(`🌱 Extracted ${uniqueCodes.length} unique soil codes`);
      return {
        codes: uniqueCodes as string[],
        count: uniqueCodes.length,
      };
    }

    return {
      codes: [],
      count: 0,
      error: "No data returned from SLIP WA service",
    };
  } catch (error) {
    devLog.error("🌱 Error fetching soil codes:", error);
    return {
      codes: [],
      count: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
