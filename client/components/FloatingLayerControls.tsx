import React, { useCallback } from "react";
import { Layers, Map, Globe, Zap } from "lucide-react";
import { PropertyControls, PropertyControlsState } from "./PropertyControls";
import { FeedbackModal, FeedbackButton } from "./FeedbackModal";

export type BaseLayerType = "osm" | "satellite";

export interface BaseLayerConfig {
  id: BaseLayerType;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  icon: React.ReactNode;
}

interface LayerState {
  placesAddresses: boolean;
  propertyPlanning: boolean;
  bushfireAreas: boolean;
  infrastructure: boolean;
  water: boolean;
  terrain: boolean;
  soilType: boolean;
  health: boolean;
  schools: boolean;
  transport: boolean;
}

interface FloatingLayerControlsProps {
  layers: LayerState;
  onLayersChange: (layers: LayerState) => void;
  propertyControls?: PropertyControlsState;
  onPropertyControlsChange?: (controls: PropertyControlsState) => void;
  hasSelectedProperty?: boolean;
  baseLayer?: BaseLayerType;
  onBaseLayerChange?: (layer: BaseLayerType) => void;
}

function FloatingLayerControlsComponent({
  layers,
  onLayersChange,
  propertyControls,
  onPropertyControlsChange,
  hasSelectedProperty = false,
  baseLayer = "osm",
  onBaseLayerChange,
}: FloatingLayerControlsProps) {
  // Base layer configurations
  const baseLayerConfigs: BaseLayerConfig[] = [
    {
      id: "osm",
      name: "Street Map",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
      icon: <Map className="w-4 h-4" />,
    },
    {
      id: "satellite",
      name: "Satellite",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "© Esri, Maxar, Earthstar Geographics",
      maxZoom: 18,
      icon: <Globe className="w-4 h-4" />,
    },
  ];

  const handleLayerToggle = useCallback(
    (layerKey: keyof LayerState) => {
      console.log(
        `🎛️ Toggling layer: ${layerKey} from ${layers[layerKey]} to ${!layers[layerKey]}`,
      );
      onLayersChange({
        ...layers,
        [layerKey]: !layers[layerKey],
      });
    },
    [layers, onLayersChange],
  );

  const handleBaseLayerChange = useCallback(
    (layerId: BaseLayerType) => {
      if (onBaseLayerChange) {
        onBaseLayerChange(layerId);
      }
    },
    [onBaseLayerChange],
  );

  return (
    <div>
      <div className="bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center space-x-2 p-3 border-b border-gray-200">
          <Layers className="w-4 h-4 text-nexamap-500" />
          <span className="font-medium text-gray-900 text-sm">Map Layers</span>
        </div>

        {/* Base Layer Switcher */}
        <div className="p-3 border-b border-gray-200 bg-blue-50">
          <div className="text-xs font-medium text-blue-700 mb-3">
            Base Map Style
          </div>
          <div className="grid grid-cols-2 gap-2">
            {baseLayerConfigs.map((config) => (
              <button
                key={config.id}
                onClick={() => handleBaseLayerChange(config.id)}
                className={`flex items-center space-x-2 p-2 rounded-lg text-xs font-medium transition-all ${
                  baseLayer === config.id
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white text-gray-700 hover:bg-blue-100 border border-gray-200"
                }`}
              >
                {config.icon}
                <span className="truncate">{config.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Data Layer Controls - Always Visible */}
        <div className="p-3 space-y-3 bg-gray-50">
          {/* Cadastre (Block Lines) */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.placesAddresses}
                onChange={() => handleLayerToggle("placesAddresses")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">
              Cadastre (Block Lines)
            </span>
          </div>

          {/* R-Codes Zoning */}
          <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-blue-50 transition-colors">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.propertyPlanning}
                onChange={() => handleLayerToggle("propertyPlanning")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            <span
              className="text-sm font-medium text-gray-700 cursor-pointer"
              onClick={() => handleLayerToggle("propertyPlanning")}
            >
              R-Codes Zoning
            </span>
            {layers.propertyPlanning && (
              <span className="text-xs text-blue-600 font-medium">ON</span>
            )}
          </div>

          {/* Bush Fire Areas */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.bushfireAreas}
                onChange={() => handleLayerToggle("bushfireAreas")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Bush Fire Areas</span>
          </div>

          {/* Watercorp */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.infrastructure}
                onChange={() => handleLayerToggle("infrastructure")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Watercorp</span>
          </div>

          {/* Flood Zone */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.water}
                onChange={() => handleLayerToggle("water")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Flood Zone</span>
          </div>

          {/* Land Contours */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.terrain}
                onChange={() => handleLayerToggle("terrain")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Land Contours</span>
          </div>

          {/* Soil Type */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.soilType}
                onChange={() => handleLayerToggle("soilType")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Soil Type</span>
          </div>

          {/* Health Services */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.health}
                onChange={() => handleLayerToggle("health")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Health Services</span>
          </div>

          {/* Schools */}
          <div className="flex items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.schools}
                onChange={() => handleLayerToggle("schools")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
            <span className="text-sm text-gray-700">Schools</span>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.transport}
                  onChange={() => handleLayerToggle("transport")}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nexamap-600"></div>
              </label>
              <span className="text-sm text-gray-700">Transport</span>
            </div>

            <FeedbackModal
              trigger={
                <button className="ml-2 inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-nexamap-400 hover:text-nexamap-600 transition-all duration-200">
                  💡 Suggest more layers
                </button>
              }
              title="Suggest More Map Layers"
              description="Help us enhance the mapping experience by suggesting additional layers that would be valuable for your work."
              placeholder="What additional map layers would be useful for your land development projects? (e.g., soil types, utilities, transport, environmental constraints, etc.)"
              feedbackType="map-layers"
              context="Current active layers: Base map, Flood Zone, Land Contours, Soil Type, Health Services, Schools, Transport"
            />
          </div>
        </div>
      </div>

      {/* Property Controls - Only show when a property is selected */}
      {hasSelectedProperty && propertyControls && onPropertyControlsChange && (
        <PropertyControls
          controls={propertyControls}
          onControlsChange={onPropertyControlsChange}
          visible={hasSelectedProperty}
        />
      )}
    </div>
  );
}

// Memoize FloatingLayerControls to prevent unnecessary re-renders
export const FloatingLayerControls = React.memo(FloatingLayerControlsComponent);
