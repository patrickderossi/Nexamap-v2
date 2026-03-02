import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GooglePlacesAutocomplete } from "./GooglePlacesAutocomplete";

interface SearchPanelProps {
  onSearch: (query: string, coordinates?: [number, number]) => void;
}

interface PlaceResult {
  place_id: string;
  formatted_address: string;
  name: string;
  secondary_text?: string;
  types: string[];
  geometry?: google.maps.places.PlaceGeometry;
  coordinates?: [number, number];
}

export function SearchPanel({ onSearch }: SearchPanelProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    // Auto-trigger search when a place is selected
    setTimeout(() => {
      onSearch(place.formatted_address, place.coordinates);
    }, 100);
  };

  return (
    <div className="relative bg-gray-50 py-16 px-6">
      {/* Background map watermark */}
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" viewBox="0 0 400 200" fill="none">
          <path
            d="M50 150 L100 120 L150 130 L200 100 L250 110 L300 90 L350 100"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M60 170 L110 140 L160 150 L210 120 L260 130 L310 110 L360 120"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <circle cx="150" cy="130" r="3" fill="currentColor" />
          <circle cx="250" cy="110" r="3" fill="currentColor" />
        </svg>
      </div>

      <div className="max-w-2xl mx-auto text-center relative z-10">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Analyze Your Building Site
        </h2>
        <p className="text-gray-600 mb-8">
          Enter address or lot/plan number to retrieve site details
        </p>
        
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <GooglePlacesAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={handlePlaceSelect}
              placeholder="Start typing an address in Western Australia..."
              className="text-base sm:text-lg"
            />
          </div>
          <Button
            type="submit"
            className="h-14 px-8 bg-gradient-to-r from-nexamap-500 to-nexamap-600 hover:from-nexamap-600 hover:to-nexamap-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Search className="w-5 h-5 mr-2" />
            Search
          </Button>
        </form>
        
        <div className="mt-4 text-xs text-gray-500">
          Powered by Google Places • Restricted to Western Australia • Use arrow keys to navigate
        </div>
      </div>
    </div>
  );
}
