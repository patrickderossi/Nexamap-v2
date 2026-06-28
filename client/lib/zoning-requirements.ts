/**
 * Western Australia R-Code Zoning Requirements
 * Based on Table D Site area requirements from Planning and Development (Local Planning Schemes) Regulations 2015
 *
 * Note: When multiple R-Codes are present (e.g., "R17.5/35"), the higher value is automatically used
 * for all calculations to maximize development potential and lot sizing.
 */

import { devLog } from './logger';

export type SubdivisionMode = 'strata' | 'green-title';

export interface ZoningRequirement {
  rCode: string;
  dwellingType: 'grouped' | 'multiple' | 'single' | 'all';
  minSiteArea: number; // minimum site area per dwelling in m²
  avgSiteArea: number; // average site area per dwelling in m²
  minLotArea?: number; // minimum lot area/rear battleaxe in m²
  minLotAreaGreenTitle?: number; // minimum lot area for green title subdivisions in m²
  minFrontage?: number; // minimum frontage in m
  notes?: string;
  partC?: boolean; // indicates if this is Part C zoning
}

/**
 * Comprehensive R-Code requirements extracted from Table D
 */
export const ZONING_REQUIREMENTS: ZoningRequirement[] = [
  // Based on official WA R-Code requirements from provided spreadsheet
  { rCode: 'R2', dwellingType: 'single', minSiteArea: 5000, avgSiteArea: 5000, minFrontage: 50 },
  { rCode: 'R2.5', dwellingType: 'single', minSiteArea: 4000, avgSiteArea: 4000, minFrontage: 40 },
  { rCode: 'R5', dwellingType: 'single', minSiteArea: 2000, avgSiteArea: 2000, minFrontage: 30 },
  { rCode: 'R10', dwellingType: 'single', minSiteArea: 875, avgSiteArea: 1000, minLotArea: 875, minLotAreaGreenTitle: 925, minFrontage: 20 },
  { rCode: 'R10', dwellingType: 'multiple', minSiteArea: 1000, avgSiteArea: 1000 },
  { rCode: 'R12.5', dwellingType: 'single', minSiteArea: 700, avgSiteArea: 800, minLotArea: 700, minLotAreaGreenTitle: 762.5, minFrontage: 17 },
  { rCode: 'R12.5', dwellingType: 'multiple', minSiteArea: 800, avgSiteArea: 800 },
  { rCode: 'R15', dwellingType: 'single', minSiteArea: 580, avgSiteArea: 666, minLotArea: 580, minLotAreaGreenTitle: 655, minFrontage: 12 },
  { rCode: 'R15', dwellingType: 'multiple', minSiteArea: 666, avgSiteArea: 666 },
  { rCode: 'R17.5', dwellingType: 'single', minSiteArea: 500, avgSiteArea: 571, minLotArea: 500, minLotAreaGreenTitle: 587.5, minFrontage: 12 },
  { rCode: 'R17.5', dwellingType: 'multiple', minSiteArea: 571, avgSiteArea: 571 },
  { rCode: 'R20', dwellingType: 'single', minSiteArea: 350, avgSiteArea: 450, minLotArea: 350, minLotAreaGreenTitle: 450, minFrontage: 10 },
  { rCode: 'R20', dwellingType: 'multiple', minSiteArea: 450, avgSiteArea: 450 },
  { rCode: 'R25', dwellingType: 'single', minSiteArea: 300, avgSiteArea: 350, minLotArea: 300, minLotAreaGreenTitle: 425, minFrontage: 8 },
  { rCode: 'R25', dwellingType: 'multiple', minSiteArea: 350, avgSiteArea: 350 },
  { rCode: 'R30', dwellingType: 'single', minSiteArea: 260, avgSiteArea: 300, minLotArea: 260, minLotAreaGreenTitle: 410 },
  { rCode: 'R35', dwellingType: 'single', minSiteArea: 220, avgSiteArea: 260, minLotArea: 220, minLotAreaGreenTitle: 395 },
  { rCode: 'R40', dwellingType: 'single', minSiteArea: 180, avgSiteArea: 220, minLotArea: 180, minLotAreaGreenTitle: 380 },

  // Grouped and Multiple dwellings
  { rCode: 'R30', dwellingType: 'grouped', minSiteArea: 260, avgSiteArea: 300 },
  { rCode: 'R30', dwellingType: 'multiple', minSiteArea: 300, avgSiteArea: 300 },
  { rCode: 'R35', dwellingType: 'grouped', minSiteArea: 220, avgSiteArea: 260 },
  { rCode: 'R35', dwellingType: 'multiple', minSiteArea: 260, avgSiteArea: 260 },
  { rCode: 'R40', dwellingType: 'grouped', minSiteArea: 180, avgSiteArea: 220 },
  { rCode: 'R40', dwellingType: 'multiple', minSiteArea: 115, avgSiteArea: 115 },

  // Higher density residential
  { rCode: 'R50', dwellingType: 'single', minSiteArea: 160, avgSiteArea: 180, minLotArea: 160, partC: true },
  { rCode: 'R50', dwellingType: 'grouped', minSiteArea: 160, avgSiteArea: 180, minLotArea: 160, partC: true },
  { rCode: 'R50', dwellingType: 'multiple', minSiteArea: 100, avgSiteArea: 100, partC: true },
  { rCode: 'R60', dwellingType: 'single', minSiteArea: 120, avgSiteArea: 150, minLotArea: 120, partC: true },
  { rCode: 'R60', dwellingType: 'grouped', minSiteArea: 120, avgSiteArea: 150, minLotArea: 120, partC: true },
  { rCode: 'R60', dwellingType: 'multiple', minSiteArea: 85, avgSiteArea: 85, partC: true },
  { rCode: 'R80', dwellingType: 'single', minSiteArea: 100, avgSiteArea: 120, minLotArea: 100, partC: true },
  { rCode: 'R80', dwellingType: 'grouped', minSiteArea: 100, avgSiteArea: 120, minLotArea: 100, partC: true },
  { rCode: 'R80', dwellingType: 'multiple', minSiteArea: 0, avgSiteArea: 0, partC: true, notes: 'Refer R-Codes Vol. 2' },
  { rCode: 'R100-SL', dwellingType: 'single', minSiteArea: 80, avgSiteArea: 80, partC: true, notes: 'Min 80 / No av applies' },
  { rCode: 'R100-SL', dwellingType: 'grouped', minSiteArea: 80, avgSiteArea: 80, partC: true, notes: 'Min 80 / No av applies' }
];

/**
 * Get zoning requirements for a specific R-Code
 */
export function getZoningRequirements(rCode: string, dwellingType?: 'grouped' | 'multiple' | 'single', subdivisionMode?: SubdivisionMode): ZoningRequirement[] {
  let cleanRCode = rCode.replace(/[^a-zA-Z0-9.-\/]/g, '').toUpperCase();

  // For complex R-Codes like "R17.5/35", use the higher value
  if (cleanRCode.includes('/')) {
    cleanRCode = getHigherRCode(cleanRCode);
    devLog.log(`🔍 Complex R-Code detected: ${rCode}, using higher value: ${cleanRCode}`);
  }

  let requirements = ZONING_REQUIREMENTS.filter(req => req.rCode === cleanRCode);

  if (dwellingType) {
    requirements = requirements.filter(req => req.dwellingType === dwellingType);
  }

  return requirements;
}

/**
 * Extract R-Code from zoning string and return the higher value if multiple exist
 * (e.g., "R30 – Medium Density Residential" -> "R30", "R17.5/35" -> "R35")
 */
export function extractRCode(zoning?: string | null): string | null {
  if (!zoning || typeof zoning !== "string") return null;
  // First try to match complex R-Code patterns like "R17.5/35", "R20/40", etc.
  const complexMatch = zoning.match(/R\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*(?:-\w+)?/i);
  if (complexMatch) {
    const fullMatch = complexMatch[0].toUpperCase();

    // If it contains multiple values separated by "/", use the larger one
    if (fullMatch.includes('/')) {
      return getHigherRCode(fullMatch);
    }

    return fullMatch;
  }

  // Fallback to simple R-Code pattern
  const simpleMatch = zoning.match(/R(\d+(?:\.\d+)?(?:-\w+)?)/i);
  return simpleMatch ? simpleMatch[0].toUpperCase() : null;
}

/**
 * Parse multiple R-Codes and return the higher value
 * (e.g., "R17.5/35" -> "R35", "R20/40" -> "R40")
 */
export function getHigherRCode(rCodeString: string): string {
  // Split by "/" and extract numeric values
  const codes = rCodeString.split('/').map((code, index) => {
    // For the first part, expect "R17.5" format
    // For subsequent parts, expect just "35" format (add R prefix)
    const normalizedCode = index === 0 ? code.trim() : `R${code.trim()}`;
    const match = normalizedCode.match(/R(\d+(?:\.\d+)?)/i);
    return match ? { code: match[0].toUpperCase(), value: parseFloat(match[1]) } : null;
  }).filter(Boolean);

  if (codes.length === 0) {
    return rCodeString; // Return original if can't parse
  }

  if (codes.length === 1) {
    return codes[0]!.code; // Return single code
  }

  // Return the code with the highest numeric value
  const highest = codes.reduce((max, current) =>
    current!.value > max!.value ? current : max
  );

  return highest!.code;
}

/**
 * Calculate subdivision compliance for a given R-Code and lot areas
 */
export interface SubdivisionCompliance {
  isCompliant: boolean;
  totalArea: number;
  avgLotSize: number;
  minLotSize: number;
  maxLotSize: number;
  lotCount: number;
  requirements: ZoningRequirement | null;
  violations: string[];
  recommendations: string[];
}

export function calculateSubdivisionCompliance(
  zoning: string,
  lotAreas: number[],
  dwellingType: 'grouped' | 'multiple' | 'single' = 'single',
  subdivisionMode: SubdivisionMode = 'strata'
): SubdivisionCompliance {
  const rCode = extractRCode(zoning); // This now automatically uses the higher value if multiple exist
  const violations: string[] = [];
  const recommendations: string[] = [];

  if (!rCode) {
    return {
      isCompliant: false,
      totalArea: lotAreas.reduce((sum, area) => sum + area, 0),
      avgLotSize: lotAreas.length > 0 ? lotAreas.reduce((sum, area) => sum + area, 0) / lotAreas.length : 0,
      minLotSize: Math.min(...lotAreas),
      maxLotSize: Math.max(...lotAreas),
      lotCount: lotAreas.length,
      requirements: null,
      violations: ['Could not extract R-Code from zoning information'],
      recommendations: ['Please verify zoning information']
    };
  }

  const requirements = getZoningRequirements(rCode, dwellingType, subdivisionMode);
  const requirement = requirements[0]; // Use first matching requirement
  
  if (!requirement) {
    return {
      isCompliant: false,
      totalArea: lotAreas.reduce((sum, area) => sum + area, 0),
      avgLotSize: lotAreas.length > 0 ? lotAreas.reduce((sum, area) => sum + area, 0) / lotAreas.length : 0,
      minLotSize: Math.min(...lotAreas),
      maxLotSize: Math.max(...lotAreas),
      lotCount: lotAreas.length,
      requirements: null,
      violations: [`No requirements found for ${rCode} ${dwellingType} dwellings`],
      recommendations: ['Check zoning code and dwelling type']
    };
  }
  
  const totalArea = lotAreas.reduce((sum, area) => sum + area, 0);
  const avgLotSize = lotAreas.length > 0 ? totalArea / lotAreas.length : 0;
  const minLotSize = Math.min(...lotAreas);
  const maxLotSize = Math.max(...lotAreas);
  
  // Check average lot size compliance
  if (avgLotSize < requirement.avgSiteArea) {
    violations.push(
      `Average lot size (${Math.round(avgLotSize)}m²) is below required average (${requirement.avgSiteArea}m²)`
    );
    recommendations.push(
      `Reduce number of lots or increase total area. Need ${Math.round(requirement.avgSiteArea * lotAreas.length)}m² total for ${lotAreas.length} lots`
    );
  }
  
  // Check minimum lot size compliance based on subdivision mode
  const effectiveMinLotArea = subdivisionMode === 'green-title' && requirement.minLotAreaGreenTitle
    ? requirement.minLotAreaGreenTitle
    : requirement.minLotArea || requirement.minSiteArea;

  if (minLotSize < effectiveMinLotArea) {
    const modeText = subdivisionMode === 'green-title' ? 'Green Title' : 'Strata';
    violations.push(
      `Smallest lot (${Math.round(minLotSize)}m²) is below minimum ${modeText} size (${effectiveMinLotArea}m²)`
    );
    recommendations.push(
      `Increase size of smallest lot to at least ${effectiveMinLotArea}m² for ${modeText} subdivision`
    );
  }

  // Check individual lot compliance
  const nonCompliantLots = lotAreas.filter(area => {
    return area < effectiveMinLotArea;
  });
  
  if (nonCompliantLots.length > 0) {
    violations.push(
      `${nonCompliantLots.length} lot(s) below minimum size requirements`
    );
  }
  
  // Provide optimization suggestions
  if (violations.length === 0) {
    recommendations.push('Subdivision complies with all zoning requirements');
    
    // Calculate maximum theoretical lots
    const maxPossibleLots = Math.floor(totalArea / requirement.avgSiteArea);
    if (lotAreas.length < maxPossibleLots) {
      recommendations.push(
        `Could potentially accommodate up to ${maxPossibleLots} lots based on total area`
      );
    }
  }
  
  return {
    isCompliant: violations.length === 0,
    totalArea,
    avgLotSize,
    minLotSize,
    maxLotSize,
    lotCount: lotAreas.length,
    requirements: requirement,
    violations,
    recommendations
  };
}

/**
 * Get all available R-Codes for dropdown/selection
 */
export function getAvailableRCodes(): string[] {
  const rCodes = new Set(ZONING_REQUIREMENTS.map(req => req.rCode));
  return Array.from(rCodes).sort((a, b) => {
    // Custom sort to handle R-codes properly (R2, R2.5, R5, R10, etc.)
    const aNum = parseFloat(a.replace('R', '').replace('-SL', ''));
    const bNum = parseFloat(b.replace('R', '').replace('-SL', ''));
    return aNum - bNum;
  });
}

/**
 * Get dwelling types available for a specific R-Code
 */
export function getDwellingTypes(rCode: string): string[] {
  const requirements = getZoningRequirements(rCode);
  return Array.from(new Set(requirements.map(req => req.dwellingType)));
}

/**
 * Get effective minimum lot area based on subdivision mode
 */
export function getEffectiveMinLotArea(requirement: ZoningRequirement, subdivisionMode: SubdivisionMode): number {
  return subdivisionMode === 'green-title' && requirement.minLotAreaGreenTitle
    ? requirement.minLotAreaGreenTitle
    : requirement.minLotArea || requirement.minSiteArea;
}

/**
 * Extract all R-Code values from a complex string for display purposes
 * (e.g., "R17.5/35" -> ["R17.5", "R35"])
 */
export function getAllRCodes(zoning: string): string[] {
  const complexMatch = zoning.match(/R\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*(?:-\w+)?/i);
  if (complexMatch && complexMatch[0].includes('/')) {
    return complexMatch[0].split('/').map((code, index) => {
      if (index === 0) return code.toUpperCase();
      return `R${code}`;
    });
  }

  const singleCode = extractRCode(zoning);
  return singleCode ? [singleCode] : [];
}

/**
 * Get display string showing which R-Code is being used for calculations
 * (e.g., "R17.5/35 (using R35 for calculations)")
 */
export function getRCodeDisplayString(zoning: string): string {
  const allCodes = getAllRCodes(zoning);
  const usedCode = extractRCode(zoning);

  if (allCodes.length > 1 && usedCode) {
    const originalString = allCodes.join('/');
    return `${originalString} (using ${usedCode} for calculations)`;
  }

  return usedCode || 'Unknown R-Code';
}

/**
 * Get R-Code display info with separate main display and calculation note
 */
export function getRCodeDisplayInfo(zoning: string): {
  mainDisplay: string;
  calculationNote?: string;
} {
  const allCodes = getAllRCodes(zoning);
  const usedCode = extractRCode(zoning);

  if (allCodes.length > 1 && usedCode) {
    const originalString = allCodes.join('/');
    return {
      mainDisplay: originalString,
      calculationNote: `using ${usedCode} for calculations`
    };
  }

  return {
    mainDisplay: usedCode || 'Unknown R-Code'
  };
}
