import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LotYieldButton } from "./LotYieldButton";
import { ExportDwgButton } from "./ExportDwgButton";
import { FeasibilityStudyButton } from "./FeasibilityStudyButton";
import { SetbackAnalysisButton } from "./SetbackAnalysisButton";
import { FeedbackModal, FeedbackButton } from "./FeedbackModal";
import type { SelectedParcel } from "../../shared/types";

interface MainToolbarProps {
  selectedParcel?: SelectedParcel;
  showYieldEstimator?: boolean;
  onYieldEstimatorToggle?: () => void;
  showFeasibilityStudy?: boolean;
  onFeasibilityStudyToggle?: () => void;
  showSetbackAnalysis?: boolean;
  onSetbackAnalysisToggle?: () => void;
  disabled?: boolean;
  subdivisionActive?: boolean;
}

function MainToolbarComponent({
  selectedParcel,
  showYieldEstimator = false,
  onYieldEstimatorToggle,
  showFeasibilityStudy = false,
  onFeasibilityStudyToggle,
  showSetbackAnalysis = false,
  onSetbackAnalysisToggle,
  disabled = false,
  subdivisionActive = false,
}: MainToolbarProps) {
  if (!selectedParcel || subdivisionActive) return null;

  return (
    <TooltipProvider>
      <div className="p-3 flex flex-col gap-2">
        <div className="text-xs text-gray-500 font-medium text-center mb-1 border-b border-gray-100 pb-2">
          Analysis Tools
        </div>

        {/* Feasibility Study Button */}
        <FeasibilityStudyButton
          selectedParcel={selectedParcel}
          disabled={disabled}
          active={showFeasibilityStudy}
          onClick={onFeasibilityStudyToggle}
          className="w-full"
        />

        {/* Lot Yield Estimator */}
        <LotYieldButton
          selectedParcel={selectedParcel}
          disabled={disabled}
          active={showYieldEstimator}
          onClick={onYieldEstimatorToggle}
          className="w-full"
        />

        {/* Setback Analysis */}
        <SetbackAnalysisButton
          selectedParcel={selectedParcel}
          disabled={disabled}
          active={showSetbackAnalysis}
          onClick={onSetbackAnalysisToggle}
          className="w-full"
        />

        {/* Export DWG/DXF */}
        <ExportDwgButton
          selectedParcel={selectedParcel}
          disabled={disabled}
          className="w-full"
        />

        {/* Feedback Button for Analysis Tools */}
        <div className="pt-2 border-t border-gray-200">
          <FeedbackModal
            trigger={
              <button className="w-full inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-200">
                💡 Suggest Analysis Tool
              </button>
            }
            title="Suggest Analysis Tool"
            description="Help us expand our analysis capabilities by suggesting new tools that would benefit your workflow."
            placeholder="What analysis tools would enhance your land development workflow? (e.g., shadow analysis, parking calculations, density studies, etc.)"
            feedbackType="analysis-tools"
            context={
              selectedParcel
                ? `Selected property: ${selectedParcel.data?.planNumber || "Unknown"}\nArea: ${selectedParcel.data?.area || "Unknown"}`
                : "No property currently selected"
            }
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// Memoize the component for better performance
export const MainToolbar = React.memo(MainToolbarComponent);
