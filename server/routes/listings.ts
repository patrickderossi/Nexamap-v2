import { RequestHandler } from "express";
import {
  scrapeListings,
  filterByLotSize,
  geocodeListing,
  estimatePropertyValue,
  lookupPropertyDetails,
  ListingFilters,
  Listing,
} from "../services/realEstateScraperService";
import { scrapePropertyEstimate, resolvePropertyComAuUrl } from "../services/propertyEstimateService";

/**
 * Resolve the property.com.au page URL for an address (no estimate scrape).
 * GET /api/listings/property-url?address=2 Giles Pl&suburb=Mirrabooka
 */
export const handlePropertyUrl: RequestHandler = async (req, res) => {
  try {
    const { address, suburb } = req.query as { address?: string; suburb?: string };
    if (!address || !suburb) {
      return res.status(400).json({ error: "address and suburb are required" });
    }
    const url = await resolvePropertyComAuUrl(address.toString(), suburb.toString());
    if (!url) {
      return res.status(404).json({ error: "property.com.au doesn't have a page for this address" });
    }
    res.json({ url });
  } catch (error) {
    console.error("❌ property.com.au URL resolve error:", error);
    const msg = error instanceof Error ? error.message : "URL resolve failed";
    const needsKey = /SCRAPINGBEE_API_KEY/i.test(msg);
    res.status(needsKey ? 503 : 500).json({
      error: needsKey ? "Estimate service not configured (missing ScrapingBee key)" : "Could not resolve property.com.au URL",
      message: msg,
    });
  }
};

/**
 * Property value estimate scraped from property.com.au (via ScrapingBee).
 * GET /api/listings/property-estimate?address=29 Hampton Rd&suburb=Menora
 */
export const handlePropertyEstimate: RequestHandler = async (req, res) => {
  try {
    const { address, suburb } = req.query as { address?: string; suburb?: string };
    if (!address || !suburb) {
      return res.status(400).json({ error: "address and suburb are required" });
    }
    console.log(`🏷️ property.com.au estimate for: ${address}, ${suburb}`);

    const result = await scrapePropertyEstimate(address.toString(), suburb.toString());
    if (!result) {
      return res.status(404).json({ error: "property.com.au doesn't have a value estimate for this address" });
    }
    res.json(result);
  } catch (error) {
    console.error("❌ property.com.au estimate error:", error);
    const msg = error instanceof Error ? error.message : "Estimate scrape failed";
    const needsKey = /SCRAPINGBEE_API_KEY/i.test(msg);
    res.status(needsKey ? 503 : 500).json({
      error: needsKey ? "Estimate service not configured (missing ScrapingBee key)" : "Estimate failed",
      message: msg,
    });
  }
};

interface SearchQuery {
  suburb?: string;
  propertyType?: "house" | "unit" | "land";
  minLotSize?: string;
  maxLotSize?: string;
  minPrice?: string;
  maxPrice?: string;
}

/**
 * Search for real estate listings
 * GET /api/listings/search?suburb=Perth&propertyType=house&minPrice=500000
 */
export const handlePropertyValuation: RequestHandler = async (req, res) => {
  try {
    const { suburb, lotSize, bedrooms, bathrooms } = req.query as {
      suburb?: string;
      lotSize?: string;
      bedrooms?: string;
      bathrooms?: string;
    };

    if (!suburb || !lotSize) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "suburb and lotSize parameters are required",
      });
    }

    const lotSizeNum = parseFloat(lotSize);
    if (isNaN(lotSizeNum) || lotSizeNum <= 0) {
      return res.status(400).json({
        error: "Invalid lotSize",
        message: "lotSize must be a positive number (in sqm)",
      });
    }

    const bedroomsNum = bedrooms ? parseInt(bedrooms) : undefined;
    const bathroomsNum = bathrooms ? parseInt(bathrooms) : undefined;

    console.log(`💰 Estimating property value: ${suburb}, ${lotSizeNum}m², ${bedroomsNum || '?'} bed, ${bathroomsNum || '?'} bath`);

    const result = await estimatePropertyValue(
      suburb.toString(),
      lotSizeNum,
      bedroomsNum,
      bathroomsNum,
    );

    console.log(`💰 Valuation: ${result.comparableCount} comps, ${result.confidence} confidence, estimate $${result.estimatedValue.mid}`);

    res.json(result);
  } catch (error) {
    console.error("❌ Property valuation error:", error);
    res.status(500).json({
      error: "Valuation failed",
      message: error instanceof Error ? error.message : "Failed to estimate property value",
    });
  }
};

export const handleListingsSearch: RequestHandler = async (req, res) => {
  try {
    const { suburb, propertyType, minLotSize, maxLotSize, minPrice, maxPrice } =
      req.query as SearchQuery;

    // Validate required filters
    if (!suburb) {
      return res.status(400).json({
        error: "Missing required parameter",
        message: "suburb parameter is required",
      });
    }

    console.log(`🏠 Searching listings:`, {
      suburb,
      propertyType,
      minLotSize,
      maxLotSize,
      minPrice,
      maxPrice,
    });

    // Build filters object
    const filters: ListingFilters = {
      suburb: suburb.toString(),
      propertyType: (propertyType as any) || undefined,
      minLotSize: minLotSize ? parseFloat(minLotSize) : undefined,
      maxLotSize: maxLotSize ? parseFloat(maxLotSize) : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    };

    // Scrape listings
    let listings = await scrapeListings(filters);

    // Apply lot size filter
    if (minLotSize || maxLotSize) {
      listings = filterByLotSize(
        listings,
        parseFloat(minLotSize || "0"),
        maxLotSize ? parseFloat(maxLotSize) : undefined,
      );
    }

    // Geocode all listings (add coordinates)
    listings = await Promise.all(listings.map(geocodeListing));

    console.log(`✅ Returning ${listings.length} listings`);

    res.json({
      success: true,
      count: listings.length,
      listings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Listings search error:", error);

    res.status(500).json({
      error: "Search failed",
      message:
        error instanceof Error ? error.message : "Failed to search listings",
    });
  }
};

export const handlePropertyLookup: RequestHandler = async (req, res) => {
  try {
    const { address, suburb } = req.query as {
      address?: string;
      suburb?: string;
    };

    if (!address || !suburb) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "address and suburb parameters are required",
      });
    }

    console.log(`🔍 Property lookup request: "${address}" in ${suburb}`);

    const result = await lookupPropertyDetails(address.toString(), suburb.toString());

    res.json(result);
  } catch (error) {
    console.error("❌ Property lookup error:", error);
    res.status(500).json({
      found: false,
      error: "Lookup failed",
      message: error instanceof Error ? error.message : "Failed to look up property",
    });
  }
};

