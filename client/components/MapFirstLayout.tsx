import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  MapPin,
  House,
  Zap,
  Flame,
  Shield,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { LeafletMap } from "./LeafletMap";
import { PropertyCard } from "./PropertyCard";
import { Button } from "@/components/ui/button";
import { SimpleGooglePlacesInput } from "./SimpleGooglePlacesInput";
import { FloatingLayerControls, BaseLayerType } from "./FloatingLayerControls";
import { PropertyControlsState } from "./PropertyControls";
import { SubdivisionToolbar, SubdivisionMode } from "./SubdivisionToolbar";
import { SubdivisionNotification } from "./SubdivisionNotification";
import { MainToolbar } from "./MainToolbar";
import { DraggablePanel } from "./DraggablePanel";
import { PanelLoadingFallback } from "./PanelLoadingFallback";
import { OpenBetaBanner } from "./OpenBetaBanner";
import { FeedbackModal } from "./FeedbackModal";
import { PropertyInfoTabs } from "./PropertyInfoTabs";
import { ListingsSearchFilters } from "./RealEstateListingsFilter";
import type { Listing } from "./RealEstateListingsSidebar";
import {
  addListingsToMap,
  removeListingsFromMap,
  fitMapToBounds,
} from "@/lib/listings-map-markers";
import { toast } from "@/hooks/use-toast";
import L from "leaflet";
import { devLog } from "@/lib/logger";

// Lazy load heavy analysis components
const SubdivisionManager = lazy(() =>
  import("./SubdivisionManager").then((module) => ({
    default: module.SubdivisionManager,
  })),
);
const LotYieldPanel = lazy(() =>
  import("./LotYieldPanel").then((module) => ({
    default: module.LotYieldPanel,
  })),
);
const FeasibilityStudyPanel = lazy(() =>
  import("./FeasibilityStudyPanel").then((module) => ({
    default: module.FeasibilityStudyPanel,
  })),
);
const SetbackAnalysisPanel = lazy(() =>
  import("./SetbackAnalysisPanel").then((module) => ({
    default: module.SetbackAnalysisPanel,
  })),
);

interface PropertyData {
  lotSize: string;
  lotDimensions: string;
  planNumber: string;
  zoning: string;
  shire?: string;
  landUse?: string;
  bushfire: string;
  heritage: string;
  floodRisk: string;
  contamination: string;
  easements: string;
  soilType?: string;
  coordinates: [number, number];
  boundaryLengths?: string[];
  perimeter?: string;
  interiorAngles?: string[];
}

interface MapFirstLayoutProps {
  data: PropertyData | null;
  address?: string;
  coordinates?: [number, number];
  onSearch: (query: string, coordinates?: [number, number]) => void;
  onPropertySelect?: (
    propertyData: any,
    coordinates: [number, number],
    address: string,
  ) => void;
  loading?: boolean;
}

export function MapFirstLayout({
  data,
  address,
  coordinates,
  onSearch,
  onPropertySelect,
  loading,
}: MapFirstLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [subdivisionMode, setSubdivisionMode] = useState<SubdivisionMode>({
    active: false,
    drawing: false,
    classifying: false,
  });
  const [hasActiveSplits, setHasActiveSplits] = useState(false);
  const [hasGeneratedLots, setHasGeneratedLots] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<any>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [showYieldEstimator, setShowYieldEstimator] = useState(false);
  const [showFeasibilityStudy, setShowFeasibilityStudy] = useState(false);
  const [showSetbackAnalysis, setShowSetbackAnalysis] = useState(false);

  // Real estate listings state
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const listingsLayerRef = useRef<L.LayerGroup | null>(null);

  const mapRef = useRef<L.Map | null>(null);
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
  });
  const [propertyControls, setPropertyControls] =
    useState<PropertyControlsState>({
      boundaryDimensions: false, // Default to NOT showing dimensions
      propertyAngles: false, // Default to NOT showing angles
    });
  const [baseLayer, setBaseLayer] = useState<BaseLayerType>("osm");

  // Auto-enable Cadastre (Block Lines) when address is searched
  useEffect(() => {
    if (address && data?.coordinates) {
      setLayers((prev) => ({ ...prev, placesAddresses: true }));
    }
  }, [address, data?.coordinates]);

  const handleSearch = useCallback(
    (query: string, coordinates?: [number, number]) => {
      devLog.log("🔍 MapFirstLayout handleSearch:", { query, coordinates });
      onSearch(query, coordinates);
      if (coordinates) {
        setLayers((prev) => ({ ...prev, placesAddresses: true }));
        devLog.log("🎯 Setting map coordinates for zoom:", coordinates);
      }
    },
    [onSearch],
  );

  const handleSubdivisionModeChange = useCallback(
    (mode: SubdivisionMode) => {
      setSubdivisionMode(mode);

      // Collapse sidebar when in subdivision mode for better map visibility
      if (mode.active) {
        setSidebarOpen(false);

        // Show notification about subdivision workflow
        if (!selectedParcel) {
          setNotificationMessage(
            "Select a property first using normal map click, then use the Subdivision Tool.",
          );
          setShowNotification(true);
        } else if (mode.drawing) {
          setNotificationMessage(
            "Click points to draw subdivision lines. Lines will snap to boundaries and existing lines. Press ESC to cancel.",
          );
          setShowNotification(true);
        } else {
          setNotificationMessage(
            'Click "Draw Lines" to start drawing subdivision boundaries with CAD-like precision.',
          );
          setShowNotification(true);
        }
      } else {
        // Exiting subdivision mode
        setShowNotification(false);
      }

      // Let the LeafletMap component handle map invalidation to avoid conflicts
      devLog.log("✅ Subdivision mode changed, LeafletMap will handle refresh");
    },
    [selectedParcel],
  );

  // When a property is selected normally, store it for subdivision use
  const handlePropertySelect = useCallback(
    (propertyData: any, coordinates: [number, number], rawGeometry?: any) => {
      devLog.log("��� Property selected:", propertyData);
      devLog.log("🗺️ Raw geometry:", rawGeometry);
      devLog.log(
        "🏠 Cadastral info in property data:",
        propertyData?.cadastralInfo,
      );
      const formattedAddress = `Property at ${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}`;

      // Store selected parcel data for subdivision tool
      setSelectedParcel({
        data: propertyData,
        coordinates,
        address: formattedAddress,
        geometry: rawGeometry, // Store raw ESRI geometry with rings for DXF export
      });

      if (onPropertySelect) {
        onPropertySelect(propertyData, coordinates, formattedAddress);
      }

      // Enable Cadastre (Block Lines) layer to show property boundaries
      setLayers((prev) => ({ ...prev, placesAddresses: true }));

      // Ensure sidebar is open when property is selected
      setSidebarOpen(true);
    },
    [onPropertySelect],
  );

  const handleClearLines = useCallback(() => {
    const actions = (window as any).subdivisionActions;
    if (actions?.clearLines) {
      actions.clearLines();
    }
  }, []);

  const handleGenerateLots = useCallback(() => {
    const actions = (window as any).subdivisionActions;
    if (actions?.generateLots) {
      actions.generateLots();
    }
  }, []);

  const handleYieldEstimatorToggle = useCallback(() => {
    setShowYieldEstimator(!showYieldEstimator);
  }, [showYieldEstimator]);

  const handleFeasibilityStudyToggle = useCallback(() => {
    setShowFeasibilityStudy(!showFeasibilityStudy);
  }, [showFeasibilityStudy]);

  const handleSetbackAnalysisToggle = useCallback(() => {
    setShowSetbackAnalysis(!showSetbackAnalysis);
  }, [showSetbackAnalysis]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(!sidebarOpen);
  }, [sidebarOpen]);

  const handleBaseLayerChange = useCallback((layer: BaseLayerType) => {
    setBaseLayer(layer);
  }, []);

  // Handle real estate listings search
  const handleListingsSearch = useCallback(
    async (filters: ListingsSearchFilters) => {
      if (!mapRef.current) {
        toast({
          title: "❌ Map not ready",
          description: "Please wait for the map to load",
          variant: "destructive",
        });
        return;
      }

      setListingsLoading(true);

      try {
        const params = new URLSearchParams();
        if (filters.suburb) params.append("suburb", filters.suburb);
        if (filters.propertyType)
          params.append("propertyType", filters.propertyType);
        if (filters.minLotSize)
          params.append("minLotSize", filters.minLotSize.toString());
        if (filters.maxLotSize)
          params.append("maxLotSize", filters.maxLotSize.toString());
        if (filters.minPrice)
          params.append("minPrice", filters.minPrice.toString());
        if (filters.maxPrice)
          params.append("maxPrice", filters.maxPrice.toString());

        devLog.log("🏠 Searching listings with filters:", filters);

        const response = await fetch(`/api/listings/search?${params}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !data.listings) {
          throw new Error(data.message || "Failed to fetch listings");
        }

        // Filter out under-offer listings if requested
        let filteredListings = data.listings;
        const underOfferCount = data.listings.filter(
          (listing: any) => listing.underOffer,
        ).length;

        devLog.log(
          `📊 Total listings: ${data.listings.length}, Under offer: ${underOfferCount}`,
        );

        if (filters.excludeUnderOffer) {
          filteredListings = data.listings.filter(
            (listing: any) => !listing.underOffer,
          );
          devLog.log(
            `✅ Filter applied: Removed ${data.listings.length - filteredListings.length} under-offer listings`,
          );
        } else {
          devLog.log(
            `⚠️ Filter NOT applied - excludeUnderOffer is ${filters.excludeUnderOffer}`,
          );
        }

        setListings(filteredListings);
        setSelectedListing(null);

        // Remove previous markers
        if (listingsLayerRef.current && mapRef.current) {
          removeListingsFromMap(mapRef.current, listingsLayerRef.current);
        }

        // Add new markers
        if (filteredListings.length > 0 && mapRef.current) {
          const layer = addListingsToMap(mapRef.current, filteredListings, {
            colorScheme: "yield",
            backgroundFetch: true,
            onMarkerClick: (listing) => {
              setSelectedListing(listing);
            },
          });

          listingsLayerRef.current = layer;

          // Fit map to bounds
          fitMapToBounds(mapRef.current, filteredListings);
        }

        toast({
          title: "✅ Listings loaded",
          description: `Found ${filteredListings.length} properties${filters.excludeUnderOffer ? ` (${underOfferCount} hidden)` : ""}`,
          variant: "default",
        });
      } catch (error) {
        console.error("❌ Listings search error:", error);
        toast({
          title: "❌ Search failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to search listings",
          variant: "destructive",
        });
      } finally {
        setListingsLoading(false);
      }
    },
    [],
  );

  // Clear listings when sidebar closes
  useEffect(() => {
    if (listings.length === 0 && listingsLayerRef.current && mapRef.current) {
      removeListingsFromMap(mapRef.current, listingsLayerRef.current);
      listingsLayerRef.current = null;
    }
  }, [listings.length]);

  const mapCenter = useMemo(() => {
    const finalCoords = coordinates ||
      data?.coordinates || [-31.9505, 115.8605]; // Default to Perth, WA
    devLog.log(
      "🗺️ MapFirstLayout - Map center:",
      finalCoords,
      "address:",
      address,
      "zoom:",
      address ? 16 : 12,
    );
    return finalCoords;
  }, [coordinates, data?.coordinates, address]);

  const mapZoom = useMemo(() => (address ? 20 : 12), [address]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Header */}

      {/* Search Bar - Clean Positioning */}
      <div className="absolute top-20 left-4 right-4 z-[500]">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3">
            <div className="flex items-center space-x-3">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <SimpleGooglePlacesInput
                onPlaceSelected={handleSearch}
                placeholder="Search Western Australia..."
                className="flex-1 border-0 focus:ring-0 bg-transparent outline-none text-gray-900"
              />
              {subdivisionMode.active && (
                <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">
                  Subdivision Mode
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen Map */}
      <div className="absolute inset-0">
        <LeafletMap
          center={mapCenter}
          zoom={mapZoom}
          height="h-full"
          address={address}
          layers={layers}
          onPropertyClick={handlePropertySelect}
          propertyControls={propertyControls}
          onMapReady={(map) => (mapRef.current = map)}
          subdivisionModeActive={subdivisionMode.active}
          baseLayer={baseLayer}
          showSetbacks={showSetbackAnalysis}
          setbackData={
            selectedParcel?.data
              ? {
                  zoning: selectedParcel.data.zoning,
                  lotArea: selectedParcel.data.lotSize
                    ? parseFloat(
                        selectedParcel.data.lotSize.replace(/[^\d.]/g, ""),
                      )
                    : 400,
                }
              : null
          }
        />

        {/* Subdivision Manager Overlay */}
        <Suspense
          fallback={
            <PanelLoadingFallback
              title="Subdivision Tools"
              className="absolute top-4 left-4 z-[1000]"
            />
          }
        >
          <SubdivisionManager
            map={mapRef.current}
            subdivisionMode={subdivisionMode}
            selectedParcel={selectedParcel}
            onModeChange={handleSubdivisionModeChange}
            onSplitsChange={setHasActiveSplits}
            onLotsChange={setHasGeneratedLots}
          />
        </Suspense>

        {/* Lot Yield Estimator Panel - floats over map */}
        {showYieldEstimator && (
          <DraggablePanel
            title="Lot Yield Estimator"
            initialX={Math.max(0, window.innerWidth - 650)}
            initialY={80}
            className="w-80"
            onClose={() => setShowYieldEstimator(false)}
          >
            <Suspense
              fallback={
                <PanelLoadingFallback
                  title="Lot Yield Estimator"
                  className="w-80"
                />
              }
            >
              <LotYieldPanel
                selectedParcel={selectedParcel}
                propertyData={data}
                show={showYieldEstimator}
                onClose={() => setShowYieldEstimator(false)}
              />
            </Suspense>
          </DraggablePanel>
        )}

        {/* Feasibility Study Panel - floats over map */}
        {showFeasibilityStudy && (
          <DraggablePanel
            title="Feasibility Study"
            initialX={50}
            initialY={80}
            className="w-fit max-w-[95vw]"
            onClose={() => setShowFeasibilityStudy(false)}
          >
            <Suspense
              fallback={
                <PanelLoadingFallback
                  title="Feasibility Study"
                  className="w-96"
                />
              }
            >
              <FeasibilityStudyPanel
                selectedParcel={selectedParcel}
                show={showFeasibilityStudy}
                onClose={() => setShowFeasibilityStudy(false)}
              />
            </Suspense>
          </DraggablePanel>
        )}

        {/* Setback Analysis Panel - floats over map */}
        {showSetbackAnalysis && (
          <DraggablePanel
            title="Setback Analysis"
            initialX={Math.max(0, window.innerWidth - 650)}
            initialY={120}
            className="w-96"
            onClose={() => setShowSetbackAnalysis(false)}
          >
            <Suspense
              fallback={
                <PanelLoadingFallback
                  title="Setback Analysis"
                  className="w-96"
                />
              }
            >
              <SetbackAnalysisPanel
                selectedParcel={selectedParcel}
                show={showSetbackAnalysis}
                onClose={() => setShowSetbackAnalysis(false)}
              />
            </Suspense>
          </DraggablePanel>
        )}

        {/* Subdivision Toolbar - Bottom center, only for subdivision tools */}
        {(selectedParcel || subdivisionMode.active) && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[1000]">
            <div className="flex gap-3 items-center">
              <SubdivisionToolbar
                mode={subdivisionMode}
                onModeChange={handleSubdivisionModeChange}
                onClearLines={handleClearLines}
                onGenerateLots={handleGenerateLots}
                hasDrawnLines={hasActiveSplits}
                hasGeneratedLots={hasGeneratedLots}
                selectedParcel={selectedParcel}
                map={mapRef.current}
                propertyData={data}
              />
            </div>
          </div>
        )}

        {/* Subdivision Notification */}
        <SubdivisionNotification
          show={showNotification}
          message={notificationMessage}
          type="info"
          onDismiss={() => setShowNotification(false)}
          autoHide={true}
          duration={5000}
        />
      </div>

      {/* Left Sidebar Panel */}
      <div
        className={`absolute top-0 left-0 h-full bg-white shadow-xl border-r border-gray-200 transition-transform duration-300 z-[1000] flex flex-col ${
          sidebarOpen && !subdivisionMode.active
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
        style={{ width: "350px" }}
      >
        {/* Sidebar Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2F9fbd34283535421db2163a3b996c4e11?format=webp&width=800"
              alt="Nexamap Logo"
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className="text-center">
            <p className="text-gray-600 text-sm">
              {address || "Search for a property"}
            </p>
          </div>
        </div>

        {/* Sidebar Content - Tabbed Interface - Flex-1 to take remaining space */}
        <div className="flex-1 w-full overflow-hidden">
          <PropertyInfoTabs
            selectedParcel={selectedParcel}
            address={address}
            data={data}
            onSearch={handleListingsSearch}
            listings={listings}
            listingsLoading={listingsLoading}
            selectedListingId={selectedListing?.id}
            onSelectListing={setSelectedListing}
          />
        </div>
      </div>

      {/* Sidebar Toggle Button */}
      {!subdivisionMode.active && (
        <button
          onClick={handleSidebarToggle}
          className="absolute top-1/2 transform -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg p-2 shadow-lg hover:bg-gray-50 z-[1001] transition-all duration-300"
          style={{ left: sidebarOpen ? "350px" : "0px" }}
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          )}
        </button>
      )}

      {/* Right Sidebar - Map Layers & Analysis Tools */}
      <div
        className={`absolute top-0 right-0 h-full bg-white shadow-xl border-l border-gray-200 transition-transform duration-300 z-[1000] flex flex-col ${
          rightSidebarOpen && !subdivisionMode.active
            ? "translate-x-0"
            : "translate-x-full"
        }`}
        style={{ width: "280px" }}
      >
        <div className="flex-1 overflow-y-auto">
          <FloatingLayerControls
            layers={layers}
            onLayersChange={setLayers}
            propertyControls={propertyControls}
            onPropertyControlsChange={setPropertyControls}
            hasSelectedProperty={!!address}
            baseLayer={baseLayer}
            onBaseLayerChange={handleBaseLayerChange}
          />

          {selectedParcel && !subdivisionMode.active && (
            <div className="border-t border-gray-200">
              <MainToolbar
                selectedParcel={selectedParcel}
                showYieldEstimator={showYieldEstimator}
                onYieldEstimatorToggle={handleYieldEstimatorToggle}
                showFeasibilityStudy={showFeasibilityStudy}
                onFeasibilityStudyToggle={handleFeasibilityStudyToggle}
                showSetbackAnalysis={showSetbackAnalysis}
                onSetbackAnalysisToggle={handleSetbackAnalysisToggle}
                subdivisionActive={subdivisionMode.active}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar Toggle Button */}
      {!subdivisionMode.active && (
        <button
          onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
          className="absolute top-1/2 transform -translate-y-1/2 bg-white border border-gray-200 rounded-l-lg p-2 shadow-lg hover:bg-gray-50 z-[1001] transition-all duration-300"
          style={{ right: rightSidebarOpen ? "280px" : "0px" }}
        >
          {rightSidebarOpen ? (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          )}
        </button>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm">
            <div className="space-y-3 animate-pulse">
              <div className="h-3 bg-nexamap-200 rounded w-3/4 mx-auto"></div>
              <div className="h-3 bg-nexamap-200 rounded w-1/2 mx-auto"></div>
              <div className="h-6 bg-nexamap-200 rounded w-full"></div>
            </div>
            <p className="text-gray-600 text-center mt-4">
              Loading property data...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
