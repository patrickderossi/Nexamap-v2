import { RequestHandler } from "express";
import {
  scrapeListings,
  filterByLotSize,
  geocodeListing,
  estimatePropertyValue,
  ListingFilters,
  Listing,
} from "../services/realEstateScraperService";

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
    const { suburb, lotSize } = req.query as { suburb?: string; lotSize?: string };

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

    console.log(`💰 Estimating property value: ${suburb}, ${lotSizeNum}m²`);

    const result = await estimatePropertyValue(suburb.toString(), lotSizeNum);

    console.log(`💰 Valuation: ${result.comparableCount} comparables, median $${result.pricePerSqm.median}/m²`);

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

