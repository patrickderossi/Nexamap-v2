import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RealEstateListingsButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
}

export function RealEstateListingsButton({
  onClick,
  disabled = false,
  isActive = false,
}: RealEstateListingsButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={onClick}
          disabled={disabled}
          className={`border-2 font-medium transition ${
            isActive
              ? 'border-green-500 bg-green-50 text-green-700 hover:border-green-600 hover:bg-green-100'
              : 'border-green-300 hover:border-green-400 hover:bg-green-50 text-green-700'
          }`}
          variant="outline"
          size="sm"
        >
          <Home className="h-4 w-4 mr-2" />
          Find Properties
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Search real estate listings from realestate.com.au</p>
      </TooltipContent>
    </Tooltip>
  );
}
