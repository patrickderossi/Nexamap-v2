import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator } from 'lucide-react';
import type { SelectedParcel } from "../../shared/types";

interface LotYieldButtonProps {
  selectedParcel?: SelectedParcel;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function LotYieldButton({
  selectedParcel,
  disabled = false,
  active = false,
  onClick,
  className = ""
}: LotYieldButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={onClick}
            disabled={disabled || !selectedParcel}
            className={`${active
              ? "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg"
              : "border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-50 text-purple-700 font-medium"
            } ${className}`}
          >
            <Calculator className="h-4 w-4 mr-2" />
            {selectedParcel ? "Lot Yield Estimator" : "Select Property First"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Quick estimate of how many lots can be created under current zoning</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
