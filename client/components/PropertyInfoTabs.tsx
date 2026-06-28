import { useState } from "react";
import { Home, MapPin } from "lucide-react";
import { C, FONT } from "@/lib/nexa-ui";
import { PropertyInfoPanel } from "./PropertyInfoPanel";
import { ListingsSearchPanel } from "./ListingsSearchPanel";
import type { Listing } from "./RealEstateListingsSidebar";
import type { ListingsSearchFilters } from "./RealEstateListingsFilter";
import type { SelectedParcel, PropertyData, PropertyValuation } from "../../shared/types";
import type { CouncilPlanningResult } from "@/lib/intramaps-service";

interface PropertyInfoTabsProps {
  selectedParcel: SelectedParcel | null;
  address?: string;
  data?: PropertyData | null;
  onSearch: (filters: ListingsSearchFilters) => void;
  listings: Listing[];
  listingsLoading: boolean;
  selectedListingId?: string;
  onSelectListing?: (listing: Listing) => void;
  valuationData?: PropertyValuation | null;
  valuationLoading?: boolean;
  valuationError?: string | null;
  estimateUrl?: string | null;
  estimateLoading?: boolean;
  onGetEstimate?: () => void;
  councilPlanning?: CouncilPlanningResult | null;
  councilPlanningLoading?: boolean;
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
  valuationData,
  valuationLoading,
  valuationError,
  estimateUrl,
  estimateLoading,
  onGetEstimate,
  councilPlanning,
  councilPlanningLoading,
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 38,
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: "13px",
    fontWeight: 600,
    transition: "all .15s",
    background: active ? "#fff" : "transparent",
    color: active ? C.blue : C.label,
    boxShadow: active
      ? "0 1px 3px rgba(16,24,20,.1), inset 0 0 0 1px rgba(20,28,24,.07)"
      : "none",
  });

  return (
    <div className="h-full w-full flex flex-col" style={{ fontFamily: FONT, color: C.ink }}>
      {/* Tab Navigation — segmented pills */}
      <div style={{ display: "flex", gap: 2, padding: "8px 10px 6px", flexShrink: 0 }}>
        <div onClick={handlePropertyClick} onMouseDown={(e) => e.preventDefault()} style={tabStyle(activeTab === "property")}>
          <MapPin className="w-4 h-4" />
          <span>Property</span>
        </div>
        <div onClick={handleListingsClick} onMouseDown={(e) => e.preventDefault()} style={tabStyle(activeTab === "listings")}>
          <Home className="w-4 h-4" />
          <span>Listings</span>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "property" && (
          <PropertyInfoPanel
            selectedParcel={selectedParcel}
            address={address}
            data={data}
            valuationData={valuationData}
            valuationLoading={valuationLoading}
            valuationError={valuationError}
            estimateUrl={estimateUrl}
            estimateLoading={estimateLoading}
            onGetEstimate={onGetEstimate}
            councilPlanning={councilPlanning}
            councilPlanningLoading={councilPlanningLoading}
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
