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

/**
 * Fetch the property value estimate scraped from property.com.au (headless
 * browser on the server). Needs the full street address + suburb.
 */
export async function fetchPropertyEstimate(
  address: string,
  suburb: string,
): Promise<PropertyValuation> {
  const params = new URLSearchParams({ address, suburb });
  devLog.log(`🏷️ Fetching property.com.au estimate for ${address}, ${suburb}`);

  const response = await fetch(`/api/listings/property-estimate?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Estimate failed (${response.status})`);
  }
  const data = await response.json();
  devLog.log(`🏷️ property.com.au estimate:`, data);
  return data;
}

/**
 * Build a property.com.au URL deterministically from the address — no API, no
 * key, no scraping. property.com.au pages are slugged
 * `/<state>/<suburb>-<postcode>/<street-slug>/<number>-pid-<id>/`. We can't know
 * the `-pid-` id without a lookup, so we link to the street page (the parent of
 * every property on it), which lists the houses and their estimates. Falls back
 * to the suburb page if there's no street, and returns null if we have nothing.
 */
export function buildPropertyComAuUrl(
  address?: string | null,
  suburb?: string | null,
  postcode?: string | number | null,
  state: string = "wa",
): string | null {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const suburbName = (suburb || "").trim();
  if (!suburbName) return null;
  const pc = postcode ? String(postcode).trim().replace(/[^\d]/g, "") : "";
  const suburbSlug = slug(suburbName) + (pc ? `-${pc}` : "");
  const base = `https://www.property.com.au/${slug(state)}/${suburbSlug}`;

  // Strip a leading street number ("7 " / "7A " / "7-9 ") to get the street name.
  const street = (address || "").replace(/^\s*\d+[a-z]?(?:-\d+[a-z]?)?\s+/i, "").trim();
  return street ? `${base}/${slug(street)}/` : `${base}/`;
}

/**
 * Resolve the property.com.au page URL for an address (no estimate scrape).
 * Used to open the live property.com.au estimate page directly.
 */
export async function fetchPropertyUrl(
  address: string,
  suburb: string,
): Promise<string | null> {
  const params = new URLSearchParams({ address, suburb });
  devLog.log(`🔗 Resolving property.com.au URL for ${address}, ${suburb}`);

  const response = await fetch(`/api/listings/property-url?${params}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || `URL lookup failed (${response.status})`);
  }
  const data = await response.json();
  return data.url ?? null;
}
