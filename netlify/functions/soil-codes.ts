import { Handler } from "@netlify/functions";

const handler: Handler = async (event, context) => {
  try {
    const baseUrl = `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Soil_Landscape/MapServer/26/query`;

    // Query all records with PROJ_CODE field
    const queryParams = new URLSearchParams({
      f: "json",
      returnGeometry: "false",
      where: "1=1",
      outFields: "PROJ_CODE,WASG_DECODE",
      resultRecordCount: "10000",
      resultOffset: "0",
      orderByFields: "PROJ_CODE",
    });

    console.log("🌱 Fetching soil codes from SLIP WA...");

    const response = await fetch(`${baseUrl}?${queryParams}`);
    const data = await response.json();

    if (data.error) {
      console.error("SLIP WA API error:", data.error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to fetch soil codes",
          details: data.error,
        }),
      };
    }

    if (data.features && Array.isArray(data.features)) {
      // Extract unique codes
      const soilCodes = Array.from(
        new Set(
          data.features
            .map((f: any) => f.attributes?.PROJ_CODE)
            .filter((code: any) => code !== null && code !== undefined)
            .map((code: any) => String(code).trim()),
        ),
      ).sort();

      console.log(`✅ Found ${soilCodes.length} unique soil codes`);

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          success: true,
          count: soilCodes.length,
          codes: soilCodes,
          total_records_returned: data.features.length,
          exceeds_max: data.exceededTransferLimit === true,
        }),
      };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({
        error: "No features returned from SLIP WA",
      }),
    };
  } catch (error) {
    console.error("❌ Error fetching soil codes:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

export { handler };
