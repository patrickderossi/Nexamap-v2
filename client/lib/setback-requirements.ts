/**
 * Western Australia R-Code Setback and Site Coverage Requirements
 * Based on R-Codes of Australia (WA) Volume 1 - Table 2a and 2b
 */

import * as turf from '@turf/turf';
import { devLog } from './logger';

export interface SetbackRequirements {
  rCode: string;
  front: number;         // Primary street setback in metres
  secondaryStreet: number; // Secondary street setback in metres (includes communal streets, private streets, rights-of-way)
  rearOther: number | string; // Rear/Other setback in metres (or "*" for height/length-based rules)
  maxSiteCoverage: number;    // Maximum site coverage percentage (100 - Open Space %)
  openSpacePercent: number;   // Required open space percentage
  maxHeight?: number;         // Maximum building height in metres
  notes?: string;
}

/**
 * Official R-Code Setbacks & Site Cover requirements (April 2024 Update)
 * Based on WA R-Codes official documentation
 *
 * Key Notes:
 * - Max Site Cover = 100 - "Open Space" figure
 * - "*" Rear setback = Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules
 * - Secondary street includes communal streets, private streets, rights-of-way
 * - For multiple dwellings, open space is slightly different but setbacks follow the same pattern
 */
export const SETBACK_REQUIREMENTS: SetbackRequirements[] = [
  // Low Density Residential
  {
    rCode: 'R2',
    front: 20,
    secondaryStreet: 10,
    rearOther: 10,
    maxSiteCoverage: 20,
    openSpacePercent: 80,
    notes: 'Low density residential'
  },
  {
    rCode: 'R2.5',
    front: 15,
    secondaryStreet: 7.5,
    rearOther: 7.5,
    maxSiteCoverage: 20,
    openSpacePercent: 80,
    notes: 'Low density residential'
  },
  {
    rCode: 'R5',
    front: 12,
    secondaryStreet: 6,
    rearOther: 6,
    maxSiteCoverage: 30,
    openSpacePercent: 70,
    notes: 'Rear setback: minimum 6m or refer to Tables 2a/2b & Clause 5.1.3'
  },

  // Medium Density Residential
  {
    rCode: 'R10',
    front: 7.5,
    secondaryStreet: 3,
    rearOther: 6,
    maxSiteCoverage: 40,
    openSpacePercent: 60,
    notes: 'Rear setback: minimum 6m or refer to Tables 2a/2b & Clause 5.1.3'
  },
  {
    rCode: 'R12.5',
    front: 7.5,
    secondaryStreet: 2,
    rearOther: 6,
    maxSiteCoverage: 45,
    openSpacePercent: 55,
    notes: 'Rear setback: minimum 6m or refer to Tables 2a/2b & Clause 5.1.3'
  },
  {
    rCode: 'R15',
    front: 6,
    secondaryStreet: 1.5,
    rearOther: 6,
    maxSiteCoverage: 50,
    openSpacePercent: 50,
    notes: 'Rear setback: minimum 6m or refer to Tables 2a/2b & Clause 5.1.3'
  },
  {
    rCode: 'R17.5',
    front: 6,
    secondaryStreet: 1.5,
    rearOther: '*',
    maxSiteCoverage: 50,
    openSpacePercent: 50,
    notes: 'Rear setback: Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules'
  },
  {
    rCode: 'R20',
    front: 6,
    secondaryStreet: 1.5,
    rearOther: '*',
    maxSiteCoverage: 50,
    openSpacePercent: 50,
    notes: 'Rear setback: Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules'
  },
  {
    rCode: 'R25',
    front: 6,
    secondaryStreet: 1.5,
    rearOther: '*',
    maxSiteCoverage: 50,
    openSpacePercent: 50,
    notes: 'Rear setback: Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules'
  },
  {
    rCode: 'R30',
    front: 4,
    secondaryStreet: 1.5,
    rearOther: '*',
    maxSiteCoverage: 55,
    openSpacePercent: 45,
    notes: 'Rear setback: Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules'
  },
  {
    rCode: 'R35',
    front: 4,
    secondaryStreet: 1.5,
    rearOther: '*',
    maxSiteCoverage: 55,
    openSpacePercent: 45,
    notes: 'Rear setback: Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules'
  },
  {
    rCode: 'R40',
    front: 4,
    secondaryStreet: 1.0,
    rearOther: '*',
    maxSiteCoverage: 55,
    openSpacePercent: 45,
    notes: 'Rear setback: Refer to Tables 2a/2b & Clause 5.1.3 for wall-height/length-based rules'
  }
];

/**
 * Get setback requirements for a specific R-Code
 */
export function getSetbackRequirements(rCode: string): SetbackRequirements {
  const cleanRCode = rCode.replace(/[^a-zA-Z0-9.-]/g, '').toUpperCase();
  
  // Find exact match first
  let requirement = SETBACK_REQUIREMENTS.find(req => req.rCode === cleanRCode);
  
  // If no exact match, try to find closest lower R-Code
  if (!requirement) {
    const numericValue = parseFloat(cleanRCode.replace('R', '').replace('-SL', ''));
    
    // Find all R-Codes with numeric values <= requested code
    const applicableRequirements = SETBACK_REQUIREMENTS
      .filter(req => {
        const reqValue = parseFloat(req.rCode.replace('R', '').replace('-SL', ''));
        return reqValue <= numericValue;
      })
      .sort((a, b) => {
        const aValue = parseFloat(a.rCode.replace('R', '').replace('-SL', ''));
        const bValue = parseFloat(b.rCode.replace('R', '').replace('-SL', ''));
        return bValue - aValue; // Descending order
      });
    
    requirement = applicableRequirements[0];
  }
  
  // Fallback to R30 if nothing found
  if (!requirement) {
    devLog.warn(`No setback requirements found for ${rCode}, using R30 defaults`);
    requirement = SETBACK_REQUIREMENTS.find(req => req.rCode === 'R30')!;
  }
  
  return requirement;
}

/**
 * Calculate maximum building footprint based on setbacks and site coverage
 */
export interface FootprintAnalysis {
  buildableArea: number;           // Area remaining after setbacks (m²)
  maxFootprintBySetbacks: number;  // Max footprint limited by setbacks (m²)
  maxFootprintByCoverage: number;  // Max footprint limited by site coverage (m²)
  finalMaxFootprint: number;       // Actual maximum footprint (m²)
  maxSiteCoverage: number;         // Maximum allowed site coverage (%)
  actualCoverage: number;          // Actual coverage if max footprint is used (%)
  limitingFactor: 'setbacks' | 'site coverage'; // What limits the footprint
}

export function calculateMaxBuildFootprint(
  lotArea: number,
  setbacks: SetbackRequirements,
  geometry?: any
): FootprintAnalysis {
  let buildableArea: number;
  let maxFootprintBySetbacks: number;

  // Try to use geometry-based calculation if geometry is provided
  if (geometry) {
    try {
      // Import here to avoid circular dependencies
      const { calculateSetbackGeometry } = require('./setback-geometry');

      // Calculate using actual geometry with footprint included for info panel
      const setbackGeometry = calculateSetbackGeometry(
        geometry,
        setbacks,
        lotArea,
        true, // Include footprint for info panel calculations\n        undefined // No polygon data available in this context for street detection
      );

      if (setbackGeometry && setbackGeometry.buildablePolygon) {
        // Use turf to calculate actual buildable area
        const turf = require('@turf/turf');
        buildableArea = turf.area(setbackGeometry.buildablePolygon);
        maxFootprintBySetbacks = buildableArea;

        devLog.log('📐 Using geometry-based footprint calculation');
      } else {
        throw new Error('Geometry calculation failed');
      }
    } catch (error) {
      devLog.warn('⚠️ Geometry-based calculation failed, falling back to rectangular approximation:', error);
      // Fall back to rectangular calculation
      ({ buildableArea, maxFootprintBySetbacks } = calculateRectangularFootprint(lotArea, setbacks));
    }
  } else {
    // Use rectangular approximation when no geometry is provided
    ({ buildableArea, maxFootprintBySetbacks } = calculateRectangularFootprint(lotArea, setbacks));
  }

  // Maximum footprint by site coverage percentage
  const maxFootprintByCoverage = lotArea * (setbacks.maxSiteCoverage / 100);

  // Final maximum is limited by whichever is smaller
  const finalMaxFootprint = Math.min(maxFootprintBySetbacks, maxFootprintByCoverage);
  const limitingFactor = maxFootprintBySetbacks < maxFootprintByCoverage ? 'setbacks' : 'site coverage';

  // Calculate actual coverage percentage
  const actualCoverage = (finalMaxFootprint / lotArea) * 100;

  return {
    buildableArea,
    maxFootprintBySetbacks,
    maxFootprintByCoverage,
    finalMaxFootprint,
    maxSiteCoverage: setbacks.maxSiteCoverage,
    actualCoverage,
    limitingFactor
  };
}

/**
 * Fallback rectangular calculation for when geometry is not available
 */
function calculateRectangularFootprint(
  lotArea: number,
  setbacks: SetbackRequirements
): { buildableArea: number; maxFootprintBySetbacks: number } {
  // Estimate lot dimensions (assume roughly rectangular)
  const aspectRatio = 1.5; // Typical residential lot ratio
  const lotWidth = Math.sqrt(lotArea / aspectRatio);
  const lotDepth = lotArea / lotWidth;

  // Handle rear setback - use 4m default for "*" cases (height/length-based rules)
  const rearSetback = typeof setbacks.rearOther === 'string' ? 4 : setbacks.rearOther;

  // For side setbacks, assume secondary street is used as side setback
  const sideSetback = setbacks.secondaryStreet;

  // Calculate buildable dimensions after setbacks
  const buildableWidth = Math.max(0, lotWidth - (sideSetback * 2));
  const buildableDepth = Math.max(0, lotDepth - setbacks.front - rearSetback);

  // Buildable area after setbacks
  const buildableArea = buildableWidth * buildableDepth;
  const maxFootprintBySetbacks = buildableArea;

  return { buildableArea, maxFootprintBySetbacks };
}

/**
 * Calculate setback lines geometry for map display
 * Returns coordinates for drawing setback lines on the map
 */
export interface SetbackLines {
  primaryStreet: [number, number][];
  secondaryStreet: [number, number][];
  rearOther: [number, number][];
  buildEnvelope: [number, number][]; // Maximum build area polygon
}

export function calculateSetbackLines(
  propertyGeometry: any,
  setbacks: SetbackRequirements
): SetbackLines | null {
  // This is a simplified implementation
  // In a real system, this would use proper geometry libraries to:
  // 1. Identify which edges are front, side, rear based on street frontage
  // 2. Create inward buffers for each setback distance
  // 3. Return precise coordinate arrays for drawing
  
  devLog.log('🏗️ Calculating setback lines for property geometry');
  
  // For now, return null - this would be implemented with turf.js or similar
  // geometry processing to create proper setback polygons
  return null;
}

/**
 * Get all available R-Codes with setback requirements
 */
export function getAvailableSetbackRCodes(): string[] {
  return SETBACK_REQUIREMENTS.map(req => req.rCode).sort((a, b) => {
    const aNum = parseFloat(a.replace('R', '').replace('-SL', ''));
    const bNum = parseFloat(b.replace('R', '').replace('-SL', ''));
    return aNum - bNum;
  });
}

/**
 * Get human-readable description of setback requirements
 */
export function getSetbackDescription(rCode: string): string {
  const requirements = getSetbackRequirements(rCode);
  const rearDisplay = typeof requirements.rearOther === 'string' ? requirements.rearOther : `${requirements.rearOther}m`;

  return `${requirements.rCode}: Primary St ${requirements.front}m, Secondary St ${requirements.secondaryStreet}m, Rear ${rearDisplay}, Max coverage ${requirements.maxSiteCoverage}%`;
}

/**
 * Check if a proposed building footprint complies with setback requirements
 */
export function validateBuildingFootprint(
  lotArea: number,
  proposedFootprint: number,
  setbacks: SetbackRequirements
): {
  isCompliant: boolean;
  violations: string[];
  recommendations: string[];
} {
  const violations: string[] = [];
  const recommendations: string[] = [];
  
  // Check site coverage compliance
  const actualCoverage = (proposedFootprint / lotArea) * 100;
  if (actualCoverage > setbacks.maxSiteCoverage) {
    violations.push(
      `Site coverage ${actualCoverage.toFixed(1)}% exceeds maximum ${setbacks.maxSiteCoverage}%`
    );
    recommendations.push(
      `Reduce building footprint to maximum ${Math.floor(lotArea * setbacks.maxSiteCoverage / 100)}m²`
    );
  }
  
  // Additional setback validation would require actual building coordinates
  // to check against setback lines
  
  if (violations.length === 0) {
    recommendations.push('Proposed footprint complies with site coverage requirements');
  }
  
  return {
    isCompliant: violations.length === 0,
    violations,
    recommendations
  };
}
