import { RequestHandler } from "express";
import {
  scrapeListings,
  filterByLotSize,
  geocodeListing,
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

/**
 * Get listing details by ID
 * GET /api/listings/:id
 */
export const handleGetListing: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // In a real app, fetch from database or cache
    // For now, return a mock response
    res.json({
      error: "Not implemented",
      message: "Individual listing retrieval not yet implemented",
    });
  } catch (error) {
    res.status(500).json({
      error: "Fetch failed",
      message:
        error instanceof Error ? error.message : "Failed to fetch listing",
    });
  }
};
