import { devLog } from "@/lib/logger";
import React, { useState, useEffect } from 'react';
import { X, Ruler, Home, Calculator, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { extractRCode, getZoningRequirements } from '@/lib/zoning-requirements';
import { getSetbackRequirements, calculateMaxBuildFootprint } from '@/lib/setback-requirements';

interface SetbackAnalysisProps {
  selectedParcel?: any;
  show: boolean;
  onClose: () => void;
}

export function SetbackAnalysisPanel({
  selectedParcel,
  show,
  onClose
}: SetbackAnalysisProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Calculate setback analysis when panel opens or parcel changes
  useEffect(() => {
    if (show && selectedParcel) {
      calculateSetbackAnalysis();
    }
  }, [show, selectedParcel]);

  const calculateSetbackAnalysis = async () => {
    if (!selectedParcel?.data) return;

    setLoading(true);
    try {
      // Extract R-Code from property data
      // Always try to extract from both fields and use the higher value if multiple codes exist
      let rCode = selectedParcel.data.rCode;
      let extractedRCode = null;

      // Also try extracting from zoning field
      if (selectedParcel.data.zoning) {
        extractedRCode = extractRCode(selectedParcel.data.zoning);
      }

      // If we have codes from both sources, compare and use higher
      if (rCode && extractedRCode && rCode !== extractedRCode) {
        // Compare numeric values and use higher
        const directValue = parseFloat(rCode.replace('R', '').replace(/[^0-9.]/g, ''));
        const extractedValue = parseFloat(extractedRCode.replace('R', '').replace(/[^0-9.]/g, ''));

        if (extractedValue > directValue) {
          rCode = extractedRCode;
        }
      } else if (!rCode && extractedRCode) {
        rCode = extractedRCode;
      } else if (!rCode) {
        rCode = 'R30'; // Default fallback
      }

      // Get zoning requirements
      const zoningReqs = getZoningRequirements(rCode || 'R30', 'single');
      const requirement = zoningReqs[0];

      // Get setback requirements for this R-Code
      const setbacks = getSetbackRequirements(rCode || 'R30');

      // Parse lot size for area calculation
      const lotSizeStr = selectedParcel.data.lotSize || '400 m²';
      const lotArea = parseFloat(lotSizeStr.replace(/[^\d.]/g, ''));

      // Calculate buildable area and max footprint
      const footprintAnalysis = calculateMaxBuildFootprint(
        lotArea,
        setbacks,
        selectedParcel.geometry
      );

      const analysisResult = {
        rCode: rCode || 'R30',
        setbacks,
        requirement,
        lotArea,
        footprint: footprintAnalysis,
        address: selectedParcel.address,
        coordinates: selectedParcel.coordinates
      };

      devLog.log('✅ Setback analysis complete:', analysisResult);
      setAnalysis(analysisResult);

    } catch (error) {
      console.error('❌ Error calculating setback analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Ruler className="h-5 w-5 text-blue-600" />
              Setback Analysis
            </CardTitle>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {selectedParcel?.address && (
            <p className="text-sm text-gray-600 mt-1">
              {selectedParcel.address}
            </p>
          )}
        </CardHeader>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
            <p className="text-sm text-gray-500 mt-4">Calculating setbacks...</p>
          </CardContent>
        </Card>
      ) : analysis ? (
        <>
          {/* Zoning Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Zoning Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">R-Code:</span>
                  <p className="font-medium">{analysis.rCode}</p>
                </div>
                <div>
                  <span className="text-gray-600">Lot Area:</span>
                  <p className="font-medium">{analysis.lotArea.toFixed(0)}m²</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Setback Requirements */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Required Setbacks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <span className="text-blue-700 font-medium">Primary Street</span>
                  <p className="text-blue-900 font-bold text-lg">{analysis.setbacks.front}m</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <span className="text-green-700 font-medium">Secondary Street</span>
                  <p className="text-green-900 font-bold text-lg">{analysis.setbacks.secondaryStreet}m</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <span className="text-orange-700 font-medium">Rear/Other</span>
                  <p className="text-orange-900 font-bold text-lg">
                    {typeof analysis.setbacks.rearOther === 'string' ? analysis.setbacks.rearOther : `${analysis.setbacks.rearOther}m`}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <span className="text-purple-700 font-medium">Open Space</span>
                  <p className="text-purple-900 font-bold text-lg">{analysis.setbacks.openSpacePercent}%</p>
                </div>
              </div>
              
              {analysis.setbacks.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-3">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> {analysis.setbacks.notes}
                  </p>
                </div>
              )}

              {typeof analysis.setbacks.rearOther === 'string' && analysis.setbacks.rearOther === '*' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mt-2">
                  <p className="text-xs text-blue-800">
                    <strong>Rear Setback "*":</strong> Refers to Tables 2a/2b & Clause 5.1.3 for wall-height and length-based rules.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Build Footprint Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Home className="h-4 w-4" />
                Maximum Build Footprint
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Site Coverage Limit:</span>
                  <p className="font-medium">{analysis.footprint.maxSiteCoverage}%</p>
                </div>
                <div>
                  <span className="text-gray-600">Buildable Area:</span>
                  <p className="font-medium">{analysis.footprint.buildableArea.toFixed(0)}m²</p>
                </div>
                <div>
                  <span className="text-gray-600">Max Footprint (Setbacks):</span>
                  <p className="font-medium">{analysis.footprint.maxFootprintBySetbacks.toFixed(0)}m²</p>
                </div>
                <div>
                  <span className="text-gray-600">Max Footprint (Coverage):</span>
                  <p className="font-medium">{analysis.footprint.maxFootprintByCoverage.toFixed(0)}m²</p>
                </div>
              </div>

              {/* Final Result */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <div className="text-center">
                  <span className="text-green-700 font-medium">Maximum Allowable Building Footprint</span>
                  <p className="text-green-900 font-bold text-2xl">
                    {analysis.footprint.finalMaxFootprint.toFixed(0)}m²
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Limited by {analysis.footprint.limitingFactor}
                  </p>
                </div>
              </div>

              {/* Coverage Percentage */}
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">Actual Coverage:</span>
                  <Badge variant={analysis.footprint.actualCoverage <= analysis.footprint.maxSiteCoverage ? 'default' : 'destructive'}>
                    {analysis.footprint.actualCoverage.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Analysis Display */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Analysis Display
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
                <p className="text-xs text-blue-800 font-medium">
                  📊 Setback analysis active - calculations available in this panel (no visual display on map)
                </p>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p className="text-sm font-medium text-gray-700 mb-2">Analysis Information Only</p>
                <p>• All setback calculations are processed and displayed in this panel</p>
                <p>• Maximum building footprint determined by R-Code requirements</p>
                <p>• Buildable area calculated based on property geometry</p>
                <p className="text-xs text-gray-500 italic mt-2">
                  📋 Analysis results shown in info panel only - no visual elements on map
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-200 space-y-1">
                <p className="text-xs text-gray-500">
                  <strong>Analysis Method:</strong> Setbacks calculated based on street-facing edges using R-Code requirements.
                </p>
                <p className="text-xs text-gray-500">
                  <strong>Property Type:</strong> Regular blocks have 1 street frontage; Corner blocks have 2 street frontages.
                </p>
                <p className="text-xs text-gray-500">
                  <strong>April 2024 Update:</strong> Secondary street includes communal streets, private streets, and rights-of-way.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500">Select a property to analyze building setbacks</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
