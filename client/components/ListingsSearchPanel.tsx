import { useState } from "react";
import {
  Search,
  X,
  Home,
  MapPin,
  DollarSign,
  Phone,
  ChevronDown,
} from "lucide-react";
import { useState as useState2, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ListingsSearchFilters } from "./RealEstateListingsFilter";
import { Listing } from "./RealEstateListingsSidebar";
import { loadGoogleMapsAPI, isGoogleMapsLoaded } from "@/lib/google-maps";
import { useDebounce } from "@/hooks/use-debounce";
import { devLog } from "@/lib/logger";

interface PlaceSuggestion {
  place_id: string;
  description: string;
  main_text: string;
}

interface ListingsSearchPanelProps {
  onSearch: (filters: ListingsSearchFilters) => void;
  listings: Listing[];
  listingsLoading: boolean;
  selectedListingId?: string;
  onSelectListing?: (listing: Listing) => void;
}

export function ListingsSearchPanel({
  onSearch,
  listings,
  listingsLoading,
  selectedListingId,
  onSelectListing,
}: ListingsSearchPanelProps) {
  const [selectedSuburbs, setSelectedSuburbs] = useState<string[]>([]);
  const [showSuburbDropdown, setShowSuburbDropdown] = useState2(false);
  const [suburbSearchQuery, setSuburbSearchQuery] = useState2("");
  const [placeSuggestions, setPlaceSuggestions] = useState2<PlaceSuggestion[]>(
    [],
  );
  const [mapsLoaded, setMapsLoaded] = useState2(false);
  const suburbDropdownRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(
    null,
  );
  const debouncedSearchValue = useDebounce(suburbSearchQuery, 300);

  const [propertyType, setPropertyType] = useState<
    "house" | "unit" | "land" | ""
  >("");
  const [minLotSize, setMinLotSize] = useState("");
  const [maxLotSize, setMaxLotSize] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [excludeUnderOffer, setExcludeUnderOffer] = useState(false);
  const [showForm, setShowForm] = useState(true);

  // Load Google Maps API
  useEffect(() => {
    const initMaps = async () => {
      try {
        if (!isGoogleMapsLoaded()) {
          await loadGoogleMapsAPI();
        }
        if (window.google?.maps?.places?.AutocompleteService) {
          setMapsLoaded(true);
          serviceRef.current = new google.maps.places.AutocompleteService();
        }
      } catch (error) {
        devLog.warn("Failed to load Google Maps API:", error);
      }
    };
    initMaps();
  }, []);

  // Fetch place suggestions
  useEffect(() => {
    if (debouncedSearchValue.length >= 2 && mapsLoaded && serviceRef.current) {
      const request: google.maps.places.AutocompletionRequest = {
        input: debouncedSearchValue,
        componentRestrictions: { country: "au" },
        bounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(-35.191, 112.92), // Southwest corner of WA
          new google.maps.LatLng(-13.69, 129.001), // Northeast corner of WA
        ),
        types: ["locality", "administrative_area_level_3"],
        region: "au",
      };

      serviceRef.current.getPlacePredictions(request, (predictions, status) => {
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          predictions
        ) {
          // Filter for Western Australia only
          const waResults = predictions.filter(
            (prediction) =>
              prediction.description.includes("WA") ||
              prediction.description.includes("Western Australia"),
          );

          setPlaceSuggestions(
            waResults.slice(0, 10).map((prediction) => ({
              place_id: prediction.place_id,
              description: prediction.description,
              main_text: prediction.main_text || prediction.description,
            })),
          );
        }
      });
    } else {
      setPlaceSuggestions([]);
    }
  }, [debouncedSearchValue, mapsLoaded]);

  const handleSuburbSelect = (locationName: string) => {
    // Add location from Google Places suggestion
    if (!selectedSuburbs.includes(locationName)) {
      setSelectedSuburbs([...selectedSuburbs, locationName]);
    }
    setSuburbSearchQuery("");
    setShowSuburbDropdown(false);
    setPlaceSuggestions([]);
  };

  const handleRemoveSuburb = (suburbName: string) => {
    setSelectedSuburbs(selectedSuburbs.filter((s) => s !== suburbName));
  };

  const handleSearch = () => {
    if (selectedSuburbs.length === 0) {
      toast({
        title: "⚠️ Missing Suburbs/Regions",
        description: "Please select at least one suburb or region",
        variant: "destructive",
      });
      return;
    }

    // Extract suburb names from Google Places descriptions
    // Google Places returns full descriptions like "Subiaco WA 6008, Australia"
    // We need to extract just the suburb name
    const extractedSuburbs = selectedSuburbs.map((desc) => {
      // Take the first part before the comma (e.g., "Subiaco" from "Subiaco WA 6008, Australia")
      const parts = desc.split(",");
      return parts[0].trim();
    });

    // Join suburbs with comma for multiple search
    const suburbsForSearch = extractedSuburbs.join(", ");

    const filters: ListingsSearchFilters = {
      suburb: suburbsForSearch,
      propertyType: (propertyType as any) || undefined,
      minLotSize: minLotSize ? parseFloat(minLotSize) : undefined,
      maxLotSize: maxLotSize ? parseFloat(maxLotSize) : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      excludeUnderOffer: excludeUnderOffer || undefined,
    };

    onSearch(filters);
    setShowForm(false);
  };

  const handleReset = () => {
    setSelectedSuburbs([]);
    setSuburbSearchQuery("");
    setPlaceSuggestions([]);
    setPropertyType("");
    setMinLotSize("");
    setMaxLotSize("");
    setMinPrice("");
    setMaxPrice("");
    setExcludeUnderOffer(false);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search Form Section */}
      {showForm ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Search Listings</h3>
          </div>

          {/* Suburb/Region Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Suburbs/Regions * (Select multiple)
            </label>

            {/* Selected Suburbs */}
            {selectedSuburbs.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedSuburbs.map((fullDescription) => {
                  // Extract suburb name from Google Places description
                  const displayName = fullDescription.split(",")[0].trim();
                  return (
                    <div
                      key={fullDescription}
                      className="flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium"
                    >
                      {displayName}
                      <button
                        onClick={() => handleRemoveSuburb(fullDescription)}
                        className="hover:bg-blue-200 rounded-full p-0.5 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Suburb Autocomplete Input */}
            <div className="relative" ref={suburbDropdownRef}>
              <div className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                <input
                  type="text"
                  value={suburbSearchQuery}
                  onChange={(e) => {
                    setSuburbSearchQuery(e.target.value);
                    setShowSuburbDropdown(true);
                  }}
                  onFocus={() => setShowSuburbDropdown(true)}
                  placeholder="Search suburbs, regions... (e.g., Perth Metro, Bunbury)"
                  className="w-full px-3 py-2 border-0 focus:ring-0 outline-none text-sm"
                />
                <ChevronDown className="w-4 h-4 text-gray-400 mr-3" />
              </div>

              {/* Dropdown with Google Places suggestions */}
              {showSuburbDropdown && placeSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                  {placeSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.place_id}
                      onClick={() => handleSuburbSelect(suggestion.description)}
                      disabled={selectedSuburbs.includes(
                        suggestion.description,
                      )}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span>{suggestion.main_text}</span>
                      </div>
                      <div className="text-xs text-gray-500 ml-5">
                        {suggestion.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Property Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property Type
            </label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">All Types</option>
              <option value="house">House</option>
              <option value="unit">Unit/Apartment</option>
              <option value="land">Land</option>
            </select>
          </div>

          {/* Min Lot Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Lot Size (m²)
            </label>
            <input
              type="number"
              value={minLotSize}
              onChange={(e) => setMinLotSize(e.target.value)}
              placeholder="e.g., 500"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Max Lot Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Lot Size (m²)
            </label>
            <input
              type="number"
              value={maxLotSize}
              onChange={(e) => setMaxLotSize(e.target.value)}
              placeholder="e.g., 2000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Min Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Price ($)
            </label>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="e.g., 400000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Max Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Price ($)
            </label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="e.g., 1000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Exclude Under Offer Checkbox */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 mb-3">
            <input
              type="checkbox"
              id="excludeUnderOfferSearch"
              checked={excludeUnderOffer}
              onChange={(e) => setExcludeUnderOffer(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <label
              htmlFor="excludeUnderOfferSearch"
              className="text-xs font-medium text-gray-700 cursor-pointer"
            >
              Hide listings under offer
            </label>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={handleSearch}
              disabled={listingsLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {listingsLoading ? "🔍 Searching..." : "🔍 Search Listings"}
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="w-full"
              size="sm"
            >
              Reset
            </Button>
          </div>

          <p className="text-xs text-gray-500 pt-2 border-t">
            💡 Tip: Start typing a suburb or region in Western Australia to
            search for listings
          </p>
        </div>
      ) : (
        // Results Section
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Results Header */}
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Listings
                </h3>
                <p className="text-xs text-gray-500">
                  {listings.length} properties found
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="p-1 hover:bg-white rounded-lg transition"
                title="Edit search"
              >
                <Search className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto">
            {listingsLoading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
                <p className="mt-2 text-sm">Loading listings...</p>
              </div>
            ) : listings.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Home className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  No listings found. Try adjusting your filters.
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => onSelectListing?.(listing)}
                    className={`p-3 border-2 rounded-lg cursor-pointer transition ${
                      selectedListingId === listing.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    {/* Image */}
                    {listing.imageUrl && (
                      <img
                        src={listing.imageUrl}
                        alt={listing.address}
                        className="w-full h-32 object-cover rounded-lg mb-2"
                      />
                    )}

                    {/* Address */}
                    <div className="flex items-start gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">
                          {listing.address}
                        </p>
                        <p className="text-xs text-gray-500">
                          {listing.suburb}, {listing.state} {listing.postcode}
                        </p>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <p className="font-bold text-green-600 text-sm">
                        {listing.price}
                      </p>
                    </div>

                    {/* Property Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      {listing.bedrooms !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Bed:</span>
                          <span className="text-gray-600">
                            {listing.bedrooms}
                          </span>
                        </div>
                      )}
                      {listing.bathrooms !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Bath:</span>
                          <span className="text-gray-600">
                            {listing.bathrooms}
                          </span>
                        </div>
                      )}
                      {listing.parking !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Parking:</span>
                          <span className="text-gray-600">
                            {listing.parking}
                          </span>
                        </div>
                      )}
                      {listing.landSize && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Land:</span>
                          <span className="text-gray-600">
                            {listing.landSize}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Agent Info */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200 text-xs">
                      <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-gray-700">{listing.agentName}</p>
                        <p className="text-gray-500">{listing.agentPhone}</p>
                      </div>
                    </div>

                    {/* View Listing Button */}
                    <button
                      onClick={() => window.open(listing.url, "_blank")}
                      className="w-full py-2 px-3 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-sm transition-colors"
                    >
                      View Listing
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
