import { devLog } from "@/lib/logger";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  X,
  Info
} from 'lucide-react';
import { getZoningRequirements, extractRCode, SubdivisionMode, getEffectiveMinLotArea } from '@/lib/zoning-requirements';
import type { SelectedParcel, PropertyData } from "../../shared/types";

interface LotYieldPanelProps {
  selectedParcel?: SelectedParcel;
  propertyData?: PropertyData | null;
  show?: boolean;
  onClose?: () => void;
  className?: string;
}

interface YieldEstimate {
  maxLots: number;
  area: number;
  rCode: string;
  subdivisionMode: SubdivisionMode;
  requirements: {
    minLotSize: number;
    avgSiteArea: number;
    minFrontage?: number;
  };
  efficiency: number;
  remainingArea: number;
}

export function LotYieldPanel({
  selectedParcel,
  propertyData,
  show = false,
  onClose,
  className = ""
}: LotYieldPanelProps) {
  const [subdivisionMode, setSubdivisionMode] = useState<SubdivisionMode>('strata');
  const [estimate, setEstimate] = useState<YieldEstimate | null>(null);

  const calculateYield = () => {
    devLog.log('🎯 calculateYield called with selectedParcel:', selectedParcel);

    if (!selectedParcel) {
      devLog.warn('❌ No selectedParcel provided to calculateYield');
      return;
    }

    devLog.log('🏠 LotYieldPanel selectedParcel data:', selectedParcel);

    // Use the main property data (same source as Site Analysis panel)
    devLog.log('🏠 LotYieldPanel main propertyData:', propertyData);
    devLog.log('🏠 LotYieldPanel selectedParcel:', selectedParcel);

    // Get area from main property data (same source as Site Analysis panel)
    // The Site Analysis panel uses propertyData.lotSize primarily
    const rawArea = propertyData?.lotSize ||
                    propertyData?.area ||
                    selectedParcel?.data?.area ||
                    800; // fallback

    // Ensure area is a valid number and handle string parsing
    let area = 800; // default fallback
    if (typeof rawArea === 'string') {
      // Handle string format like "800 m²" or "800m²"
      const numericValue = parseFloat(rawArea.replace(/[^\d.]/g, ''));
      area = isNaN(numericValue) ? 800 : numericValue;
    } else if (typeof rawArea === 'number' && !isNaN(rawArea)) {
      area = rawArea;
    }

    // Get zoning from main property data (same as Site Analysis panel uses)
    const zoning = propertyData?.zoning || 'R35'; // The main data should have the R-Code

    devLog.log('🏠 LotYieldPanel final extraction:', {
      area,
      rawArea,
      zoning,
      'propertyData.lotSize': propertyData?.lotSize,
      'propertyData.area': propertyData?.area,
      'selectedParcel?.data?.area': selectedParcel?.data?.area,
      'propertyData.zoning': propertyData?.zoning
    });

    devLog.log('🏠 LotYieldPanel extracted:', { area, zoning });

    const rCode = extractRCode(zoning);

    if (!rCode) {
      devLog.warn('❌ Could not extract R-Code from:', zoning);
      setEstimate({
        maxLots: 0,
        area,
        rCode: 'UNKNOWN',
        subdivisionMode,
        requirements: { minLotSize: 0, avgSiteArea: 0 },
        efficiency: 0,
        remainingArea: area
      });
      return;
    }

    // Get zoning requirements
    const requirements = getZoningRequirements(rCode, 'single', subdivisionMode);
    const requirement = requirements[0];

    if (!requirement) {
      devLog.warn('❌ No requirements found for:', rCode);
      setEstimate({
        maxLots: 0,
        area,
        rCode,
        subdivisionMode,
        requirements: { minLotSize: 0, avgSiteArea: 0 },
        efficiency: 0,
        remainingArea: area
      });
      return;
    }

    // Calculate effective minimum lot area based on subdivision mode
    const effectiveMinLotArea = getEffectiveMinLotArea(requirement, subdivisionMode);

    // R-Code average site area already includes infrastructure/common areas
    // No need to subtract infrastructure percentage - just divide total area by average requirement

    devLog.log('🏠 Area calculation:', {
      totalArea: area,
      avgSiteArea: requirement.avgSiteArea,
      effectiveMinLotArea,
      calculationMethod: 'Direct division (infrastructure already included in R-Code requirements)'
    });

    // Calculate maximum lots based on average site area (using total area)
    const maxLotsAvg = requirement.avgSiteArea > 0 ? Math.floor(area / requirement.avgSiteArea) : 0;

    // Calculate maximum lots based on minimum lot area (more conservative)
    const maxLotsMin = effectiveMinLotArea > 0 ? Math.floor(area / effectiveMinLotArea) : 0;

    // Use the more conservative estimate
    const maxLots = Math.max(0, Math.min(maxLotsAvg, maxLotsMin));

    // Calculate area utilization (lots area vs total area)
    const usedLotArea = maxLots * requirement.avgSiteArea;
    const efficiency = area > 0 ? (usedLotArea / area) * 100 : 0;
    const remainingArea = area - usedLotArea;

    const yieldEstimate: YieldEstimate = {
      maxLots,
      area,
      rCode,
      subdivisionMode,
      requirements: {
        minLotSize: effectiveMinLotArea,
        avgSiteArea: requirement.avgSiteArea,
        minFrontage: requirement.minFrontage
      },
      efficiency: Math.round(isNaN(efficiency) ? 0 : efficiency),
      remainingArea: Math.round(isNaN(remainingArea) ? 0 : remainingArea)
    };

    devLog.log('✅ Setting estimate:', yieldEstimate);
    setEstimate(yieldEstimate);
    devLog.log('🏠 Lot Yield Estimate set successfully');
  };

  // Auto-calculate when component shows and has property data
  useEffect(() => {
    devLog.log('🎯 LotYieldPanel useEffect triggered:', { show, hasPropertyData: !!propertyData, subdivisionMode });
    if (show && propertyData) {
      devLog.log('🎯 Calling calculateYield...');
      try {
        calculateYield();
      } catch (error) {
        console.error('❌ Error in calculateYield:', error);
      }
    }
  }, [show, propertyData, subdivisionMode]);

  if (!show) {
    return null;
  }

  return (
    <div className={`w-80 ${className}`}>
      <Card className="shadow-2xl border-2 border-purple-200">
        <CardHeader className="pb-2 bg-gradient-to-r from-purple-50 to-purple-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2 text-purple-900">
              <TrendingUp className="h-4 w-4" />
              Lot Yield Estimate
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-1 h-auto"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4 p-4">
          {/* Subdivision Mode Toggle */}
          <div>
            <h4 className="text-xs font-medium text-gray-700 mb-2">Subdivision Type</h4>
            <div className="flex bg-gray-100 border border-gray-200 rounded-md p-1">
              <button
                onClick={() => {
                  setSubdivisionMode('strata');
                  if (selectedParcel) calculateYield();
                }}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  subdivisionMode === 'strata'
                    ? 'bg-purple-600 text-white'
                    : 'text-purple-600 hover:bg-purple-50'
                }`}
              >
                Strata
              </button>
              <button
                onClick={() => {
                  setSubdivisionMode('green-title');
                  if (selectedParcel) calculateYield();
                }}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  subdivisionMode === 'green-title'
                    ? 'bg-purple-600 text-white'
                    : 'text-purple-600 hover:bg-purple-50'
                }`}
              >
                Green Title
              </button>
            </div>
          </div>

          {!selectedParcel && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
              <div className="text-sm text-orange-800 font-medium">No Property Selected</div>
              <div className="text-xs text-orange-600 mt-1">
                Click on a property block on the map first
              </div>
            </div>
          )}

          {selectedParcel && !estimate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-sm text-blue-800 font-medium">Calculating...</div>
              <div className="text-xs text-blue-600 mt-1">
                Processing property data
              </div>
            </div>
          )}

          {estimate && (
            <>
              {/* Main Result */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-900">{estimate.maxLots}</div>
                <div className="text-sm text-purple-700">Maximum Lots</div>
                <div className="text-xs text-purple-600 mt-1">
                  Under {estimate.rCode} {subdivisionMode === 'strata' ? 'Strata' : 'Green Title'}
                </div>
              </div>

              {/* Property Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-600">Total Area:</span>
                  <p className="font-medium">{(isNaN(estimate.area) ? 0 : estimate.area).toLocaleString()}m²</p>
                </div>
                <div>
                  <span className="text-gray-600">R-Code:</span>
                  <p className="font-medium">{estimate.rCode}</p>
                </div>
                <div>
                  <span className="text-gray-600">Min Lot Size:</span>
                  <p className="font-medium">{(isNaN(estimate.requirements.minLotSize) ? 0 : estimate.requirements.minLotSize)}m²</p>
                </div>
                <div>
                  <span className="text-gray-600">Avg Required:</span>
                  <p className="font-medium">{(isNaN(estimate.requirements.avgSiteArea) ? 0 : estimate.requirements.avgSiteArea)}m²</p>
                </div>
                <div>
                  <span className="text-gray-600">Calculation:</span>
                  <p className="font-medium">{(isNaN(estimate.area) ? 0 : estimate.area).toLocaleString()} ÷ {(isNaN(estimate.requirements.avgSiteArea) ? 0 : estimate.requirements.avgSiteArea)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Infrastructure:</span>
                  <p className="font-medium">Included in R-Code</p>
                </div>
              </div>

              {/* Efficiency */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600">Area Efficiency:</span>
                  <span className="font-medium">{estimate.efficiency}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full"
                    style={{ width: `${Math.min(isNaN(estimate.efficiency) ? 0 : estimate.efficiency, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {(isNaN(estimate.remainingArea) ? 0 : estimate.remainingArea)}m² unused area
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700">
                    <p className="font-medium mb-1">Important Notes:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Estimate assumes regular lot shapes</li>
                      <li>• Actual yield may vary based on frontage requirements</li>
                      <li>• Consider access roads and infrastructure needs</li>
                      <li>• Professional survey recommended for final planning</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
