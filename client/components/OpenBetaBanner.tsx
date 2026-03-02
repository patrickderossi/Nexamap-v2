import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpenBetaBannerProps {
  className?: string;
}

export function OpenBetaBanner({ className }: OpenBetaBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={cn(
      "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
            OPEN BETA
          </Badge>
          <p className="text-sm text-blue-800">
            You're using Nexamap Open Beta! Help us improve by sharing feedback.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(false)}
          className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
