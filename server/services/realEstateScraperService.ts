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
  channel?: "buy" | "sold";
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
  return `${filters.suburb}|${filters.propertyType}|${filters.minPrice}|${filters.maxPrice}|${filters.channel || "buy"}`;
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
    channel: filters.channel || "buy",
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
    bedrooms?: number;
    bathrooms?: number;
    parking?: number;
    propertyType?: string;
    adjustedPrice?: number;
    similarityScore?: number;
  }>;
  suburb: string;
  confidence?: string;
  confidenceScore?: number;
  channel?: string;
}

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function calculateWeightedMedian(
  comparables: Array<{ adjustedPrice: number; similarityScore: number }>,
): number {
  const sorted = [...comparables].sort(
    (a, b) => a.adjustedPrice - b.adjustedPrice,
  );
  const totalWeight = sorted.reduce((sum, c) => sum + c.similarityScore, 0);
  const halfWeight = totalWeight / 2;

  let cumulativeWeight = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulativeWeight += sorted[i].similarityScore;
    if (cumulativeWeight >= halfWeight) {
      if (
        cumulativeWeight === halfWeight &&
        i < sorted.length - 1
      ) {
        return Math.round(
          (sorted[i].adjustedPrice + sorted[i + 1].adjustedPrice) / 2,
        );
      }
      return Math.round(sorted[i].adjustedPrice);
    }
  }
  return Math.round(sorted[Math.floor(sorted.length / 2)].adjustedPrice);
}

function getLandValuePerSqm(suburb: string): number {
  const s = suburb.toLowerCase().trim();

  const innerSuburbs = [
    "south perth", "subiaco", "leederville", "mount lawley", "nedlands",
    "claremont", "cottesloe", "mosman park", "peppermint grove", "north perth",
    "highgate", "west perth", "east perth", "perth", "northbridge",
    "victoria park", "como", "applecross", "ardross", "mt lawley", "maylands",
  ];

  const midTierSuburbs = [
    "floreat", "wembley", "cambridge", "osborne park", "scarborough",
    "doubleview", "churchlands", "karrinyup", "stirling", "joondanna",
    "dianella", "morley", "bayswater", "bassendean", "embleton",
    "willetton", "riverton", "shelley", "rossmoyne", "bateman",
    "bull creek", "leeming", "kardinya", "murdoch", "winthrop",
    "booragoon", "melville", "bicton", "palmyra", "hilton",
    "white gum valley", "beaconsfield", "fremantle", "hamilton hill",
    "coolbellup", "spearwood", "coogee", "south beach", "north beach",
    "watermans bay", "sorrento", "hillarys", "padbury", "craigie",
    "beldon", "greenwood", "duncraig", "warwick", "city beach",
    "trigg", "joondalup", "south fremantle",
  ];

  if (innerSuburbs.includes(s)) return 600;
  if (midTierSuburbs.includes(s)) return 400;
  return 250;
}

export interface PropertyLookupResult {
  found: boolean;
  source?: "buy" | "sold";
  address?: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  landSize?: string;
  propertyType?: string;
  price?: string;
  imageUrl?: string;
}

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(place|pl)\b/g, "pl")
    .replace(/\b(court|ct)\b/g, "ct")
    .replace(/\b(crescent|cres|cr)\b/g, "cr")
    .replace(/\b(boulevard|blvd)\b/g, "blvd")
    .replace(/\b(terrace|tce)\b/g, "tce")
    .replace(/\b(close|cl)\b/g, "cl")
    .replace(/\b(lane|ln)\b/g, "ln")
    .replace(/\b(way)\b/g, "way")
    .replace(/\b(circuit|cct)\b/g, "cct")
    .replace(/\b(parade|pde)\b/g, "pde")
    .replace(/\b(grove|gr)\b/g, "gr")
    .replace(/\b(highway|hwy)\b/g, "hwy")
    .replace(/\b(mews)\b/g, "mews")
    .replace(/\b(ramble)\b/g, "ramble")
    .replace(/\b(gardens|gdns)\b/g, "gdns")
    .replace(/\b(hill)\b/g, "hill")
    .replace(/[,.']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStreetNumber(addr: string): string {
  const unitMatch = addr.match(/^(?:unit\s+)?(\d+)\s*\/\s*(\d+[a-z]?)\s/i);
  if (unitMatch) return unitMatch[2].toLowerCase();

  const match = addr.match(/^(\d+[a-z]?)\s/i);
  return match ? match[1].toLowerCase() : "";
}

function extractUnitNumber(addr: string): string {
  const unitSlash = addr.match(/^(?:unit\s+)?(\d+)\s*\/\s*\d+/i);
  if (unitSlash) return unitSlash[1];

  const unitPrefix = addr.match(/^unit\s+(\d+)/i);
  if (unitPrefix) return unitPrefix[1];

  return "";
}

function extractStreetName(addr: string): string {
  const normalized = normalizeAddress(addr);
  let cleaned = normalized
    .replace(/^(?:unit\s+)?\d+\s*\/\s*/, "")
    .replace(/^\d+[a-z]?\s+/, "");
  cleaned = cleaned.replace(/\s+(st|rd|ave|dr|pl|ct|cr|blvd|tce|cl|ln|way|cct|pde|gr|hwy|mews|ramble|gdns|hill)$/, "");
  return cleaned.trim();
}

function matchesAddress(
  listingAddr: string,
  targetNumber: string,
  targetStreet: string,
  targetUnit: string,
): boolean {
  const listingNorm = normalizeAddress(listingAddr);
  const listingNumber = extractStreetNumber(listingNorm);
  const listingStreet = extractStreetName(listingNorm);
  const listingUnit = extractUnitNumber(listingNorm);

  if (listingStreet !== targetStreet) return false;

  if (listingNumber === targetNumber) {
    if (targetUnit && listingUnit) {
      return listingUnit === targetUnit;
    }
    if (!targetUnit && !listingUnit) return true;
    if (!targetUnit || !listingUnit) return true;
  }

  if (targetNumber && listingNorm.includes(targetNumber) && !targetUnit && !listingUnit) {
    return true;
  }

  return false;
}

export async function lookupPropertyDetails(
  address: string,
  suburb: string,
): Promise<PropertyLookupResult> {
  const normalizedAddr = normalizeAddress(address);
  const targetNumber = extractStreetNumber(normalizedAddr);
  const targetStreet = extractStreetName(normalizedAddr);
  const targetUnit = extractUnitNumber(normalizedAddr);

  console.log(`🔍 Property lookup: "${address}" in ${suburb} → number="${targetNumber}" street="${targetStreet}" unit="${targetUnit}"`);

  for (const channel of ["buy", "sold"] as const) {
    try {
      const listings = await scrapeListings({ suburb, channel });
      console.log(`🔍 Searching ${listings.length} ${channel} listings for match...`);

      for (const listing of listings) {
        if (matchesAddress(listing.address, targetNumber, targetStreet, targetUnit)) {
          console.log(`✅ Property match found in ${channel} listings: "${listing.address}"`);
          return {
            found: true,
            source: channel,
            address: listing.address,
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms,
            parking: listing.parking,
            landSize: listing.landSize,
            propertyType: listing.propertyType,
            price: listing.price,
            imageUrl: listing.imageUrl,
          };
        }
      }
    } catch (err) {
      console.error(`❌ Error searching ${channel} listings:`, err);
    }
  }

  console.log(`❌ No match found for "${address}" in ${suburb}`);
  return { found: false };
}

function medianOfArray(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function estimatePropertyValue(
  suburb: string,
  lotSize: number,
  targetBedrooms?: number,
  targetBathrooms?: number,
): Promise<PropertyValuationResult> {
  const listings = await scrapeListings({ suburb, channel: "sold" });

  console.log(
    `💰 Sold comps: fetched ${listings.length} sold listings for ${suburb}`,
  );

  const rawComparables: Array<{
    address: string;
    price: number;
    landSize: number;
    pricePerSqm: number;
    bedrooms: number;
    bathrooms: number;
    parking: number;
    propertyType: string;
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

    rawComparables.push({
      address: listing.address,
      price,
      landSize: landSizeNum,
      pricePerSqm: Math.round(price / landSizeNum),
      bedrooms: listing.bedrooms || 0,
      bathrooms: listing.bathrooms || 0,
      parking: listing.parking || 0,
      propertyType: listing.propertyType,
    });
  }

  if (rawComparables.length === 0) {
    return {
      estimatedValue: { low: 0, mid: 0, high: 0 },
      pricePerSqm: { low: 0, median: 0, high: 0 },
      comparableCount: 0,
      comparables: [],
      suburb,
      confidence: "None",
      confidenceScore: 0,
      channel: "sold",
    };
  }

  const LAND_VALUE_PER_SQM = getLandValuePerSqm(suburb);
  console.log(`💰 Using land value rate: $${LAND_VALUE_PER_SQM}/m² for ${suburb}`);

  const effectiveBedrooms = targetBedrooms ||
    medianOfArray(rawComparables.filter((c) => c.bedrooms > 0).map((c) => c.bedrooms));
  const effectiveBathrooms = targetBathrooms ||
    medianOfArray(rawComparables.filter((c) => c.bathrooms > 0).map((c) => c.bathrooms));

  console.log(
    `💰 Target profile: ${effectiveBedrooms} bed, ${effectiveBathrooms} bath, ${lotSize}m² (beds/baths ${targetBedrooms ? "from user" : "inferred from median"})`,
  );

  const adjustedComparables = rawComparables.map((comp) => {
    let adjustedPrice = comp.price;
    let similarityScore = 100;

    const compBeds = comp.bedrooms || 0;
    const compBaths = comp.bathrooms || 0;
    const compLand = comp.landSize || 0;

    const bedroomDiff = effectiveBedrooms - compBeds;
    if (compBeds > 0 && bedroomDiff !== 0) {
      const BEDROOM_PERCENT = 0.08;
      const bedroomAdjustment = adjustedPrice * bedroomDiff * BEDROOM_PERCENT;
      adjustedPrice += bedroomAdjustment;
      similarityScore -= Math.abs(bedroomDiff) * 30;
    }

    const bathroomDiff = effectiveBathrooms - compBaths;
    if (compBaths > 0 && bathroomDiff !== 0) {
      const BATHROOM_PERCENT = 0.05;
      const bathroomAdjustment = adjustedPrice * bathroomDiff * BATHROOM_PERCENT;
      adjustedPrice += bathroomAdjustment;
      similarityScore -= Math.abs(bathroomDiff) * 5;
    }

    if (compBeds > 0 && bedroomDiff === 0 && compBaths > 0 && bathroomDiff === 0) {
      similarityScore += 50;
    } else if (compBeds > 0 && bedroomDiff === 0) {
      similarityScore += 30;
    }

    if (compLand > 0 && lotSize > 0) {
      const landDiff = lotSize - compLand;
      adjustedPrice += landDiff * LAND_VALUE_PER_SQM;

      const landDiffPercent = Math.abs(landDiff) / lotSize;
      if (landDiffPercent > 0.5) {
        similarityScore -= 40;
      } else if (landDiffPercent > 0.3) {
        similarityScore -= 25;
      } else if (landDiffPercent > 0.15) {
        similarityScore -= 15;
      } else {
        similarityScore -= Math.round(landDiffPercent * 50);
      }

      if (landDiffPercent <= 0.1) {
        similarityScore += 15;
      }
    }

    const compParking = comp.parking || 0;
    if (compParking === 0 && effectiveBedrooms >= 3) {
      similarityScore -= 10;
    } else if (compParking >= 2) {
      similarityScore += 5;
    }

    similarityScore = Math.max(0, Math.min(170, similarityScore));

    if (isNaN(adjustedPrice) || adjustedPrice <= 0) {
      adjustedPrice = comp.price;
      similarityScore = 50;
    }

    return {
      ...comp,
      adjustedPrice: Math.round(adjustedPrice),
      similarityScore: Math.round(similarityScore),
    };
  });

  const validComparables = adjustedComparables.filter(
    (c) =>
      !isNaN(c.adjustedPrice) &&
      !isNaN(c.similarityScore) &&
      c.adjustedPrice > 0 &&
      c.similarityScore >= 0,
  );

  validComparables.sort((a, b) => b.similarityScore - a.similarityScore);

  const topComparables = validComparables.slice(
    0,
    Math.min(15, validComparables.length),
  );

  const estimatedValue = calculateWeightedMedian(topComparables);

  const countScore = Math.min(topComparables.length / 15, 1.0);

  const avgSimilarity =
    topComparables.reduce((sum, c) => sum + c.similarityScore, 0) /
    topComparables.length;
  const similarityScoreNorm = Math.min(avgSimilarity / 140, 1.0);

  const prices = topComparables.map((c) => c.adjustedPrice);
  const avgPrice =
    prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance =
    prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) /
    prices.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / avgPrice;
  const consistencyScore = Math.max(
    0,
    1 - coefficientOfVariation / 0.15,
  );

  const confidenceScoreValue =
    countScore * 0.3 +
    similarityScoreNorm * 0.4 +
    consistencyScore * 0.3;

  let confidenceLevel: string;
  let confidencePercent: number;
  if (confidenceScoreValue >= 0.8) {
    confidenceLevel = "Very High";
    confidencePercent = 4;
  } else if (confidenceScoreValue >= 0.65) {
    confidenceLevel = "High";
    confidencePercent = 6;
  } else if (confidenceScoreValue >= 0.5) {
    confidenceLevel = "Medium";
    confidencePercent = 8;
  } else if (confidenceScoreValue >= 0.35) {
    confidenceLevel = "Low";
    confidencePercent = 12;
  } else {
    confidenceLevel = "Very Low";
    confidencePercent = 15;
  }

  const confidenceRange = Math.round(
    estimatedValue * (confidencePercent / 100),
  );

  const ppsqmValues = topComparables
    .map((c) => c.adjustedPrice / lotSize)
    .sort((a, b) => a - b);

  const ppsqmLow = Math.round(percentile(ppsqmValues, 15));
  const ppsqmMedian = Math.round(percentile(ppsqmValues, 50));
  const ppsqmHigh = Math.round(percentile(ppsqmValues, 85));

  console.log(
    `💰 Valuation result: ${confidenceLevel} confidence (${(confidenceScoreValue * 100).toFixed(0)}%), estimate $${estimatedValue}, ${topComparables.length} comps`,
  );
  console.log(
    `💰 Top 3 comps: ${topComparables.slice(0, 3).map((c) => `${c.address} (${c.bedrooms}bed/${c.bathrooms}bath/${c.landSize}m² sold:$${c.price} adj:$${c.adjustedPrice} sim:${c.similarityScore})`).join(" | ")}`,
  );

  return {
    estimatedValue: {
      low: estimatedValue - confidenceRange,
      mid: estimatedValue,
      high: estimatedValue + confidenceRange,
    },
    pricePerSqm: {
      low: ppsqmLow,
      median: ppsqmMedian,
      high: ppsqmHigh,
    },
    comparableCount: topComparables.length,
    comparables: topComparables.slice(0, 10),
    suburb,
    confidence: confidenceLevel,
    confidenceScore: Math.round(confidenceScoreValue * 100),
    channel: "sold",
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
