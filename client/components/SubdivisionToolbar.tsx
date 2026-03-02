import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Scissors,
  Zap,
  RotateCcw,
  Pencil,
  MousePointer2,
  HelpCircle,
} from "lucide-react";
import L from "leaflet";
import { toast } from "@/hooks/use-toast";
import { VideoTutorialModal } from "./VideoTutorialModal";
import { devLog } from "@/lib/logger";

export interface SubdivisionMode {
  active: boolean;
  drawing: boolean;
  classifying: boolean;
}

interface SubdivisionToolbarProps {
  mode: SubdivisionMode;
  onModeChange: (mode: SubdivisionMode) => void;
  onClearLines: () => void;
  onGenerateLots: () => void;
  disabled?: boolean;
  hasDrawnLines?: boolean;
  hasGeneratedLots?: boolean;
  selectedParcel?: any;
  map?: L.Map | null;
  propertyData?: any;
}

function SubdivisionToolbarComponent({
  mode,
  onModeChange,
  onClearLines,
  onGenerateLots,
  disabled = false,
  hasDrawnLines = false,
  hasGeneratedLots = false,
  selectedParcel,
  map,
  propertyData,
}: SubdivisionToolbarProps) {
  const [showTutorial, setShowTutorial] = useState(false);

  const toggleSubdivisionMode = () => {
    if (mode.active) {
      // Exit subdivision mode
      onModeChange({ active: false, drawing: false, classifying: false });
    } else {
      // Only enter subdivision mode if a property is selected
      if (selectedParcel) {
        onModeChange({ active: true, drawing: false, classifying: false });
      } else {
        toast({
          title: "🏠 No property selected",
          description:
            "Please select a property first by clicking on it in the map.",
          variant: "default",
          duration: 4000,
        });
      }
    }
  };

  const startDrawing = () => {
    if (mode.active) {
      onModeChange({ active: true, drawing: true, classifying: false });
    }
  };

  const toggleClassifyMode = () => {
    if (mode.active && hasGeneratedLots) {
      onModeChange({
        active: true,
        drawing: false,
        classifying: !mode.classifying,
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="bg-white border-2 border-blue-200 rounded-xl shadow-lg p-4 flex items-center gap-3 backdrop-blur-sm bg-white/95">
        <div className="text-xs text-blue-600 font-medium mr-2">
          Subdivision Tools
        </div>

        {/* How to use? Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTutorial(true)}
              className="border-2 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-700 font-medium"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              How to use?
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Watch tutorial video on how to use the subdivision tool</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8" />

        {/* Subdivision Tool Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={mode.active ? "default" : "outline"}
              size="sm"
              onClick={toggleSubdivisionMode}
              disabled={disabled || (!mode.active && !selectedParcel)}
              className={
                mode.active
                  ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg"
                  : "border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50 text-blue-700 font-medium"
              }
            >
              <Scissors className="h-4 w-4 mr-2" />
              {mode.active
                ? "Exit Subdivision"
                : selectedParcel
                  ? "Start Subdivision"
                  : "Select Property First"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {mode.active
                ? "Exit subdivision mode"
                : "Enter subdivision mode to draw lot boundaries"}
            </p>
          </TooltipContent>
        </Tooltip>

        {mode.active && selectedParcel && (
          <>
            <Separator orientation="vertical" className="h-8" />

            {/* Draw Lines Tool */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={mode.drawing ? "default" : "outline"}
                  size="sm"
                  onClick={startDrawing}
                  className={
                    mode.drawing
                      ? "px-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg"
                      : "px-3 border-2 border-green-300 hover:border-green-400 hover:bg-green-50 text-green-700"
                  }
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  {mode.drawing ? "Drawing..." : "Draw Lines"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Click points to draw subdivision lines with live preview</p>
              </TooltipContent>
            </Tooltip>

            {hasDrawnLines && (
              <>
                <Separator orientation="vertical" className="h-8" />

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onClearLines}
                        className="px-3 border-2 border-red-300 text-red-600 hover:border-red-400 hover:text-red-700 hover:bg-red-50 font-medium"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Clear Lines
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clear all drawn subdivision lines</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onGenerateLots}
                        className="px-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg font-medium"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Generate Lots
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Create lots using advanced polygon clipping algorithms
                        (Martinez + enhanced Turf)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </>
            )}

            {/* Area Classification */}
            {hasGeneratedLots && (
              <>
                <Separator orientation="vertical" className="h-8" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={mode.classifying ? "default" : "outline"}
                      size="sm"
                      onClick={toggleClassifyMode}
                      className={
                        mode.classifying
                          ? "px-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white shadow-lg"
                          : "px-3 border-2 border-orange-300 hover:border-orange-400 hover:bg-orange-50 text-orange-700"
                      }
                    >
                      <MousePointer2 className="h-4 w-4 mr-2" />
                      {mode.classifying ? "Classifying..." : "Classify Areas"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Click on lots to classify as Private Lot or Common
                      Property
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </>
        )}

        {/* Status Indicator */}
        {mode.active && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {!selectedParcel && "Select a property first"}
              {selectedParcel &&
                !mode.drawing &&
                !mode.classifying &&
                'Click "Draw Lines" to start drawing'}
              {selectedParcel &&
                mode.drawing &&
                "Click points to draw lines. ESC to stop drawing."}
              {selectedParcel &&
                mode.classifying &&
                "Click on lots to toggle: Private Lot ↔ Common Property"}
            </span>
          </div>
        )}

        {/* Tutorial Video Modal */}
        <VideoTutorialModal
          open={showTutorial}
          onOpenChange={setShowTutorial}
          videoUrl="https://cdn.builder.io/o/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2Fb1278dfb7e0d437f9ba853cebd75d190?alt=media&token=ba014fb3-d311-41b9-af69-4805daede291&apiKey=0df748b9b86d4bc5af1be6fda4f6f0d0"
          title="How to Use the Subdivision Tool"
        />
      </div>
    </TooltipProvider>
  );
}

// Memoize the component for better performance
export const SubdivisionToolbar = React.memo(SubdivisionToolbarComponent);
