import { Loader2 } from "lucide-react";

interface PanelLoadingFallbackProps {
  title: string;
  className?: string;
}

export function PanelLoadingFallback({ title, className = "" }: PanelLoadingFallbackProps) {
  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-center space-x-3">
        <Loader2 className="w-5 h-5 text-nexamap-500 animate-spin" />
        <span className="text-gray-600 font-medium">Loading {title}...</span>
      </div>
    </div>
  );
}
