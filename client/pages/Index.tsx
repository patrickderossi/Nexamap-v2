import { useState, lazy, Suspense } from "react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { MapLoadingFallback } from "@/components/MapLoadingFallback";
import { queryPropertyDetails } from "@/lib/slip-wa-api";
import { devLog } from "@/lib/logger";

// Lazy load the heavy MapFirstLayout component
const MapFirstLayout = lazy(() =>
  import("@/components/MapFirstLayout").then((module) => ({
    default: module.MapFirstLayout,
  })),
);

export default function Index() {
  const [searchResults, setSearchResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchedAddress, setSearchedAddress] = useState("");
  const [searchedCoordinates, setSearchedCoordinates] = useState<
    [number, number] | undefined
  >(undefined);

  const handlePropertySelect = async (
    propertyData: any,
    coordinates: [number, number],
    formattedAddress: string,
  ) => {
    setLoading(true);
    setSearchedAddress(formattedAddress);
    setSearchedCoordinates(coordinates);

    // Convert the property data to match our interface
    const resultsWithCoordinates = {
      lotSize: propertyData.lotSize || "Unknown",
      lotDimensions: propertyData.dimensions || "Unknown",
      planNumber: propertyData.planNumber || "Unknown",
      zoning: propertyData.rCode || "Unknown",
      shire: propertyData.zoning || propertyData.lpsZone || "Unknown Shire",
      landUse: propertyData.landUse || "Unknown",
      mrsZone: propertyData.mrsZone || "Unknown",
      lpsOverlays: propertyData.lpsOverlays || [],
      lgaName: propertyData.lgaName || "Unknown",
      bushfire: propertyData.balRating || "Unknown",
      bushfirePlanningArea: propertyData.bushfirePlanningArea,
      heritage: propertyData.heritage || "No",
      heritageState: propertyData.heritageState,
      heritageStateId: propertyData.heritageStateId,
      heritageLocal: propertyData.heritageLocal,
      floodRisk: propertyData.floodZone || propertyData.floodRisk || "Unknown",
      contamination: propertyData.contamination || "Unknown",
      acidSulfateSoil: propertyData.acidSulfateSoil || "Unknown",
      publicDrinkingWater: propertyData.publicDrinkingWater || "Unknown",
      aboriginalHeritage: propertyData.aboriginalHeritage || "Unknown",
      airportNoiseBuf: propertyData.airportNoiseBuf,
      roadRailNoiseBuf: propertyData.roadRailNoiseBuf,
      soilType: propertyData.soilType || "Unknown",
      easements: "Unknown",
      coordinates: coordinates,
      boundaryLengths: propertyData.boundaryLengths,
      perimeter: propertyData.perimeter,
      interiorAngles: propertyData.interiorAngles,
      // External APIs
      elevationM: propertyData.elevationM,
      postcode: propertyData.postcode,
      sa2Name: propertyData.sa2Name,
      roadClassification: propertyData.roadClassification,
      roadNetworkType: propertyData.roadNetworkType,
    };

    setSearchResults(resultsWithCoordinates);
    setLoading(false);
  };

  const handleSearch = async (
    query: string,
    coordinates?: [number, number],
  ) => {
    devLog.log("🔍 Index.tsx handleSearch called:", { query, coordinates });
    setLoading(true);
    setSearchedAddress(query);
    setSearchedCoordinates(coordinates);
    devLog.log("���� Index.tsx searchedCoordinates set to:", coordinates);

    try {
      if (coordinates) {
        devLog.log(
          `🔍 Querying SLIP WA for: ${query} at [${coordinates[0]}, ${coordinates[1]}]`,
        );

        // Query real SLIP WA data
        const realPropertyData = await queryPropertyDetails({
          coordinates,
          address: query,
        });

        devLog.log("📊 SLIP WA Results:", realPropertyData);
        devLog.log("🔥 BAL Rating from API:", realPropertyData.balRating);

        // Combine with coordinates for map display
        const resultsWithCoordinates = {
          lotSize: realPropertyData.lotSize || "Unknown",
          lotDimensions: realPropertyData.dimensions || "Unknown",
          planNumber: realPropertyData.planNumber || "Unknown",
          zoning: realPropertyData.rCode || "Unknown",
          shire: realPropertyData.zoning || realPropertyData.lpsZone || "Unknown Shire",
          landUse: realPropertyData.landUse || "Unknown",
          mrsZone: realPropertyData.mrsZone || "Unknown",
          lpsOverlays: realPropertyData.lpsOverlays || [],
          lgaName: realPropertyData.lgaName || "Unknown",
          bushfire: realPropertyData.balRating || "Unknown",
          bushfirePlanningArea: realPropertyData.bushfirePlanningArea,
          heritage: realPropertyData.heritage || "No",
          heritageState: realPropertyData.heritageState,
          heritageStateId: realPropertyData.heritageStateId,
          heritageLocal: realPropertyData.heritageLocal,
          floodRisk: realPropertyData.floodZone || realPropertyData.floodRisk || "Unknown",
          contamination: realPropertyData.contamination || "Unknown",
          acidSulfateSoil: realPropertyData.acidSulfateSoil || "Unknown",
          publicDrinkingWater: realPropertyData.publicDrinkingWater || "Unknown",
          aboriginalHeritage: realPropertyData.aboriginalHeritage || "Unknown",
          airportNoiseBuf: realPropertyData.airportNoiseBuf,
          roadRailNoiseBuf: realPropertyData.roadRailNoiseBuf,
          soilType: realPropertyData.soilType || "Unknown",
          easements: "Unknown",
          coordinates: coordinates,
          boundaryLengths: realPropertyData.boundaryLengths,
          perimeter: realPropertyData.perimeter,
          interiorAngles: realPropertyData.interiorAngles,
          // External APIs
          elevationM: realPropertyData.elevationM,
          postcode: realPropertyData.postcode,
          sa2Name: realPropertyData.sa2Name,
          roadClassification: realPropertyData.roadClassification,
          roadNetworkType: realPropertyData.roadNetworkType,
        };

        devLog.log("🏠 Final Results:", resultsWithCoordinates);

        setSearchResults(resultsWithCoordinates);

        // Auto-select the property after setting results
        setTimeout(() => {
          handlePropertySelect(realPropertyData, coordinates, query);
        }, 500);
      } else {
        // No coordinates provided, cannot fetch property data
        setSearchResults(null);
      }
    } catch (error) {
      console.error("Search failed:", error);
      // Set empty results on error
      setSearchResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden relative">
      <Suspense fallback={<MapLoadingFallback />}>
        <MapFirstLayout
          data={searchResults}
          address={searchedAddress}
          coordinates={searchedCoordinates}
          onSearch={handleSearch}
          onPropertySelect={handlePropertySelect}
          loading={loading}
        />
      </Suspense>
    </div>
  );
}
