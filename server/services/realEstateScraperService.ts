import axios from "axios";

// Zyla API Configuration
const ZYLA_API_KEY = process.env.ZYLA_API_KEY || "";
const ZYLA_API_URL =
  "https://zylalabs.com/api/7297/australian+property+insights+api/11581/get+properties+list";

console.log(`✅ Zyla API key loaded: ${ZYLA_API_KEY ? "Yes" : "No"}`);

export interface ListingFilters {
  suburb?: string;
  propertyType?: "house" | "unit" | "land";
  minLotSize?: number;
  maxLotSize?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface Listing {
  id: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  price: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  landSize?: string;
  agentName: string;
  agentPhone: string;
  url: string;
  imageUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  underOffer?: boolean;
  extractedAt: string;
}

// Simple in-memory cache to avoid excessive requests
const scrapingCache = new Map<
  string,
  { listings: Listing[]; timestamp: number }
>();
const CACHE_DURATION = 3600000; // 1 hour

/**
 * Extract price number from price display string
 */
function extractPriceNumber(priceDisplay: string): number | null {
  const match = priceDisplay.match(/\d+(?:,\d+)*/);
  if (match) {
    return parseInt(match[0].replace(/,/g, ""));
  }
  return null;
}

/**
 * Parse land size from display string
 */
function parseLandSize(landSizeObj: any): string {
  if (!landSizeObj) return "";
  if (landSizeObj.display) return landSizeObj.display;
  if (landSizeObj.displayApp) return landSizeObj.displayApp;
  return "";
}

/**
 * Map property type from Zyla API format
 */
function mapPropertyType(zylaType: string): string {
  const typeMap: Record<string, string> = {
    house: "house",
    "residential house": "house",
    unit: "unit",
    "unit apartment": "unit",
    apartment: "unit",
    land: "land",
    "residential land": "land",
    townhouse: "townhouse",
    villa: "villa",
    acreage: "acreage",
    rural: "rural",
  };

  const normalized = zylaType.toLowerCase().trim();
  return typeMap[normalized] || zylaType;
}

/**
 * Generate cache key from filters
 */
function getCacheKey(filters: ListingFilters): string {
  return `${filters.suburb}|${filters.propertyType}|${filters.minPrice}|${filters.maxPrice}`;
}

/**
 * Build Zyla API parameters from filters
 */
function buildZylaParams(
  filters: ListingFilters,
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    searchLocation: filters.suburb || "Australia",
    searchLocationSubtext: filters.suburb || "Australia",
    type: filters.suburb || "Australia",
    channel: "buy",
    pageSize: 30,
    page: 1,
    surroundingSuburbs: false,
  };

  if (filters.minPrice) {
    params.minimumPrice = filters.minPrice;
  }

  if (filters.maxPrice) {
    params.maximumPrice = filters.maxPrice;
  }

  if (filters.propertyType) {
    const typeMap: Record<string, string> = {
      house: "house",
      unit: "unit|apartment",
      land: "land",
    };
    params.propertyTypes =
      typeMap[filters.propertyType] || filters.propertyType;
  }

  return params;
}

/**
 * Fetch listings from Zyla API
 */
async function fetchFromZylaAPI(filters: ListingFilters): Promise<Listing[]> {
  if (!ZYLA_API_KEY) {
    throw new Error("ZYLA_API_KEY not configured");
  }

  try {
    const params = buildZylaParams(filters);

    console.log(`🔄 Fetching from Zyla API with params:`, params);

    const response = await axios.get(ZYLA_API_URL, {
      params,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${ZYLA_API_KEY}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const data = response.data;

    if (!data || !data.tieredResults) {
      console.warn("⚠️ Unexpected Zyla API response structure");
      return [];
    }

    const listings: Listing[] = [];

    // Process tiered results
    for (const tier of data.tieredResults) {
      if (!tier.results || !Array.isArray(tier.results)) {
        continue;
      }

      let listingCount = 0;
      for (const result of tier.results) {
        try {
          listingCount++;
          const address = result.address?.streetAddress || result.title || "";
          const suburb =
            result.address?.suburb ||
            result.address?.locality ||
            filters.suburb ||
            "Unknown";
          const state = result.address?.state || "Unknown";
          const postcode = result.address?.postcode || "";
          const price = result.price?.display || "Price on request";
          const propertyType = mapPropertyType(result.propertyType || "house");

          // Log API response structure for first few listings
          if (listingCount <= 2) {
            console.log(
              `🔍 Zyla API Response Structure - Listing ${listingCount}:`,
              {
                address,
                price,
                hasStatus: !!result.status,
                hasListingStatus: !!result.listingStatus,
                hasSaleStatus: !!result.saleStatus,
                hasOfferStatus: !!result.offerStatus,
                allKeys: Object.keys(result).slice(0, 10),
              },
            );
          }

          // Extract coordinates if available
          const coordinates = result.address?.location
            ? {
                lat: result.address.location.latitude,
                lng: result.address.location.longitude,
              }
            : undefined;

          // Detect if property is under offer
          const priceStr = price.toLowerCase();
          const descriptionStr = result.description?.toLowerCase() || "";
          const titleStr = result.title?.toLowerCase() || "";

          // Check status object (Zyla API returns { label: string, type: string })
          const statusLabel = result.status?.label?.toLowerCase() || "";
          const statusType = result.status?.type?.toLowerCase() || "";
          const statusStr = (result.listingStatus || result.saleStatus || "")
            .toString()
            .toLowerCase();

          // Check if property is under offer using status object
          const underOffer =
            // Check status object structure (Zyla API format)
            statusLabel.includes("under offer") ||
            statusLabel.includes("offer accepted") ||
            statusType === "under_offer" ||
            statusType.includes("offer") ||
            // Also check price string
            priceStr.includes("under offer") ||
            priceStr.includes("offer accepted") ||
            priceStr.includes("under contract") ||
            priceStr.includes("sale agreed") ||
            // Check description
            descriptionStr.includes("under offer") ||
            descriptionStr.includes("offer accepted") ||
            descriptionStr.includes("under contract") ||
            descriptionStr.includes("sale agreed") ||
            // Check title
            titleStr.includes("under offer") ||
            // Check other status fields
            statusStr.includes("under offer") ||
            statusStr.includes("offer accepted") ||
            statusStr.includes("under contract") ||
            statusStr.includes("sale agreed") ||
            statusStr.includes("pending") ||
            statusStr === "offerlodged" ||
            statusStr === "offerpending";

          const listing: Listing = {
            id:
              result.listingId ||
              `${address}-${Date.now()}`.replace(/\s+/g, "-"),
            address,
            suburb,
            state,
            postcode,
            price,
            propertyType,
            bedrooms: result.features?.general?.bedrooms || undefined,
            bathrooms: result.features?.general?.bathrooms || undefined,
            parking: result.features?.general?.parkingSpaces || undefined,
            landSize: parseLandSize(result.landSize),
            agentName:
              result.lister?.name || result.agency?.name || "Unknown Agent",
            agentPhone:
              result.lister?.phoneNumber ||
              result.lister?.mobilePhoneNumber ||
              "",
            url: `https://www.realestate.com.au/property-${result.listingId}`,
            imageUrl: result.mainImage
              ? `${result.mainImage.server}/800x600${result.mainImage.uri}`
              : result.images?.[0]
                ? `${result.images[0].server}/800x600${result.images[0].uri}`
                : undefined,
            coordinates,
            underOffer: underOffer || undefined,
            extractedAt: new Date().toISOString(),
          };

          // Log underOffer detection for debugging
          if (underOffer) {
            console.log(`🔴 UNDER OFFER: ${address}`);
          }

          listings.push(listing);
        } catch (error) {
          console.warn(`⚠️ Error parsing listing:`, error);
        }
      }
    }

    const underOfferCount = listings.filter((l) => l.underOffer).length;
    console.log(
      `✅ Successfully fetched ${listings.length} listings from Zyla API`,
    );
    console.log(`📊 Under offer listings detected: ${underOfferCount}`);
    return listings;
  } catch (error) {
    console.error("❌ Zyla API error:", error);
    throw error;
  }
}

/**
 * Scrape listings from Zyla API with caching and retry logic
 */
export async function scrapeListings(
  filters: ListingFilters,
): Promise<Listing[]> {
  const cacheKey = getCacheKey(filters);

  // Check cache first
  const cached = scrapingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`📦 Returning cached listings for ${filters.suburb}`);
    return cached.listings;
  }

  try {
    console.log(`🏠 Scraping listings from Zyla API for: ${filters.suburb}`);

    let lastError: Error | null = null;

    // Retry logic (up to 3 attempts)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`⏳ Retry attempt ${attempt}, waiting ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const listings = await fetchFromZylaAPI(filters);

        // Cache the results
        scrapingCache.set(cacheKey, {
          listings: listings.slice(0, 50),
          timestamp: Date.now(),
        });

        return listings.slice(0, 50);
      } catch (error) {
        lastError = error as Error;

        if (attempt < 3) {
          console.warn(
            `⚠️ Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}. Retrying...`,
          );
        }
      }
    }

    // All retries failed
    throw (
      lastError ||
      new Error("Failed to fetch listings after all retry attempts")
    );
  } catch (error) {
    console.error("❌ Scraping error:", error);
    throw error;
  }
}

export interface PropertyValuationResult {
  estimatedValue: { low: number; mid: number; high: number };
  pricePerSqm: { low: number; median: number; high: number };
  comparableCount: number;
  comparables: Array<{
    address: string;
    price: number;
    landSize: number;
    pricePerSqm: number;
  }>;
  suburb: string;
}

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export async function estimatePropertyValue(
  suburb: string,
  lotSize: number,
): Promise<PropertyValuationResult> {
  const listings = await scrapeListings({ suburb });

  const comparables: Array<{
    address: string;
    price: number;
    landSize: number;
    pricePerSqm: number;
  }> = [];

  for (const listing of listings) {
    const price = extractPriceNumber(listing.price);
    if (!price || price < 50000) continue;

    let landSizeNum = 0;
    if (listing.landSize) {
      const sanitized = listing.landSize.replace(/,/g, "");
      const match = sanitized.match(/(\d+(?:\.\d+)?)/);
      if (match) landSizeNum = parseFloat(match[1]);
    }
    if (landSizeNum < 50) continue;

    comparables.push({
      address: listing.address,
      price,
      landSize: landSizeNum,
      pricePerSqm: Math.round(price / landSizeNum),
    });
  }

  if (comparables.length === 0) {
    return {
      estimatedValue: { low: 0, mid: 0, high: 0 },
      pricePerSqm: { low: 0, median: 0, high: 0 },
      comparableCount: 0,
      comparables: [],
      suburb,
    };
  }

  const ppsqmValues = comparables
    .map((c) => c.pricePerSqm)
    .sort((a, b) => a - b);

  const low = percentile(ppsqmValues, 15);
  const median = percentile(ppsqmValues, 50);
  const high = percentile(ppsqmValues, 85);

  comparables.sort(
    (a, b) =>
      Math.abs(a.landSize - lotSize) - Math.abs(b.landSize - lotSize),
  );

  return {
    estimatedValue: {
      low: Math.round(low * lotSize),
      mid: Math.round(median * lotSize),
      high: Math.round(high * lotSize),
    },
    pricePerSqm: {
      low: Math.round(low),
      median: Math.round(median),
      high: Math.round(high),
    },
    comparableCount: comparables.length,
    comparables: comparables.slice(0, 10),
    suburb,
  };
}

/**
 * Filter listings by size range (if available)
 */
export function filterByLotSize(
  listings: Listing[],
  minSize?: number,
  maxSize?: number,
): Listing[] {
  if (!minSize && !maxSize) return listings;

  return listings.filter((listing) => {
    if (!listing.landSize) return true;

    const sanitized = listing.landSize.replace(/,/g, "");
    const sizeMatch = sanitized.match(/(\d+(?:\.\d+)?)/);
    if (!sizeMatch) return true;

    const size = parseFloat(sizeMatch[1]);

    if (minSize && size < minSize) return false;
    if (maxSize && size > maxSize) return false;

    return true;
  });
}

/**
 * Mock geocoding for listings (convert suburb to coordinates)
 * In production, use Google Maps API or similar
 */
export async function geocodeListing(listing: Listing): Promise<Listing> {
  try {
    // If coordinates already available from API, use them
    if (listing.coordinates) {
      return listing;
    }

    // For demo, generate approximate coordinates based on suburb
    const suburbCoords: Record<string, [number, number]> = {
      ballajura: [-31.9834, 115.9373],
      perth: [-31.9505, 115.8605],
      fremantle: [-32.0543, 115.7436],
      cottesloe: [-31.9966, 115.7606],
      nedlands: [-31.9827, 115.8136],
      claremont: [-31.9797, 115.7926],
      dalkeith: [-31.9997, 115.8226],
      subiaco: [-31.9799, 115.8206],
      mosman: [-32.0199, 115.8606],
      townsville: [-19.2643, 146.8118],
      nome: [-19.3776, 146.9271],
      bushland: [-19.2059, 146.6768],
    };

    const suburbKey = listing.suburb.toLowerCase().replace(/\s+/g, "");
    const coords = suburbCoords[suburbKey];

    if (coords) {
      listing.coordinates = {
        lat: coords[0],
        lng: coords[1],
      };
    }

    return listing;
  } catch (error) {
    console.warn(`⚠️ Geocoding failed for ${listing.address}:`, error);
    return listing;
  }
}
