import React, { useState, useEffect, useRef } from "react";
import { loadGoogleMapsAPI, isGoogleMapsLoaded } from "@/lib/google-maps";
import { useDebounce } from "@/hooks/use-debounce";
import { devLog } from "@/lib/logger";

interface PlaceResult {
  place_id: string;
  formatted_address: string;
  coordinates?: [number, number];
}

interface SimpleGooglePlacesInputProps {
  onPlaceSelected: (query: string, coordinates?: [number, number]) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SimpleGooglePlacesInput({
  onPlaceSelected,
  placeholder = "Search Western Australia...",
  className = "",
  style,
}: SimpleGooglePlacesInputProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Debounce search input to reduce API calls (300ms delay)
  const debouncedSearchValue = useDebounce(value, 300);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  // Load Google Maps API
  useEffect(() => {
    const initializeGoogleMaps = async () => {
      try {
        if (!isGoogleMapsLoaded()) {
          await loadGoogleMapsAPI();
        }
        
        // Double check that all necessary objects are available
        if (window.google?.maps?.places?.AutocompleteService && window.google?.maps?.places?.PlacesService) {
          setMapsLoaded(true);
          serviceRef.current = new google.maps.places.AutocompleteService();
          const div = document.createElement('div');
          placesServiceRef.current = new google.maps.places.PlacesService(div);
        } else {
          devLog.warn('Google Places API not fully loaded');
        }
      } catch (error) {
        console.error('Failed to load Google Maps API:', error);
      }
    };

    initializeGoogleMaps();
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

  // Fetch suggestions with debounced value to reduce API calls
  useEffect(() => {
    if (debouncedSearchValue.length >= 2 && mapsLoaded && serviceRef.current) {
      const request: google.maps.places.AutocompletionRequest = {
        input: debouncedSearchValue,
        componentRestrictions: { country: 'au' },
        bounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(-35.191, 112.920), // Southwest corner of WA
          new google.maps.LatLng(-13.690, 129.001)  // Northeast corner of WA
        ),
        types: ['address'],
        region: 'au'
      };

      serviceRef.current.getPlacePredictions(request, (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          // Filter for Western Australia only
          const waResults = predictions.filter(prediction =>
            prediction.description.includes(', WA ') ||
            prediction.description.endsWith(', WA') ||
            prediction.terms.some(term => term.value === 'WA')
          );

          const results: PlaceResult[] = waResults.slice(0, 6).map(prediction => ({
            place_id: prediction.place_id,
            formatted_address: prediction.description,
          }));
          setSuggestions(results);
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
    }
  }, [debouncedSearchValue, mapsLoaded]);

  const handleSelect = (suggestion: PlaceResult) => {
    setValue(suggestion.formatted_address);
    setShowSuggestions(false);
    setHighlightedIndex(-1);

    // Get place details for coordinates
    if (placesServiceRef.current) {
      const request = {
        placeId: suggestion.place_id,
        fields: ['geometry', 'formatted_address']
      };

      placesServiceRef.current.getDetails(request, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          devLog.log('📍 Google Places coordinates retrieved:', [lat, lng], 'for:', suggestion.formatted_address);
          onPlaceSelected(suggestion.formatted_address, [lat, lng]);
        } else {
          devLog.warn('❌ Failed to get coordinates for:', suggestion.formatted_address, 'Status:', status);
          onPlaceSelected(suggestion.formatted_address);
        }
      });
    } else {
      onPlaceSelected(suggestion.formatted_address);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) {
      if (e.key === 'Enter' && value.trim()) {
        onPlaceSelected(value);
      }
      return;
    }

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
          handleSelect(suggestions[highlightedIndex]);
        } else if (value.trim()) {
          setShowSuggestions(false);
          onPlaceSelected(value);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (e.target.value.length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow for click events
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    }, 150);
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => value.length >= 2 && setShowSuggestions(true)}
        placeholder={placeholder}
        className={`w-full h-10 px-3 text-base bg-transparent border-0 focus:ring-0 outline-none placeholder:text-gray-400 ${className}`}
        style={{ textOverflow: 'ellipsis', ...style }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl z-[1100] max-h-80 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.place_id}
              className={`w-full text-left px-4 py-4 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-all duration-150 ${
                index === highlightedIndex ? 'bg-blue-50 border-blue-200' : ''
              }`}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="text-sm font-medium text-gray-900 leading-tight">
                {suggestion.formatted_address}
              </div>
            </button>
          ))}
        </div>
      )}

      {showSuggestions && value.length >= 2 && suggestions.length === 0 && mapsLoaded && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl z-[1100]">
          <div className="px-4 py-4 text-gray-500 text-center text-sm">
            No addresses found in Western Australia. Try a different search term.
          </div>
        </div>
      )}
    </div>
  );
}
