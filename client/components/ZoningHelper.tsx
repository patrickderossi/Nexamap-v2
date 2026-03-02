import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Info, 
  ChevronDown, 
  ChevronUp,
  BookOpen,
  Calculator
} from 'lucide-react';
import { getAvailableRCodes, getZoningRequirements, getDwellingTypes, SubdivisionMode, getEffectiveMinLotArea } from '@/lib/zoning-requirements';

interface ZoningHelperProps {
  currentRCode?: string;
  className?: string;
  subdivisionMode?: SubdivisionMode;
}

export function ZoningHelper({ currentRCode, className = "", subdivisionMode = 'strata' }: ZoningHelperProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRCode, setSelectedRCode] = useState(currentRCode || 'R30');

  const availableRCodes = getAvailableRCodes();
  const requirements = getZoningRequirements(selectedRCode, 'single');
  const requirement = requirements[0];

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className={`w-full ${className}`}
      >
        <Info className="h-4 w-4 mr-2" />
        R-Code Reference Guide
      </Button>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            WA R-Code Requirements
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* R-Code Selector */}
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Select R-Code:</label>
          <select
            value={selectedRCode}
            onChange={(e) => setSelectedRCode(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          >
            {availableRCodes.map(rCode => (
              <option key={rCode} value={rCode}>{rCode}</option>
            ))}
          </select>
        </div>

        {/* Current Requirements */}
        {requirement && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-1">
              <Calculator className="h-4 w-4" />
              {selectedRCode} Single Dwelling Requirements
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
              <div>
                <span className="text-blue-600">Min Lot Size:</span>
                <p className="font-medium">{getEffectiveMinLotArea(requirement, subdivisionMode)}m²</p>
                <p className="text-xs text-blue-500 mt-0.5">
                  {subdivisionMode === 'strata' ? 'Strata' : 'Green Title'}
                </p>
              </div>
              <div>
                <span className="text-blue-600">Avg Site Area:</span>
                <p className="font-medium">{requirement.avgSiteArea}m²</p>
              </div>
              {requirement.minFrontage && (
                <div>
                  <span className="text-blue-600">Min Frontage:</span>
                  <p className="font-medium">{requirement.minFrontage}m</p>
                </div>
              )}
            </div>
            {requirement.partC && (
              <Badge variant="outline" className="mt-2 text-xs">
                Part C - Higher Density
              </Badge>
            )}
          </div>
        )}

        {/* Common R-Codes Quick Reference */}
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2">Common R-Codes:</h4>
          <div className="grid grid-cols-3 gap-1 text-xs">
            {['R10', 'R15', 'R20', 'R25', 'R30', 'R40'].map(rCode => {
              const req = getZoningRequirements(rCode, 'single')[0];
              return req ? (
                <div 
                  key={rCode}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    selectedRCode === rCode 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedRCode(rCode)}
                >
                  <div className="font-medium">{rCode}</div>
                  <div className="text-gray-600">Avg: {req.avgSiteArea}m²</div>
                </div>
              ) : null;
            })}
          </div>
        </div>

        {/* Key Concepts */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Key Concepts:</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• <strong>Average Site Area:</strong> Total block area ÷ number of lots must meet this</li>
            <li>• <strong>Minimum Lot Area:</strong> No individual lot can be smaller than this</li>
            <li>• <strong>Common Property (CP):</strong> Driveways and shared areas don't count as lots</li>
            <li>• <strong>Example:</strong> R40 with 660m² can be 3 lots (220m² average)</li>
          </ul>
        </div>

        {/* Example Calculation */}
        {requirement && (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <h4 className="text-xs font-medium text-green-700 mb-2">Example for 1000m² block:</h4>
            <div className="text-xs text-green-600">
              <p>• Max lots: {Math.floor(1000 / requirement.avgSiteArea)} (based on avg {requirement.avgSiteArea}m²)</p>
              <p>• Each lot minimum: {requirement.minLotArea || requirement.minSiteArea}m²</p>
              <p>• Total needed: {Math.floor(1000 / requirement.avgSiteArea) * requirement.avgSiteArea}m²</p>
              <p>• Remaining for CP: {1000 - (Math.floor(1000 / requirement.avgSiteArea) * requirement.avgSiteArea)}m²</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
