import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Ruler } from 'lucide-react';

interface SetbackAnalysisButtonProps {
  selectedParcel?: any;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SetbackAnalysisButton({
  selectedParcel,
  disabled = false,
  active = false,
  onClick,
  className = ""
}: SetbackAnalysisButtonProps) {
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
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg border-blue-600'
              : isDisabled
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50 text-blue-700 font-medium'
            }
            ${className}
          `}
        >
          <Ruler className={`h-4 w-4 mr-2 ${active ? 'text-white' : isDisabled ? 'text-gray-400' : 'text-blue-600'}`} />
          <span>Setback Analysis</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <div className="text-center">
          <p className="font-medium">Building Setback Analysis</p>
          <p className="text-xs opacity-90 mt-1">
            {!selectedParcel 
              ? "Select a property first"
              : "Analyze building setbacks and maximum footprint"
            }
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
