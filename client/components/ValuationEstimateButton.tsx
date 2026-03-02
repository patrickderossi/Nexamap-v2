import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DollarSign } from 'lucide-react';
import type { SelectedParcel } from "../../shared/types";

interface ValuationEstimateButtonProps {
  selectedParcel?: SelectedParcel;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ValuationEstimateButton({
  selectedParcel,
  disabled = false,
  active = false,
  onClick,
  className = ""
}: ValuationEstimateButtonProps) {
  const isDisabled = disabled || !selectedParcel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={isDisabled}
          className={`
            flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-all duration-200 border-2
            ${active
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg border-emerald-600'
              : isDisabled
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-700 font-medium'
            }
            ${className}
          `}
        >
          <DollarSign className={`h-4 w-4 mr-2 ${active ? 'text-white' : isDisabled ? 'text-gray-400' : 'text-emerald-600'}`} />
          <span>Valuation Estimate</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <div className="text-center">
          <p className="font-medium">Property Valuation Estimate</p>
          <p className="text-xs opacity-90 mt-1">
            {!selectedParcel
              ? "Select a property first"
              : "Estimate property value from sold comparables"
            }
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
