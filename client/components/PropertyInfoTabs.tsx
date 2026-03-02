import { useState } from "react";
import { Home, MapPin } from "lucide-react";
import { PropertyInfoPanel } from "./PropertyInfoPanel";
import { ListingsSearchPanel } from "./ListingsSearchPanel";
import type { Listing } from "./RealEstateListingsSidebar";
import type { ListingsSearchFilters } from "./RealEstateListingsFilter";
import type { SelectedParcel, PropertyData, PropertyValuation } from "../../shared/types";

interface PropertyInfoTabsProps {
  selectedParcel: SelectedParcel | null;
  address?: string;
  data?: PropertyData | null;
  onSearch: (filters: ListingsSearchFilters) => void;
  listings: Listing[];
  listingsLoading: boolean;
  selectedListingId?: string;
  onSelectListing?: (listing: Listing) => void;
  valuation?: PropertyValuation | null;
  valuationLoading?: boolean;
}

export function PropertyInfoTabs({
  selectedParcel,
  address,
  data,
  onSearch,
  listings,
  listingsLoading,
  selectedListingId,
  onSelectListing,
  valuation,
  valuationLoading,
}: PropertyInfoTabsProps) {
  const [activeTab, setActiveTab] = useState<"property" | "listings">(
    "property",
  );

  const handlePropertyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveTab("property");
  };

  const handleListingsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveTab("listings");
  };

  return (
    <div className="h-full w-full flex flex-col bg-white">
      {/* Tab Navigation */}
      <div className="flex gap-0 border-b-2 border-gray-300 flex-shrink-0 bg-white">
        {/* Property Tab */}
        <div
          onClick={handlePropertyClick}
          onMouseDown={(e) => e.preventDefault()}
          className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === "property"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Property</span>
        </div>

        {/* Listings Tab */}
        <div
          onClick={handleListingsClick}
          onMouseDown={(e) => e.preventDefault()}
          className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === "listings"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Listings</span>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {activeTab === "property" && (
          <PropertyInfoPanel
            selectedParcel={selectedParcel}
            address={address}
            data={data}
            valuation={valuation}
            valuationLoading={valuationLoading}
          />
        )}
        {activeTab === "listings" && (
          <ListingsSearchPanel
            onSearch={onSearch}
            listings={listings}
            listingsLoading={listingsLoading}
            selectedListingId={selectedListingId}
            onSelectListing={onSelectListing}
          />
        )}
      </div>
    </div>
  );
}
