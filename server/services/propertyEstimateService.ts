// ---------------------------------------------------------------------------
// property.com.au estimate scraper — via ScrapingBee.
//
// property.com.au (REA Group) hard-blocks plain fetches and even datacenter
// headless browsers (HTTP 429 / reCAPTCHA). ScrapingBee's stealth residential
// proxy gets through. Flow:
//   1. ScrapingBee Google Search → resolve the address to its `-pid-` URL.
//   2. ScrapingBee stealth fetch of that page → parse the PropTrack estimate
//      from the rendered `data-testid="valuation-sub-brick-*"` elements.
//
// Needs SCRAPINGBEE_API_KEY in the environment. Each estimate costs ~2 calls;
// results are cached for an hour to conserve credits.
// ---------------------------------------------------------------------------

import * as cheerio from "cheerio";

const SB_KEY = process.env.SCRAPINGBEE_API_KEY || "";
const SB_BASE = "https://app.scrapingbee.com/api/v1";

export interface PropertyEstimate {
  estimatedValue: { low: number; mid: number; high: number };
  pricePerSqm: { low: number; median: number; high: number };
  comparableCount: number;
  comparables: never[];
  suburb: string;
  confidence?: string;
  confidenceScore?: number;
  channel?: string;
  source: "property.com.au";
  sourceUrl?: string;
  lastUpdated?: string;
}

// "$1,154,000" → 1154000 · "$1.05m" → 1050000 · "$1,582" → 1582
function parseMoney(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\$?\s*([\d,.]+)\s*([mk])?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "m") n *= 1_000_000;
  else if (unit === "k") n *= 1_000;
  return Math.round(n);
}

// 1-hour result cache, keyed by normalised address.
const cache = new Map<string, { value: PropertyEstimate | null; at: number }>();
const CACHE_MS = 3_600_000;

// Step 1 — resolve an address to its property.com.au `-pid-` URL via Google.
async function resolvePropertyUrl(streetAddress: string, suburb: string): Promise<string | null> {
  const params = new URLSearchParams({
    api_key: SB_KEY,
    search: `${streetAddress} ${suburb} WA property.com.au`,
    country_code: "au",
  });
  const res = await fetch(`${SB_BASE}/store/google?${params}`);
  if (!res.ok) throw new Error(`Address lookup failed (ScrapingBee ${res.status})`);
  const data: any = await res.json();
  const urls: string[] = (data.organic_results || [])
    .map((r: any) => r.url as string)
    .filter((u: string) => /property\.com\.au\/.*-pid-\d+/.test(u));

  // Prefer the result whose street number matches (avoid grabbing a neighbour).
  const num = (streetAddress.match(/^(\d+[a-z]?)/i) || [])[1];
  const exact = num && urls.find((u) => new RegExp(`/${num}-pid-`, "i").test(u));
  return exact || urls[0] || null;
}

// Step 2 — fetch the property page (stealth) and parse the PropTrack estimate.
async function fetchEstimate(url: string, suburb: string): Promise<PropertyEstimate | null> {
  const params = new URLSearchParams({
    api_key: SB_KEY,
    url,
    render_js: "true",
    stealth_proxy: "true",
    country_code: "au",
    wait: "6000",
  });
  const res = await fetch(`${SB_BASE}/?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`property.com.au fetch failed (ScrapingBee ${res.status}). ${body.slice(0, 160)}`);
  }
  const $ = cheerio.load(await res.text());

  // The page has a property-value brick then a rental brick; `.first()` is value.
  const priceText = $('[data-testid="valuation-sub-brick-price-text"]').first().text().trim();
  const rangeText = $('[data-testid="valuation-sub-brick-estimate-range"]').first().text().trim();
  const confText = $('[data-testid="valuation-sub-brick-confidence"]').first().text().trim();

  const mid = parseMoney(priceText);
  if (!mid || /pw/i.test(priceText)) return null; // no value estimate (or got the rental brick)

  // range like "$1.05m$1.25m" → ["$1.05m","$1.25m"]
  const rangeParts = (rangeText.match(/\$[\d.,]+\s*[mk]?/gi) || []).map(parseMoney).filter(Boolean) as number[];
  const low = rangeParts[0] || Math.round(mid * 0.9);
  const high = rangeParts[1] || Math.round(mid * 1.1);

  // per-m² and last-updated sit in the "Property value" text block (before the
  // separate "Rental income" block) — read them from the rendered text.
  $("script, style, noscript").remove();
  const fullText = $("body").text().replace(/\s+/g, " ");
  const pvIdx = fullText.search(/property value/i);
  const block = pvIdx >= 0 ? fullText.slice(pvIdx, pvIdx + 220) : fullText;
  const perSqm = parseMoney((block.match(/\$[\d,]+(?=\s*per\s*m)/i) || [])[0]);
  const updated = (block.match(/Last updated\s+([A-Za-z0-9 ]+?)(?:High|Medium|Low|\$)/i) || [])[1]?.trim();

  const conf = confText.replace(/confidence/i, "").trim(); // "High"
  const confidenceScore = /high/i.test(conf) ? 90 : /medium/i.test(conf) ? 70 : /low/i.test(conf) ? 50 : undefined;

  return {
    estimatedValue: { low, mid, high },
    pricePerSqm: { low: perSqm || 0, median: perSqm || 0, high: perSqm || 0 },
    comparableCount: 0,
    comparables: [],
    suburb,
    confidence: conf || undefined,
    confidenceScore,
    channel: "estimate",
    source: "property.com.au",
    sourceUrl: url,
    lastUpdated: updated || undefined,
  };
}

// ---------------------------------------------------------------------------
// Resolve the exact property.com.au page URL for an address — its `-pid-` id.
//
// Uses REA's free consumer-suggest service (property.com.au is REA-owned, and
// the suggestion `id` IS the property.com.au `-pid-`). No API key, no scraping.
// We rebuild the canonical slug from the structured fields the API returns
// (state / suburb / postcode / street / number), which exactly matches the live
// URL form `/<state>/<suburb>-<postcode>/<street-slug>/<number>-pid-<id>/`.
// Cached for a day.
// ---------------------------------------------------------------------------
const urlCache = new Map<string, { url: string | null; at: number }>();
const URL_CACHE_MS = 86_400_000;
const SUGGEST_URL = "https://suggest.realestate.com.au/consumer-suggest/suggestions";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function resolvePropertyComAuUrl(
  streetAddress: string,
  suburb: string,
): Promise<string | null> {
  const key = `${streetAddress}|${suburb}`.toLowerCase();
  const hit = urlCache.get(key);
  if (hit && Date.now() - hit.at < URL_CACHE_MS) return hit.url;

  const params = new URLSearchParams({
    max: "6",
    type: "address",
    src: "property-value",
    query: `${streetAddress} ${suburb} WA`,
  });

  let url: string | null = null;
  try {
    const res = await fetch(`${SUGGEST_URL}?${params}`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`suggest ${res.status}`);
    const data: any = await res.json();
    const suggestions: any[] = (data?._embedded?.suggestions || []).filter(
      (s: any) => s?.type === "address" && s?.id && s?.source,
    );

    // Prefer the suggestion whose street number matches the queried number.
    const wantNum = (streetAddress.match(/^\s*(\d+[a-z]?)/i) || [])[1]?.toLowerCase();
    const pick =
      (wantNum &&
        suggestions.find(
          (s) => String(s.source.streetNumber || "").toLowerCase() === wantNum,
        )) ||
      suggestions[0];

    if (pick) {
      const sc = pick.source;
      const state = slugify(sc.state || "wa");
      const sub = slugify(sc.suburb || suburb);
      const pc = String(sc.postcode || "").replace(/[^\d]/g, "");
      const street = slugify(sc.streetName || "");
      const num = String(sc.streetNumber || "").toLowerCase();
      if (state && sub && pc && street && num) {
        url = `https://www.property.com.au/${state}/${sub}-${pc}/${street}/${num}-pid-${pick.id}/`;
      }
    }
  } catch (err) {
    console.warn(`⚠️ property.com.au suggest lookup failed for "${streetAddress}, ${suburb}":`, err);
  }

  urlCache.set(key, { url, at: Date.now() });
  if (url) console.log(`🔗 property.com.au page: ${url}`);
  else console.warn(`⚠️ property.com.au: no match for "${streetAddress}, ${suburb}"`);
  return url;
}

export async function scrapePropertyEstimate(
  streetAddress: string,
  suburb: string,
): Promise<PropertyEstimate | null> {
  if (!SB_KEY) {
    throw new Error("SCRAPINGBEE_API_KEY not configured — add it to the server environment (.env).");
  }

  const key = `${streetAddress}|${suburb}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const url = await resolvePropertyUrl(streetAddress, suburb);
  if (!url) {
    console.warn(`⚠️ property.com.au: no listing found for "${streetAddress}, ${suburb}"`);
    cache.set(key, { value: null, at: Date.now() });
    return null;
  }
  console.log(`🏷️ property.com.au estimate page: ${url}`);
  const value = await fetchEstimate(url, suburb);
  cache.set(key, { value, at: Date.now() });
  return value;
}
