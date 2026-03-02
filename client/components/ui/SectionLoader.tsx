import React from "react";

interface SectionLoaderProps {
  height?: string;
  className?: string;
}

export function SectionLoader({
  height = "h-96",
  className = "",
}: SectionLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${height} ${className}`}>
      <div className="animate-pulse flex space-x-4 w-full max-w-4xl mx-auto">
        <div className="flex-1 space-y-6 py-1">
          <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto"></div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="h-16 bg-gray-200 rounded col-span-2"></div>
              <div className="h-16 bg-gray-200 rounded col-span-1"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SectionLoader;
