import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator, TrendingUp } from 'lucide-react';
import type { SelectedParcel } from "../../shared/types";

interface FeasibilityStudyButtonProps {
  selectedParcel?: SelectedParcel;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FeasibilityStudyButton({
  selectedParcel,
  disabled = false,
  active = false,
  onClick,
  className = ""
}: FeasibilityStudyButtonProps) {

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          onClick={onClick}
          disabled={disabled || !selectedParcel}
          className={`${active
            ? "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg"
            : "border-2 border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-700 font-medium"
          } ${className}`}
        >
          <Calculator className="h-4 w-4 mr-2" />
          <TrendingUp className="h-3 w-3 mr-1" />
          Feasibility Study
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Analyze development feasibility and financial projections</p>
      </TooltipContent>
    </Tooltip>
  );
}
