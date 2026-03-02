#!/usr/bin/env node

/**
 * Fetch all distinct soil codes from SLIP WA Soil_Landscape layer 26
 * Run with: node get-soil-codes-list.js
 */

async function getAllSoilCodes() {
  try {
    const baseUrl =
      "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Soil_Landscape/MapServer/26/query";

    console.log("🌱 Fetching all soil codes from SLIP WA layer 26...\n");

    const allFeatures = [];
    let resultOffset = 0;
    const resultRecordCount = 1000;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      pageCount++;
      console.log(`📄 Fetching page ${pageCount} (offset: ${resultOffset})...`);

      const queryParams = new URLSearchParams({
        f: "json",
        returnGeometry: "false",
        where: "1=1",
        outFields: "proj_code",
        resultRecordCount: String(resultRecordCount),
        resultOffset: String(resultOffset),
      });

      const response = await fetch(`${baseUrl}?${queryParams}`);
      const data = await response.json();

      if (data.error) {
        console.error("❌ Error from SLIP WA:", data.error.message);
        process.exit(1);
      }

      if (!data.features || data.features.length === 0) {
        console.log("No more features");
        hasMore = false;
        break;
      }

      allFeatures.push(...data.features);
      console.log(`  ✓ Got ${data.features.length} records`);

      if (!data.exceededTransferLimit) {
        hasMore = false;
      }

      resultOffset += resultRecordCount;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const data = { features: allFeatures, exceededTransferLimit: false };

    if (!data.features || data.features.length === 0) {
      console.log("No features found");
      process.exit(0);
    }

    // Show available fields from first feature
    if (data.features.length > 0) {
      console.log("Available fields in response:");
      const fields = Object.keys(data.features[0].attributes || {});
      fields.forEach((field) => {
        console.log(`  - ${field}: ${data.features[0].attributes[field]}`);
      });
      console.log("\n");
    }

    // Try multiple field names for soil codes
    const fieldOptions = [
      "proj_code",
      "PROJ_CODE",
      "wasg_decode",
      "WASG_DECODE",
      "STY",
      "SOIL_TYPE",
      "SoilType",
      "SOIL_CLASS",
    ];
    let soilCodeField = null;

    for (const field of fieldOptions) {
      if (
        data.features[0].attributes &&
        data.features[0].attributes[field] !== undefined
      ) {
        soilCodeField = field;
        break;
      }
    }

    if (!soilCodeField) {
      console.log("Could not find soil code field. Using proj_code anyway...");
      soilCodeField = "proj_code";
    }

    console.log(`Using field: ${soilCodeField}\n`);

    // Extract and deduplicate codes
    const codes = Array.from(
      new Set(
        data.features
          .map((f) => f.attributes?.[soilCodeField])
          .filter((code) => code !== null && code !== undefined)
          .map((code) => String(code).trim()),
      ),
    ).sort();

    console.log(`✅ Found ${codes.length} unique soil codes:\n`);
    console.log("CODE LISTING:");
    console.log("=".repeat(60));

    codes.forEach((code, index) => {
      console.log(`${(index + 1).toString().padStart(4, " ")}. ${code}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log(`\nTotal: ${codes.length} codes`);

    if (data.exceededTransferLimit) {
      console.log(
        "\n⚠️  Note: Query exceeded transfer limit, list may be incomplete",
      );
    }

    console.log(`Records returned: ${data.features.length}`);

    console.log("\n📊 Summary:");
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

getAllSoilCodes();
