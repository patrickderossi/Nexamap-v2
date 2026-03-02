import React, { useCallback } from "react";
import { Ruler, Triangle } from "lucide-react";

interface PropertyControlsState {
  boundaryDimensions: boolean;
  propertyAngles: boolean;
}

interface PropertyControlsProps {
  controls: PropertyControlsState;
  onControlsChange: (controls: PropertyControlsState) => void;
  visible: boolean;
}

function PropertyControlsComponent({ controls, onControlsChange, visible }: PropertyControlsProps) {
  const handleControlToggle = useCallback((controlKey: keyof PropertyControlsState) => {
    onControlsChange({
      ...controls,
      [controlKey]: !controls[controlKey]
    });
  }, [controls, onControlsChange]);

  if (!visible) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-3">
      {/* Header */}
      <div className="flex items-center space-x-2 p-3 border-b border-gray-200">
        <Ruler className="w-4 h-4 text-orange-500" />
        <span className="font-medium text-gray-900 text-sm">Property Details</span>
      </div>

      {/* Property Controls */}
      <div className="p-3 space-y-3 bg-gray-50">
        {/* Boundary Dimensions */}
        <div className="flex items-center space-x-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={controls.boundaryDimensions}
              onChange={() => handleControlToggle('boundaryDimensions')}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
          <span className="text-sm text-gray-700">Boundary Dimensions</span>
        </div>
        
        {/* Property Line Angles */}
        <div className="flex items-center space-x-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={controls.propertyAngles}
              onChange={() => handleControlToggle('propertyAngles')}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
          </label>
          <span className="text-sm text-gray-700">Property Line Angles</span>
        </div>
      </div>
    </div>
  );
}

// Memoize PropertyControls to prevent unnecessary re-renders
export const PropertyControls = React.memo(PropertyControlsComponent);

export type { PropertyControlsState };
