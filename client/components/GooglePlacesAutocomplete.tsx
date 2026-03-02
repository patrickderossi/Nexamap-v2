import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Building } from "lucide-react";
import { loadGoogleMapsAPI, isGoogleMapsLoaded } from "@/lib/google-maps";
import { useDebounce } from "@/hooks/use-debounce";
import { ListItemSkeleton } from "./LoadingSkeleton";
import { devLog } from "@/lib/logger";

interface PlaceResult {
  place_id: string;
  formatted_address: string;
  name: string;
  secondary_text?: string;
  types: string[];
  geometry?: google.maps.places.PlaceGeometry;
  coordinates?: [number, number];
}

interface GooglePlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
}

export function GooglePlacesAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Enter address or lot/plan number",
  className = ""
}: GooglePlacesAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Debounce search input to reduce API calls (300ms delay)
  const debouncedSearchValue = useDebounce(value, 300);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load Google Maps API on component mount
  useEffect(() => {
    if (!isGoogleMapsLoaded()) {
      loadGoogleMapsAPI()
        .then(() => {
          if (window.google && window.google.maps && window.google.maps.places) {
            setMapsLoaded(true);
            serviceRef.current = new google.maps.places.AutocompleteService();
            // Create a dummy div for PlacesService
            const div = document.createElement('div');
            placesServiceRef.current = new google.maps.places.PlacesService(div);
          }
        })
        .catch(error => {
          devLog.warn('Failed to load Google Maps API:', error);
        });
    } else {
      if (window.google && window.google.maps && window.google.maps.places) {
        setMapsLoaded(true);
        serviceRef.current = new google.maps.places.AutocompleteService();
        const div = document.createElement('div');
        placesServiceRef.current = new google.maps.places.PlacesService(div);
      }
    }
  }, []);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  // Fetch suggestions from Google Places API with debounced value
  useEffect(() => {
    if (debouncedSearchValue.length >= 2 && mapsLoaded && serviceRef.current) {
      setIsLoading(true);

      // Detect if user is searching for a lot/plan number
      const isLotSearch = /LOT\s+\d+|DP\s*\d+|SP\s*\d+/i.test(debouncedSearchValue);

      const request: google.maps.places.AutocompletionRequest = {
        input: debouncedSearchValue,
        componentRestrictions: { country: 'AU' },
        bounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(-35.191, 112.920), // Southwest corner of WA
          new google.maps.LatLng(-13.690, 129.001)  // Northeast corner of WA
        ),
        // Use geocode for broader results, address for specific addresses
        types: isLotSearch ? ['geocode'] : ['address'],
        region: 'au'
      };

      serviceRef.current.getPlacePredictions(request, (predictions, status) => {
        setIsLoading(false);

        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          // Filter for Western Australia only
          const waResults = predictions.filter(prediction => 
            prediction.description.includes(', WA ') || 
            prediction.description.endsWith(', WA') ||
            prediction.terms.some(term => term.value === 'WA')
          );
          
          const formattedResults: PlaceResult[] = waResults.slice(0, 6).map(prediction => ({
            place_id: prediction.place_id,
            formatted_address: prediction.description,
            name: prediction.structured_formatting.main_text,
            secondary_text: prediction.structured_formatting.secondary_text,
            types: prediction.types
          }));
          
          setSuggestions(formattedResults);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
        setHighlightedIndex(-1);
      });
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
    }
  }, [debouncedSearchValue, mapsLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    // Show suggestions when typing resumes
    if (e.target.value.length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleSuggestionClick = (place: PlaceResult) => {
    onChange(place.formatted_address);
    setShowSuggestions(false);
    setHighlightedIndex(-1);

    // Get detailed place information including coordinates
    if (placesServiceRef.current) {
      const request = {
        placeId: place.place_id,
        fields: ['name', 'geometry', 'formatted_address', 'address_components']
      };

      placesServiceRef.current.getDetails(request, (placeDetails, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && placeDetails?.geometry?.location) {
          const coordinates: [number, number] = [
            placeDetails.geometry.location.lat(),
            placeDetails.geometry.location.lng()
          ];

          // Create enhanced place result with coordinates
          const enhancedResult: PlaceResult = {
            ...place,
            geometry: placeDetails.geometry,
            coordinates
          };

          onSelect(enhancedResult);
        } else {
          // Fallback to original place if details fetch fails
          onSelect(place);
        }
      });
    } else {
      onSelect(place);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSuggestionClick(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay hiding suggestions to allow for click events
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    }, 150);
  };

  const getPlaceIcon = (types: string[]) => {
    if (types.includes('street_address') || types.includes('route')) {
      return <MapPin className="w-4 h-4 text-nexamap-500" />;
    } else if (types.includes('establishment') || types.includes('point_of_interest')) {
      return <Building className="w-4 h-4 text-nexamap-500" />;
    }
    return <MapPin className="w-4 h-4 text-nexamap-500" />;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => value.length >= 2 && setShowSuggestions(true)}
          placeholder={placeholder}
          disabled={!mapsLoaded}
          className={`w-full h-14 text-lg px-4 pr-12 border-2 border-gray-300 rounded-xl bg-white shadow-sm focus:border-nexamap-500 focus:ring-4 focus:ring-nexamap-100 focus:shadow-md outline-none transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed placeholder:text-gray-400 ${className}`}
          style={{ textOverflow: 'ellipsis' }}
        />
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
          {isLoading ? (
            <div className="w-6 h-6 bg-nexamap-200 rounded animate-pulse"></div>
          ) : (
            <Search className="w-6 h-6 text-gray-500" />
          )}
        </div>
      </div>

      {!mapsLoaded && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
          <div className="px-4 py-3 text-gray-500 text-center">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
              <span>Loading Google Maps...</span>
            </div>
          </div>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && mapsLoaded && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 z-50 bg-white border-2 border-gray-200 rounded-xl shadow-xl mt-2 max-h-80 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.place_id}
              className={`px-4 py-4 cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-nexamap-50 transition-all duration-150 ${
                index === highlightedIndex ? 'bg-nexamap-100 border-nexamap-200' : ''
              }`}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {getPlaceIcon(suggestion.types)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 leading-tight">
                    {suggestion.name}
                  </div>
                  <div className="text-sm text-gray-600 mt-1 leading-tight">
                    {suggestion.secondary_text || 'Western Australia'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSuggestions && value.length >= 2 && suggestions.length === 0 && !isLoading && mapsLoaded && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border-2 border-gray-200 rounded-xl shadow-xl mt-2">
          <div className="px-4 py-4 text-gray-500 text-center">
            No addresses found in Western Australia. Try a different search term.
          </div>
        </div>
      )}
    </div>
  );
}
