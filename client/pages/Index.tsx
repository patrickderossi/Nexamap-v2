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
      zoning: propertyData.rCode || "Unknown", // This is the actual R-Code
      shire: propertyData.zoning || "Unknown Shire", // This is the shire/scheme name
      landUse: propertyData.landUse || "Unknown", // Land use classification
      bushfire: propertyData.balRating || "Unknown",
      heritage: propertyData.heritage || "Unknown",
      floodRisk: propertyData.floodRisk || "Unknown",
      soilType: propertyData.soilType || "Unknown",
      contamination: "Unknown",
      easements: "Unknown",
      coordinates: coordinates,
      boundaryLengths: propertyData.boundaryLengths,
      perimeter: propertyData.perimeter,
      interiorAngles: propertyData.interiorAngles,
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
          zoning: realPropertyData.rCode || "Unknown", // This is the actual R-Code
          shire: realPropertyData.zoning || "Unknown Shire", // This is the shire/scheme name
          landUse: realPropertyData.landUse || "Unknown", // Land use classification
          bushfire: realPropertyData.balRating || "Unknown", // Map balRating to bushfire field
          heritage: realPropertyData.heritage || "Unknown",
          floodRisk: realPropertyData.floodRisk || "Unknown",
          soilType: realPropertyData.soilType || "Unknown",
          contamination: "Unknown", // Not implemented yet
          easements: "Unknown", // Not implemented yet
          coordinates: coordinates,
          boundaryLengths: realPropertyData.boundaryLengths,
          perimeter: realPropertyData.perimeter,
          interiorAngles: realPropertyData.interiorAngles,
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
