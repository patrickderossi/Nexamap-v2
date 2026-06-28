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
import { devLog } from "@/lib/logger";
import type { SelectedParcel, PropertyData, PropertyValuation } from "../../shared/types";
import { fetchPropertyUrl } from "@/lib/valuation-service";
import { C, FONT, MONO, panel, floatChrome, badge } from "@/lib/nexa-ui";
import {
  fetchCouncilPlanning,
  addressFromCadastral,
  type CouncilPlanningResult,
} from "@/lib/intramaps-service";

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
const ValuationEstimatePanel = lazy(() =>
  import("./ValuationEstimatePanel").then((module) => ({
    default: module.ValuationEstimatePanel,
  })),
);

interface MapFirstLayoutProps {
  data: PropertyData | null;
  address?: string;
  coordinates?: [number, number];
  onSearch: (query: string, coordinates?: [number, number]) => void;
  onPropertySelect?: (
    propertyData: PropertyData,
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
  const [selectedParcel, setSelectedParcel] = useState<SelectedParcel | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [showYieldEstimator, setShowYieldEstimator] = useState(false);
  const [showFeasibilityStudy, setShowFeasibilityStudy] = useState(false);
  const [showSetbackAnalysis, setShowSetbackAnalysis] = useState(false);
  const [showValuationEstimate, setShowValuationEstimate] = useState(false);

  const [valuationData, setValuationData] = useState<PropertyValuation | null>(null);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);
  const valuationRequestRef = useRef(0);

  // property.com.au estimate link — pre-resolved to the property's exact
  // `-pid-` page via REA's free address-suggest API (no key, no scrape). We
  // pre-fetch it when a parcel is selected so the "Get Estimate" button is a
  // real, ready link by the time the user reads the panel.
  const [estimateUrl, setEstimateUrl] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const estimateReqRef = useRef(0);

  useEffect(() => {
    const pd: any = selectedParcel?.data;
    const { address: estAddr, suburb: estSuburb } = addressFromCadastral(pd?.cadastralInfo);
    setEstimateUrl(null);
    if (!estAddr || !estSuburb) {
      setEstimateLoading(false);
      return;
    }
    const reqId = ++estimateReqRef.current;
    setEstimateLoading(true);
    fetchPropertyUrl(estAddr, estSuburb)
      .then((url) => {
        if (estimateReqRef.current === reqId) setEstimateUrl(url);
      })
      .catch((err) => {
        if (estimateReqRef.current === reqId) devLog.warn("estimate URL resolve failed:", err);
      })
      .finally(() => {
        if (estimateReqRef.current === reqId) setEstimateLoading(false);
      });
  }, [selectedParcel]);

  const [councilPlanning, setCouncilPlanning] = useState<CouncilPlanningResult | null>(null);
  const [councilPlanningLoading, setCouncilPlanningLoading] = useState(false);
  const planningRequestRef = useRef(0);

  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const listingsLayerRef = useRef<L.LayerGroup | null>(null);

  const mapRef = useRef<any>(null);
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
  const [propertyControls, setPropertyControls] =
    useState<PropertyControlsState>({
      boundaryDimensions: false, // Default to NOT showing dimensions
      propertyAngles: false, // Default to NOT showing angles
    });
  const [baseLayer, setBaseLayer] = useState<BaseLayerType>("positron");

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
    (propertyData: PropertyData, coordinates: [number, number], rawGeometry?: { rings: number[][][] }) => {
      devLog.log("��� Property selected:", propertyData);
      devLog.log("🗺️ Raw geometry:", rawGeometry);
      devLog.log(
        "🏠 Cadastral info in property data:",
        propertyData?.cadastralInfo,
      );
      const formattedAddress = `Property at ${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}`;

      setSelectedParcel({
        data: propertyData,
        coordinates,
        address: formattedAddress,
        geometry: rawGeometry,
      });

      if (onPropertySelect) {
        onPropertySelect(propertyData, coordinates, formattedAddress);
      }

      setLayers((prev) => ({ ...prev, placesAddresses: true }));
      setSidebarOpen(true);

      setValuationData(null);
      setValuationLoading(false);
      setValuationError(null);

      // Council planning (IntraMaps): authoritative scheme/zone + LDP/precinct overlays.
      setCouncilPlanning(null);
      const { address: planningAddress, suburb: planningSuburb } = addressFromCadastral(
        propertyData?.cadastralInfo as any,
      );
      if (planningAddress && planningSuburb) {
        const planningId = ++planningRequestRef.current;
        setCouncilPlanningLoading(true);
        fetchCouncilPlanning({ address: planningAddress, suburb: planningSuburb })
          .then((result) => {
            if (planningRequestRef.current === planningId) setCouncilPlanning(result);
          })
          .catch(() => {
            if (planningRequestRef.current === planningId)
              setCouncilPlanning({ success: false, reason: "error" });
          })
          .finally(() => {
            if (planningRequestRef.current === planningId) setCouncilPlanningLoading(false);
          });
      } else {
        setCouncilPlanningLoading(false);
      }

      // NOTE: the property value estimate is no longer fetched. "Get Estimate"
      // is now a pre-built link to the property.com.au page (see `estimateUrl`).
    },
    [onPropertySelect],
  );

  // Merge slow supplementary data (amenities, elevation, postcode, road class)
  // into the already-visible panel once it arrives — without disturbing the
  // valuation/council-planning fetches kicked off in handlePropertySelect.
  const handlePropertyEnrich = useCallback((extraData: any) => {
    setSelectedParcel((prev) =>
      prev ? { ...prev, data: { ...prev.data, ...extraData } } : prev,
    );
  }, []);

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

  const handleAutoSubdivide = useCallback(() => {
    const actions = (window as any).subdivisionActions;
    if (actions?.toggleAutoSubdivide) {
      actions.toggleAutoSubdivide();
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

  const handleValuationEstimateToggle = useCallback(() => {
    setShowValuationEstimate(!showValuationEstimate);
  }, [showValuationEstimate]);

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

      {/* Search Bar — floating frosted pill (NexaMap redesign) */}
      <div
        className="absolute top-[18px] left-1/2 z-[500]"
        style={{ transform: "translateX(-50%)", width: 540, maxWidth: "46vw" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            height: 48,
            padding: "0 8px 0 15px",
            background: "rgba(255,255,255,.9)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 14,
            boxShadow:
              "0 2px 5px rgba(16,24,20,.05), 0 14px 34px -8px rgba(16,24,20,.2)",
            fontFamily: FONT,
          }}
        >
          <Search className="w-[18px] h-[18px] flex-shrink-0" style={{ color: "#8a918a" }} />
          <SimpleGooglePlacesInput
            onPlaceSelected={handleSearch}
            placeholder="Search address, lot, suburb, or coordinates…"
            className="flex-1 border-0 focus:ring-0 bg-transparent outline-none"
            style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14, color: C.ink }}
          />
          {subdivisionMode.active ? (
            <span style={{ ...badge("blue"), height: 24, borderRadius: 7 }}>
              Subdivision
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 24,
                padding: "0 8px",
                borderRadius: 7,
                background: "rgba(20,28,24,.05)",
                color: C.label,
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              ⌘K
            </span>
          )}
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
          onPropertyEnrich={handlePropertyEnrich}
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
            selectedParcel={selectedParcel ?? undefined}
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
                selectedParcel={selectedParcel ?? undefined}
                propertyData={selectedParcel?.data ?? data}
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
                selectedParcel={selectedParcel ?? undefined}
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
                selectedParcel={selectedParcel ?? undefined}
                show={showSetbackAnalysis}
                onClose={() => setShowSetbackAnalysis(false)}
              />
            </Suspense>
          </DraggablePanel>
        )}

        {/* Valuation Estimate Panel - floats over map */}
        {showValuationEstimate && (
          <DraggablePanel
            title="Valuation Estimate"
            initialX={Math.max(0, window.innerWidth - 700)}
            initialY={100}
            className="w-96"
            onClose={() => setShowValuationEstimate(false)}
          >
            <Suspense
              fallback={
                <PanelLoadingFallback
                  title="Valuation Estimate"
                  className="w-96"
                />
              }
            >
              <ValuationEstimatePanel
                selectedParcel={selectedParcel ?? undefined}
                propertyData={data}
                show={showValuationEstimate}
                onClose={() => setShowValuationEstimate(false)}
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
                onAutoSubdivide={handleAutoSubdivide}
                hasDrawnLines={hasActiveSplits}
                hasGeneratedLots={hasGeneratedLots}
                selectedParcel={selectedParcel ?? undefined}
                map={mapRef.current}
                propertyData={selectedParcel ?? undefined}
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

      {/* Left Sidebar Panel — floating frosted panel (NexaMap redesign) */}
      <div
        className={`absolute z-[1000] flex flex-col transition-transform duration-300 ${
          sidebarOpen && !subdivisionMode.active
            ? "translate-x-0"
            : "-translate-x-[380px]"
        }`}
        style={{ left: 14, top: 14, bottom: 14, width: 352, ...panel }}
      >
        {/* Brand header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "13px 16px 12px",
            borderBottom: `1px solid ${C.line}`,
            flexShrink: 0,
          }}
        >
          <img
            src="https://cdn.builder.io/api/v1/image/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2F9fbd34283535421db2163a3b996c4e11?format=webp&width=800"
            alt="NexaMap"
            style={{ height: 30, width: "auto", objectFit: "contain" }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: "9.5px",
              letterSpacing: ".14em",
              color: C.faint,
            }}
          >
            PROPERTY INTELLIGENCE
          </span>
        </div>

        {/* Tabbed content */}
        <div className="flex-1 w-full overflow-hidden" style={{ display: "flex", flexDirection: "column" }}>
          <PropertyInfoTabs
            selectedParcel={selectedParcel}
            address={address}
            data={data}
            onSearch={handleListingsSearch}
            listings={listings}
            listingsLoading={listingsLoading}
            selectedListingId={selectedListing?.id}
            onSelectListing={setSelectedListing}
            valuationData={valuationData}
            valuationLoading={valuationLoading}
            valuationError={valuationError}
            estimateUrl={estimateUrl}
            estimateLoading={estimateLoading}
            councilPlanning={councilPlanning}
            councilPlanningLoading={councilPlanningLoading}
          />
        </div>
      </div>

      {/* Sidebar Toggle Button */}
      {!subdivisionMode.active && (
        <button
          onClick={handleSidebarToggle}
          className="absolute top-1/2 z-[1001] flex items-center justify-center transition-all duration-300"
          style={{
            transform: "translateY(-50%)",
            left: sidebarOpen ? 372 : 8,
            width: 26,
            height: 40,
            borderRadius: 10,
            color: C.muted,
            ...floatChrome,
          }}
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-[18px] h-[18px]" />
          ) : (
            <ChevronRight className="w-[18px] h-[18px]" />
          )}
        </button>
      )}

      {/* Right Sidebar - Map Layers & Analysis Tools (floating frosted panel) */}
      <div
        className={`absolute z-[1000] flex flex-col transition-transform duration-300 ${
          rightSidebarOpen && !subdivisionMode.active
            ? "translate-x-0"
            : "translate-x-[360px]"
        }`}
        style={{ right: 14, top: 14, bottom: 14, width: 316, ...panel }}
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
            <div style={{ borderTop: `1px solid ${C.line}` }}>
              <MainToolbar
                selectedParcel={selectedParcel}
                showYieldEstimator={showYieldEstimator}
                onYieldEstimatorToggle={handleYieldEstimatorToggle}
                showFeasibilityStudy={showFeasibilityStudy}
                onFeasibilityStudyToggle={handleFeasibilityStudyToggle}
                showSetbackAnalysis={showSetbackAnalysis}
                onSetbackAnalysisToggle={handleSetbackAnalysisToggle}
                showValuationEstimate={showValuationEstimate}
                onValuationEstimateToggle={handleValuationEstimateToggle}
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
          className="absolute top-1/2 z-[1001] flex items-center justify-center transition-all duration-300"
          style={{
            transform: "translateY(-50%)",
            right: rightSidebarOpen ? 336 : 8,
            width: 26,
            height: 40,
            borderRadius: 10,
            color: C.muted,
            ...floatChrome,
          }}
        >
          {rightSidebarOpen ? (
            <ChevronRight className="w-[18px] h-[18px]" />
          ) : (
            <ChevronLeft className="w-[18px] h-[18px]" />
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
