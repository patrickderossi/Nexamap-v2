/**
 * Soil Classification System for Western Australia
 * Based on SLIP WA Soil_Landscape layer 26 codes
 */

// Primary soil family definitions
const PRIMARY_SOIL_FAMILIES: Record<
  string,
  {
    name: string;
    description: string;
    characteristics: string[];
  }
> = {
  Bs: {
    name: "Bassendean Sand",
    description: "Deep, pale siliceous sand",
    characteristics: [
      "Very low clay, non-calcareous",
      "Extremely well drained",
      "Perth coastal plain (older dunes)",
      "High permeability",
      "Low bearing capacity",
    ],
  },
  Sp: {
    name: "Spearwood Sand",
    description: "Calcareous sand with limestone influence",
    characteristics: [
      "Moderate carbonate content",
      "Can be cemented in places",
      "Better bearing than Bassendean",
      "Well drained",
      "Coastal and near-coastal areas",
    ],
  },
  Qd: {
    name: "Quindalup Dunes",
    description: "Young coastal dunes with loose, shifting quartz sand",
    characteristics: [
      "Very high permeability",
      "Often unstable without compaction",
      "Low bearing capacity",
      "Recent formation",
      "Near-surface dune mobility",
    ],
  },
  Gu: {
    name: "Guildford Clay",
    description: "Alluvial clay and clay loam",
    characteristics: [
      "Poor drainage",
      "Moderate to high reactivity",
      "Floodplains and river flats",
      "Prone to compressibility",
      "Seasonally waterlogged",
    ],
  },
  Pn: {
    name: "Pinjarra Plain",
    description: "Loams and clays in agricultural lowlands",
    characteristics: [
      "Duplex profiles common",
      "Moderate drainage",
      "Agricultural lowlands",
      "Moderate bearing capacity",
      "Seasonal water table fluctuation",
    ],
  },
  Le: {
    name: "Lateritic Earths",
    description: "Gravelly laterite with ironstone",
    characteristics: [
      "Ironstone rich",
      "Shallow profiles",
      "Common in Darling Range foothills",
      "High bearing capacity",
      "Laterite hardpan presence",
    ],
  },
  Dr: {
    name: "Darling Range Residual Soils",
    description: "Weathered rock residuals",
    characteristics: [
      "Gravel, clay, laterite mix",
      "Shallow to moderate depth",
      "Variable bearing",
      "Darling Range area",
      "Derived from granite/gneiss parent material",
    ],
  },
  Sw: {
    name: "Swamp / Wetland Soils",
    description: "Peat and organic clay",
    characteristics: [
      "Permanently or seasonally wet",
      "Extremely compressible",
      "High risk sites",
      "High organic content",
      "Very poor bearing capacity",
    ],
  },
  Al: {
    name: "Alluvial Soils",
    description: "Mixed sand, silt, and clay",
    characteristics: [
      "Stratified layers",
      "Variable drainage and bearing",
      "River valleys and creeks",
      "Recent deposition",
      "Flood-prone areas",
    ],
  },
};

// Modifier codes
const MODIFIERS: Record<string, string> = {
  s: "sandy",
  l: "loamy",
  c: "clayey",
  g: "gravelly",
  w: "wet or seasonally wet",
  d: "duplex soil profile",
  p: "perched water table",
  h: "hardpan / cemented layer",
  u: "upland",
  f: "floodplain",
};

// Vegetation associations (informational only)
const VEGETATION_ASSOCIATIONS: Record<string, string> = {
  Ja: "Jarrah",
  Ba: "Banksia",
  Tu: "Tuart",
  Ma: "Marri",
  Sw: "Swamp vegetation",
  Yw: "York Gum / Wandoo",
  Ct: "Casuarina",
  Ml: "Marri/Jarrah",
};

/**
 * Parse soil code and extract components
 * Example: "212Bs__Ja" -> { mapCode: "212", primary: "Bs", modifiers: "", vegetation: "Ja" }
 */
function parseSoilCode(code: string): {
  mapCode: string;
  primary: string;
  modifiers: string;
  vegetation: string;
} | null {
  // Match pattern: digits + 2 letter primary + optional modifiers + optional vegetation
  const match = code.match(/^(\d+)([A-Z][a-z])([a-z]*)([A-Z][a-z]*)?$/);

  if (!match) {
    return null;
  }

  return {
    mapCode: match[1],
    primary: match[2],
    modifiers: match[3] || "",
    vegetation: match[4] || "",
  };
}

/**
 * Generate a detailed soil classification report
 */
export function generateSoilReport(soilCode: string): string {
  if (!soilCode || soilCode === "Unknown") {
    return "No soil classification data available";
  }

  const parsed = parseSoilCode(soilCode);

  if (!parsed) {
    return `Unrecognized soil code format: ${soilCode}`;
  }

  const { mapCode, primary, modifiers, vegetation } = parsed;
  const familyInfo = PRIMARY_SOIL_FAMILIES[primary];

  if (!familyInfo) {
    return `Unknown soil family code: ${primary}`;
  }

  // Build the report
  let report = `${familyInfo.name}\n`;
  report += `${familyInfo.description}\n\n`;

  // Add modifier information if present
  if (modifiers) {
    const modifierDescriptions = modifiers
      .split("")
      .map((mod) => MODIFIERS[mod])
      .filter(Boolean);

    if (modifierDescriptions.length > 0) {
      report += `Characteristics:\n`;
      modifierDescriptions.forEach((mod) => {
        report += `• ${mod}\n`;
      });
      report += "\n";
    }
  }

  // Add base characteristics
  report += `General Characteristics:\n`;
  familyInfo.characteristics.forEach((char) => {
    report += `• ${char}\n`;
  });

  // Add vegetation association if present
  if (vegetation) {
    const vegName = VEGETATION_ASSOCIATIONS[vegetation];
    if (vegName) {
      report += `\nVegetation Association: ${vegName}`;
    }
  }

  return report;
}

/**
 * Get a short summary of soil classification
 */
export function getSoilSummary(soilCode: string): string {
  if (!soilCode || soilCode === "Unknown") {
    return "Unknown";
  }

  const parsed = parseSoilCode(soilCode);

  if (!parsed) {
    return soilCode;
  }

  const familyInfo = PRIMARY_SOIL_FAMILIES[parsed.primary];
  if (!familyInfo) {
    return soilCode;
  }

  let summary = familyInfo.name;

  if (parsed.modifiers) {
    const modDescriptions = parsed.modifiers
      .split("")
      .map((mod) => MODIFIERS[mod])
      .filter(Boolean);
    if (modDescriptions.length > 0) {
      summary += ` (${modDescriptions.join(", ")})`;
    }
  }

  return summary;
}
