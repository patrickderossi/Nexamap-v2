import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronUp,
  Scissors, 
  Square, 
  Minus, 
  Split, 
  Check,
  Info,
  Play,
  Ruler,
  FileText,
  Download
} from 'lucide-react';

interface SubdivisionInstructionsProps {
  onClose?: () => void;
  compact?: boolean;
}

export function SubdivisionInstructions({ onClose, compact = false }: SubdivisionInstructionsProps) {
  const [expandedSteps, setExpandedSteps] = useState<number[]>([1]);

  const toggleStep = (step: number) => {
    setExpandedSteps(prev => 
      prev.includes(step) 
        ? prev.filter(s => s !== step)
        : [...prev, step]
    );
  };

  const steps = [
    {
      number: 1,
      title: "Select Parent Lot",
      icon: <Square className="h-4 w-4" />,
      description: "Click the Subdivision Mode button and select a lot to analyze",
      details: [
        "Enable Subdivision Mode from the toolbar",
        "Click on any lot (parcel polygon) on the map",
        "The lot will be highlighted and details will appear in the sidebar",
        "Lot area, minimum lot size, and max dwellings will be calculated automatically"
      ]
    },
    {
      number: 2,
      title: "Define Split Lines",
      icon: <Minus className="h-4 w-4" />,
      description: "Draw lines or use auto-split to divide the lot",
      details: [
        "Draw Line: Click two points across the polygon to create a cut line",
        "Auto Split: System automatically divides the polygon by chosen axis",
        "Multiple cut lines are supported (split into 3, 4, or more lots)",
        "Each new sub-lot is automatically colored uniquely"
      ]
    },
    {
      number: 3,
      title: "Preview Sub-Lots",
      icon: <Ruler className="h-4 w-4" />,
      description: "Review area calculations and compliance for each sub-lot",
      details: [
        "Each sub-lot shows area (m²) overlaid on the map",
        "Perimeter length is calculated automatically",
        "Compliance indicator: ✅ if ≥ minimum lot size, ❌ if below",
        "Live updating table shows all lot details"
      ]
    },
    {
      number: 4,
      title: "Adjust & Refine", 
      icon: <Split className="h-4 w-4" />,
      description: "Fine-tune the subdivision layout",
      details: [
        "Drag cut lines to adjust subdivision boundaries",
        "Delete and re-draw lines as needed",
        "Option to lock frontage requirements (e.g., minimum 10m frontage)",
        "Real-time compliance checking updates automatically"
      ]
    },
    {
      number: 5,
      title: "Validation Summary",
      icon: <FileText className="h-4 w-4" />,
      description: "Review final subdivision compliance and export",
      details: [
        "View total parent lot area and subdivision yield",
        "See compliance summary showing which lots pass/fail",
        "Big status badge indicates overall subdivision viability",
        "Export options: GeoJSON, Shapefile, or CSV format"
      ]
    }
  ];

  if (compact) {
    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800">How to Use Subdivision Tool</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-xs text-blue-700 space-y-1">
            <p><strong>1.</strong> Click "Subdivision Mode" and select a lot</p>
            <p><strong>2.</strong> Use "Draw Line" or "Auto Split" tools</p>
            <p><strong>3.</strong> Review compliance in the sidebar</p>
            <p><strong>4.</strong> Export when satisfied with the layout</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-blue-600" />
            Split Lot / Subdivision Tool Guide
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Follow these steps to analyze and plan property subdivisions using SLIP WA data
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {steps.map((step) => {
          const isExpanded = expandedSteps.includes(step.number);
          
          return (
            <Collapsible key={step.number} open={isExpanded} onOpenChange={() => toggleStep(step.number)}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto p-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="h-6 w-6 rounded-full p-0 flex items-center justify-center">
                      {step.number}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {step.icon}
                      <span className="font-medium">{step.title}</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="pt-2 pl-9">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">{step.description}</p>
                  <ul className="text-sm space-y-1">
                    {step.details.map((detail, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {/* Key Features */}
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Key Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Turf.js</Badge>
                <span>Accurate geometric calculations</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">SLIP WA</Badge>
                <span>Real cadastral data integration</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">R-Code</Badge>
                <span>Zoning compliance checking</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Export</Badge>
                <span>Multiple format support</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Toolbar Reference */}
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Toolbar Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Scissors className="h-3 w-3" />
                <span>Subdivision Mode Toggle</span>
              </div>
              <div className="flex items-center gap-2">
                <Square className="h-3 w-3" />
                <span>Select Parent Lot</span>
              </div>
              <div className="flex items-center gap-2">
                <Minus className="h-3 w-3" />
                <span>Draw Split Line</span>
              </div>
              <div className="flex items-center gap-2">
                <Split className="h-3 w-3" />
                <span>Auto Split Evenly</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {onClose && (
          <div className="flex justify-end">
            <Button onClick={onClose} className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Get Started
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
