import { devLog } from "@/lib/logger";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Calculator,
  TrendingUp,
  X,
  ChevronDown,
  ChevronUp,
  Home,
  MapPin,
  Ruler,
  Info
} from 'lucide-react';
import { getZoningRequirements, extractRCode, SubdivisionMode, getEffectiveMinLotArea } from '@/lib/zoning-requirements';

interface LotYieldEstimatorProps {
  selectedParcel?: any;
  disabled?: boolean;
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
  efficiency: number; // percentage of area utilized
  remainingArea: number;
}

export function LotYieldEstimator({
  selectedParcel,
  disabled = false,
  show = false,
  onClose,
  className = ""
}: LotYieldEstimatorProps) {
  const [subdivisionMode, setSubdivisionMode] = useState<SubdivisionMode>('strata');
  const [estimate, setEstimate] = useState<YieldEstimate | null>(null);

  const calculateYield = () => {
    if (!selectedParcel) return;

    // Get property data
    const area = selectedParcel.area || selectedParcel.lotSize || 800; // fallback to 800m²
    const zoning = selectedParcel.zoning || selectedParcel.rCode || 'R30';
    const rCode = extractRCode(zoning);

    if (!rCode) {
      devLog.warn('Could not extract R-Code from:', zoning);
      return;
    }

    // Get zoning requirements
    const requirements = getZoningRequirements(rCode, 'single', subdivisionMode);
    const requirement = requirements[0];

    if (!requirement) {
      devLog.warn('No requirements found for:', rCode);
      return;
    }

    // Calculate effective minimum lot area based on subdivision mode
    const effectiveMinLotArea = getEffectiveMinLotArea(requirement, subdivisionMode);

    // Calculate maximum lots based on average site area
    const maxLotsAvg = Math.floor(area / requirement.avgSiteArea);
    
    // Calculate maximum lots based on minimum lot area (more conservative)
    const maxLotsMin = Math.floor(area / effectiveMinLotArea);
    
    // Use the more conservative estimate
    const maxLots = Math.min(maxLotsAvg, maxLotsMin);
    
    // Calculate area utilization
    const usedArea = maxLots * requirement.avgSiteArea;
    const efficiency = (usedArea / area) * 100;
    const remainingArea = area - usedArea;

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
      efficiency: Math.round(efficiency),
      remainingArea: Math.round(remainingArea)
    };

    setEstimate(yieldEstimate);
    devLog.log('🏠 Lot Yield Estimate:', yieldEstimate);
  };

  const toggleEstimator = () => {
    if (!show && selectedParcel) {
      calculateYield();
    }
    if (onClose && show) {
      onClose();
    }
  };

  return (
    <TooltipProvider>
      <div className="relative flex items-center gap-3">
        {/* Lot Yield Estimator Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={show ? "default" : "outline"}
              size="sm"
              onClick={toggleEstimator}
              disabled={disabled || !selectedParcel}
              className={show
                ? "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg"
                : "border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-50 text-purple-700 font-medium"
              }
            >
              <Calculator className="h-4 w-4 mr-2" />
              {selectedParcel ? "Lot Yield Estimator" : "Select Property First"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Quick estimate of how many lots can be created under current zoning</p>
          </TooltipContent>
        </Tooltip>

        {/* Estimator Panel */}
        {show && (
          <div className="absolute top-0 left-full ml-3 w-80 z-[1000]">
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
                        <p className="font-medium">{estimate.area.toLocaleString()}m²</p>
                      </div>
                      <div>
                        <span className="text-gray-600">R-Code:</span>
                        <p className="font-medium">{estimate.rCode}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Min Lot Size:</span>
                        <p className="font-medium">{estimate.requirements.minLotSize}m²</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg Required:</span>
                        <p className="font-medium">{estimate.requirements.avgSiteArea}m²</p>
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
                          style={{ width: `${Math.min(estimate.efficiency, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {estimate.remainingArea}m² remaining for common areas
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
        )}
      </div>
    </TooltipProvider>
  );
}
