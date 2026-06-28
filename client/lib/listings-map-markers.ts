import { queryPropertyDetails } from "./slip-wa-api";
import { extractRCode, getZoningRequirements } from "./zoning-requirements";
import { devLog } from "./logger";

export interface Listing {
  id: string;
  address: string;
  suburb: string;
  price: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  landSize?: string;
  agentName: string;
  url: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  underOffer?: boolean;
}

/**
 * Create a color based on property type
 */
function getColorByPropertyType(propertyType: string): string {
  const typeMap: Record<string, string> = {
    house: "#3B82F6", // Blue
    unit: "#8B5CF6", // Purple
    land: "#10B981", // Green
  };
  return typeMap[propertyType.toLowerCase()] || "#6B7280"; // Gray default
}

/**
 * Create a color based on price range
 */
function getColorByPrice(price: string): string {
  // Parse price from string (e.g., "$500,000")
  const priceMatch = price.match(/\$?([\d,]+)/);
  if (!priceMatch) return "#6B7280";

  const numPrice = parseInt(priceMatch[1].replace(/,/g, ""), 10);

  if (numPrice < 400000) return "#10B981"; // Green - affordable
  if (numPrice < 700000) return "#3B82F6"; // Blue - moderate
  if (numPrice < 1000000) return "#F59E0B"; // Amber - expensive
  return "#EF4444"; // Red - very expensive
}

/**
 * Create a color based on lot yield (development potential)
 */
function getColorByLotYield(lotYield: number): string {
  if (lotYield >= 2) return "#10B981"; // Green - has development potential
  if (lotYield <= 1) return "#4B5563"; // Dark grey - no development potential (1 or less)
  return "#9CA3AF"; // Light grey - loading/uncertain
}

/**
 * Extract numeric lot size from land size string
 */
function extractLotSizeNumber(landSize?: string): number | null {
  if (!landSize) return null;
  const match = landSize.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Calculate lot yield for a property
 * Uses actual R-Code and zoning requirements from SLIP WA
 */
function calculateLotYield(
  lotSizeM2: number,
  rCode: string,
): { yield: number; rCode: string } {
  try {
    // Extract the numeric R-code
    const extractedRCode = extractRCode(rCode);
    if (!extractedRCode) {
      return { yield: 0, rCode: "Unknown" };
    }

    // Get zoning requirements for single dwellings
    const requirements = getZoningRequirements(extractedRCode, "single");
    const requirement = requirements[0];

    if (!requirement) {
      return { yield: 0, rCode: extractedRCode };
    }

    // Calculate estimated dwelling yield using average site area requirement
    const estimatedYield = Math.floor(lotSizeM2 / requirement.avgSiteArea);

    return { yield: Math.max(1, estimatedYield), rCode: extractedRCode };
  } catch (error) {
    devLog.warn("Error calculating lot yield:", error);
    return { yield: 0, rCode };
  }
}

/**
 * Fetch and format property details from SLIP WA for a coordinate
 */
async function fetchPropertyDataFromSlipWa(coordinates: {
  lat: number;
  lng: number;
}): Promise<{ rCode: string; lotSize: number; details: string } | null> {
  try {
    const propertyData = await queryPropertyDetails({
      coordinates: [coordinates.lat, coordinates.lng],
    });

    // Extract lot size as number
    let lotSizeM2 = 0;
    if (propertyData.lotSize) {
      const match = String(propertyData.lotSize).match(/(\d+(?:\.\d+)?)/);
      if (match) {
        lotSizeM2 = parseFloat(match[1]);
      }
    }

    // Get R-Code (propertyData.rCode from SLIP WA)
    const rCode = propertyData.rCode || "R30";

    return {
      rCode,
      lotSize: lotSizeM2,
      details: `Lot Size: ${propertyData.lotSize || "Unknown"}, R-Code: ${rCode}`,
    };
  } catch (error) {
    devLog.warn("Failed to fetch property details from SLIP WA:", error);
    return null;
  }
}

/**
 * Create a custom marker icon for a listing
 */
function createListingMarkerIcon(
  listing: Listing,
  colorScheme: "type" | "price" | "yield" = "type",
  lotYield?: number,
): string {
  let color: string;

  if (colorScheme === "price") {
    color = getColorByPrice(listing.price);
  } else if (colorScheme === "yield") {
    color = lotYield !== undefined ? getColorByLotYield(lotYield) : "#9CA3AF";
  } else {
    color = getColorByPropertyType(listing.propertyType);
  }

  return `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="2"/><circle cx="20" cy="20" r="12" fill="${color}"/><path d="M20 10C20 10 15 15 15 20C15 23.314 17.239 26 20 26C22.761 26 25 23.314 25 20C25 15 20 10 20 10Z" fill="white"/><circle cx="20" cy="20" r="2" fill="${color}"/></svg>`;
}

/**
 * Create a popup for a listing marker
 */
/**
 * Create popup with detailed accurate data from SLIP WA
 */
function createDetailedListingPopup(
  listing: Listing,
  propertyData: { rCode: string; lotSize: number; details: string },
): string {
  const details = [
    listing.bedrooms && `🛏️ ${listing.bedrooms} bed`,
    listing.bathrooms && `🚿 ${listing.bathrooms} bath`,
    listing.parking && `🅿️ ${listing.parking} park`,
  ].filter(Boolean);

  const yieldData = calculateLotYield(propertyData.lotSize, propertyData.rCode);

  return `
    <div class="p-3 w-72">
      ${
        listing.imageUrl
          ? `
        <div class="mb-2 rounded overflow-hidden">
          <img src="${listing.imageUrl}" alt="${listing.address}" class="w-full h-32 object-cover" onerror="this.style.display='none'">
        </div>
      `
          : ""
      }
      <h3 class="font-bold text-sm mb-1">${listing.address}</h3>
      <p class="text-xs text-gray-600 mb-2">${listing.suburb}</p>
      <div class="text-lg font-bold text-green-600 mb-2">${listing.price}</div>

      <div class="text-xs space-y-1 mb-2 bg-gray-50 p-2 rounded">
        ${details.map((d) => `<div>${d}</div>`).join("")}
        ${propertyData.lotSize ? `<div>📐 ${propertyData.lotSize}m²</div>` : ""}
      </div>

      <div class="text-xs space-y-1 mb-2 bg-green-50 border border-green-200 p-2 rounded">
        <div><strong>✅ R-Code:</strong> ${yieldData.rCode}</div>
        <div><strong>✅ Lot Yield:</strong> ${yieldData.yield} dwelling(s)</div>
        <div class="text-gray-600 text-xs mt-1">Accurate data from SLIP WA</div>
      </div>

      <div class="text-xs text-gray-500 mb-3">Agent: ${listing.agentName}</div>
      <button onclick="window.open('${listing.url}', '_blank')"
         class="w-full text-center text-xs bg-blue-600 text-white py-2 px-3 rounded hover:bg-blue-700 font-semibold cursor-pointer border-0">
        View Listing
      </button>
    </div>
  `;
}

/**
 * Create initial popup (shown before data is loaded)
 */
function createListingPopup(listing: Listing): string {
  const details = [
    listing.bedrooms && `🛏️ ${listing.bedrooms} bed`,
    listing.bathrooms && `🚿 ${listing.bathrooms} bath`,
    listing.parking && `🅿️ ${listing.parking} park`,
  ].filter(Boolean);

  return `
    <div class="p-3 w-72">
      ${
        listing.imageUrl
          ? `
        <div class="mb-2 rounded overflow-hidden">
          <img src="${listing.imageUrl}" alt="${listing.address}" class="w-full h-32 object-cover" onerror="this.style.display='none'">
        </div>
      `
          : ""
      }
      <h3 class="font-bold text-sm mb-1">${listing.address}</h3>
      <p class="text-xs text-gray-600 mb-2">${listing.suburb}</p>
      <div class="text-lg font-bold text-green-600 mb-2">${listing.price}</div>

      <div class="text-xs space-y-1 mb-2 bg-gray-50 p-2 rounded">
        ${details.map((d) => `<div>${d}</div>`).join("")}
        ${listing.landSize ? `<div>📐 ${listing.landSize}</div>` : ""}
      </div>

      <div class="text-xs space-y-1 mb-2 bg-yellow-50 border border-yellow-200 p-2 rounded">
        <div class="text-center">⏳ Loading accurate data...</div>
      </div>

      <div class="text-xs text-gray-500 mb-3">Agent: ${listing.agentName}</div>
      <button onclick="window.open('${listing.url}', '_blank')"
         class="w-full text-center text-xs bg-blue-600 text-white py-2 px-3 rounded hover:bg-blue-700 font-semibold cursor-pointer border-0">
        View Listing
      </button>
    </div>
  `;
}

/**
 * Add listings to a Leaflet map with clustering
 * Requires Leaflet.markercluster plugin to be loaded
 */
export function addListingsToMap(
  map: any,  // maplibregl.Map
  listings: Listing[],
  options: {
    colorScheme?: "type" | "price" | "yield";
    onMarkerClick?: (listing: Listing) => void;
    backgroundFetch?: boolean;
  } = {},
): any {  // returns array of maplibregl.Marker
  const { colorScheme = "type", onMarkerClick, backgroundFetch = false } = options;

  const markers: any[] = [];
  const markerMap = new Map<string, any>();

  listings.forEach((listing) => {
    if (!listing.coordinates) {
      devLog.warn(`⚠️ No coordinates for listing: ${listing.address}`);
      return;
    }

    const el = document.createElement("div");
    el.innerHTML = createListingMarkerIcon(listing, colorScheme, colorScheme === "yield" ? 1 : undefined);
    el.style.cssText = "cursor: pointer;";

    const popup = new (window as any).maplibregl.Popup({ maxWidth: "300px" })
      .setHTML(createListingPopup(listing));

    const marker = new (window as any).maplibregl.Marker({ element: el })
      .setLngLat([listing.coordinates.lng, listing.coordinates.lat])
      .setPopup(popup)
      .addTo(map);

    el.addEventListener("click", async () => {
      onMarkerClick?.(listing);
      if (listing.coordinates) {
        const propertyData = await fetchPropertyDataFromSlipWa(listing.coordinates);
        if (propertyData) {
          popup.setHTML(createDetailedListingPopup(listing, propertyData));
        }
      }
    });

    markers.push(marker);
    markerMap.set(listing.id, marker);
  });

  devLog.log(`✅ Added ${listings.length} listing markers to map`);

  if (backgroundFetch && colorScheme === "yield") {
    listings.forEach(async (listing) => {
      if (!listing.coordinates) return;
      try {
        const propertyData = await fetchPropertyDataFromSlipWa(listing.coordinates);
        if (propertyData) {
          const yieldData = calculateLotYield(propertyData.lotSize, propertyData.rCode);
          const marker = markerMap.get(listing.id);
          if (marker) {
            const el = marker.getElement();
            if (el) el.innerHTML = createListingMarkerIcon(listing, "yield", yieldData.yield);
          }
        }
      } catch (error) {
        devLog.warn(`⚠️ Failed to fetch yield data for ${listing.address}:`, error);
      }
    });
  }

  return markers;
}

/**
 * Remove listings from map
 */
export function removeListingsFromMap(
  _map: any,
  markerLayer: any,  // array of maplibregl.Marker
): void {
  if (Array.isArray(markerLayer)) {
    markerLayer.forEach((m: any) => m?.remove?.());
  }
}

/**
 * Fit map to show all listings
 */
export function fitMapToBounds(map: any, listings: Listing[]): void {
  const validListings = listings.filter((l) => l.coordinates);
  if (validListings.length === 0) return;

  const lngs = validListings.map((l) => l.coordinates!.lng);
  const lats = validListings.map((l) => l.coordinates!.lat);
  const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
  const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];

  map.fitBounds([sw, ne], { padding: 50 });
}
