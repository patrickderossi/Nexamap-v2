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
import { ValuationEstimateButton } from "./ValuationEstimateButton";
import { FeedbackModal, FeedbackButton } from "./FeedbackModal";
import type { SelectedParcel } from "../../shared/types";
import { C, FONT, MONO, monoLabel } from "@/lib/nexa-ui";

interface MainToolbarProps {
  selectedParcel?: SelectedParcel;
  showYieldEstimator?: boolean;
  onYieldEstimatorToggle?: () => void;
  showFeasibilityStudy?: boolean;
  onFeasibilityStudyToggle?: () => void;
  showSetbackAnalysis?: boolean;
  onSetbackAnalysisToggle?: () => void;
  showValuationEstimate?: boolean;
  onValuationEstimateToggle?: () => void;
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
  showValuationEstimate = false,
  onValuationEstimateToggle,
  disabled = false,
  subdivisionActive = false,
}: MainToolbarProps) {
  if (!selectedParcel || subdivisionActive) return null;

  return (
    <TooltipProvider>
      <div style={{ padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 8, fontFamily: FONT }}>
        <div style={{ ...monoLabel(C.faint), marginBottom: 2 }}>ANALYSIS TOOLS</div>

        {/* Valuation Estimate */}
        <ValuationEstimateButton
          selectedParcel={selectedParcel}
          disabled={disabled}
          active={showValuationEstimate}
          onClick={onValuationEstimateToggle}
          className="w-full"
        />

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
        <div style={{ paddingTop: 8 }}>
          <FeedbackModal
            trigger={
              <button
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 11,
                  padding: "10px 12px",
                  background: C.ink,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: FONT,
                }}
              >
                Suggest Analysis Tool
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
