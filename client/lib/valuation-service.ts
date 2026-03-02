import type { PropertyValuation } from "../../shared/types";
import { devLog } from "./logger";

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

export async function lookupPropertyDetails(
  address: string,
  suburb: string,
): Promise<PropertyLookupResult> {
  const params = new URLSearchParams({ address, suburb });

  devLog.log(`🔍 Looking up property: "${address}" in ${suburb}`);

  const response = await fetch(`/api/listings/property-lookup?${params}`);

  if (!response.ok) {
    devLog.error(`Property lookup failed: ${response.status}`);
    return { found: false };
  }

  const data = await response.json();
  devLog.log(`🔍 Property lookup result:`, data);
  return data;
}

export async function fetchPropertyValuation(
  suburb: string,
  lotSize: number,
  bedrooms?: number,
  bathrooms?: number,
): Promise<PropertyValuation> {
  const params = new URLSearchParams({
    suburb,
    lotSize: lotSize.toString(),
  });

  if (bedrooms !== undefined && bedrooms > 0) {
    params.set("bedrooms", bedrooms.toString());
  }
  if (bathrooms !== undefined && bathrooms > 0) {
    params.set("bathrooms", bathrooms.toString());
  }

  devLog.log(`💰 Fetching property valuation for ${suburb}, ${lotSize}m²`);

  const response = await fetch(`/api/listings/estimate?${params}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Valuation request failed (${response.status})`,
    );
  }

  const data = await response.json();
  devLog.log(`💰 Valuation result:`, data);
  return data;
}
