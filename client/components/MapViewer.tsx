import { MapPin, Layers } from "lucide-react";
import { LeafletMap } from "./LeafletMap";
import { useState, useEffect } from "react";

interface MapViewerProps {
  address?: string;
  coordinates?: [number, number];
}

export function MapViewer({ address, coordinates }: MapViewerProps) {
  const [layers, setLayers] = useState({
    placesAddresses: false,
    propertyPlanning: false,
    bushfireAreas: false,
    infrastructure: false,
    water: false,
    terrain: false,
    soilType: false,
    health: false,
    schools: false,
    transport: false,
    mrsZone: false,
    lpsZones: false,
    lpsOverlays: false,
    heritageState: false,
    heritageLocal: false,
    aboriginalHeritage: false,
    contamination: false,
    envSensitive: false,
    airportNoise: false,
    roadRailNoise: false,
    bushForever: false,
    acidSulfateSoil: false,
    drinkingWater: false,
  });

  // Automatically enable Cadastre (Block Lines) when address is searched
  useEffect(() => {
    if (address && coordinates) {
      setLayers(prev => ({ ...prev, placesAddresses: true }));
    }
  }, [address, coordinates]);

  // Default to Perth CBD if no coordinates provided
  const mapCenter: [number, number] = coordinates || [-31.9505, 115.8605];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Map Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-nexamap-500" />
          <h3 className="font-bold text-gray-900">Cadastral Map</h3>
          <span className="text-sm text-green-600">• Interactive Map</span>
        </div>
      </div>

      {/* Interactive Leaflet Map */}
      <div className="relative">
        <LeafletMap
          center={mapCenter}
          zoom={address ? 16 : 12}
          height="h-[600px]"
          address={address}
          layers={layers}
        />
      </div>

      {/* Layer Controls */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center space-x-2 mb-3">
          <Layers className="w-4 h-4 text-gray-600" />
          <h4 className="font-medium text-gray-900">Map Layers</h4>
        </div>

        <div className="text-xs text-gray-500 mb-2">
          Try zooming in/out (10-18) - layers may be scale-dependent
        </div>
        <div className="space-y-2">
          {/* Places and Addresses Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Cadastre (Block Lines)</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.placesAddresses}
                onChange={(e) => setLayers(prev => ({ ...prev, placesAddresses: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-nexamap-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
          </div>

          {/* Property and Planning Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">R-Codes Zoning (Layer 111)</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.propertyPlanning}
                onChange={(e) => setLayers(prev => ({ ...prev, propertyPlanning: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-nexamap-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
          </div>

          {/* Bush Fire Prone Areas Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Bush Fire Prone Areas</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.bushfireAreas}
                onChange={(e) => setLayers(prev => ({ ...prev, bushfireAreas: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-nexamap-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
          </div>

          {/* Infrastructure & Utilities Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Infrastructure & Utilities</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.infrastructure}
                onChange={(e) => setLayers(prev => ({ ...prev, infrastructure: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-nexamap-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexamap-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
