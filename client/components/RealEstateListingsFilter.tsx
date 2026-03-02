import { useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export interface ListingsSearchFilters {
  suburb?: string;
  propertyType?: "house" | "unit" | "land";
  minLotSize?: number;
  maxLotSize?: number;
  minPrice?: number;
  maxPrice?: number;
  excludeUnderOffer?: boolean;
}

interface RealEstateListingsFilterProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (filters: ListingsSearchFilters) => void;
  isLoading?: boolean;
}

export function RealEstateListingsFilter({
  isOpen,
  onClose,
  onSearch,
  isLoading = false,
}: RealEstateListingsFilterProps) {
  const [suburb, setSuburb] = useState("");
  const [propertyType, setPropertyType] = useState<
    "house" | "unit" | "land" | ""
  >("");
  const [minLotSize, setMinLotSize] = useState("");
  const [maxLotSize, setMaxLotSize] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [excludeUnderOffer, setExcludeUnderOffer] = useState(false);

  const handleSearch = () => {
    if (!suburb.trim()) {
      toast({
        title: "⚠️ Missing Suburb",
        description: "Please enter a suburb name",
        variant: "destructive",
      });
      return;
    }

    const filters: ListingsSearchFilters = {
      suburb: suburb.trim(),
      propertyType: (propertyType as any) || undefined,
      minLotSize: minLotSize ? parseFloat(minLotSize) : undefined,
      maxLotSize: maxLotSize ? parseFloat(maxLotSize) : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      excludeUnderOffer: excludeUnderOffer || undefined,
    };

    onSearch(filters);
  };

  const handleReset = () => {
    setSuburb("");
    setPropertyType("");
    setMinLotSize("");
    setMaxLotSize("");
    setMinPrice("");
    setMaxPrice("");
    setExcludeUnderOffer(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end">
      <div className="bg-white w-full max-w-2xl rounded-t-2xl shadow-xl p-6 animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Search className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold">Find Properties</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Suburb */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Suburb *
            </label>
            <input
              type="text"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              placeholder="e.g., Perth, Fremantle"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Property Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property Type
            </label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Exclude Under Offer Checkbox */}
        <div className="mb-6 flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <input
            type="checkbox"
            id="excludeUnderOffer"
            checked={excludeUnderOffer}
            onChange={(e) => setExcludeUnderOffer(e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
          />
          <label
            htmlFor="excludeUnderOffer"
            className="text-sm font-medium text-gray-700 cursor-pointer"
          >
            Hide listings under offer
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleSearch}
            disabled={isLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? "🔍 Searching..." : "🔍 Search Listings"}
          </Button>
          <Button onClick={handleReset} variant="outline" className="px-6">
            Reset
          </Button>
          <Button onClick={onClose} variant="outline" className="px-6">
            Close
          </Button>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          💡 Tip: This searches realestate.com.au for current listings in
          Western Australia
        </p>
      </div>
    </div>
  );
}
