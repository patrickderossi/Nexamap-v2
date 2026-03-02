import React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Monitor, X } from "lucide-react";

export function MobileWarning() {
  const isMobile = useIsMobile();
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Don't show if dismissed or explicitly not mobile
  if (isDismissed || isMobile === false) {
    return null;
  }

  // Show banner if mobile or still detecting
  if (isMobile === true) {
    // Add padding to body to avoid content being hidden
    React.useEffect(() => {
      document.body.style.paddingTop = "80px";
      return () => {
        document.body.style.paddingTop = "";
      };
    }, []);

    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2F9fbd34283535421db2163a3b996c4e11?format=webp&width=800"
              alt="NexaMaps Logo"
              className="h-8 w-auto object-contain"
            />
            <div>
              <div className="font-semibold">Optimized for Desktop</div>
              <div className="text-sm text-blue-100">
                NexaMaps works best on PC/Mac browsers for the full experience
              </div>
            </div>
          </div>
          <Button
            onClick={() => setIsDismissed(true)}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-blue-700"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
