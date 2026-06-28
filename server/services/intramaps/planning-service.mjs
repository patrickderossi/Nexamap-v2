// Server-side IntraMaps planning lookup for NexaMap.
//
// Wraps the raw adapter with the things a server needs:
//  - council resolution from a clicked parcel's suburb
//  - an in-memory cache (planning data changes rarely)
//  - a single-flight queue so concurrent clicks never hammer IntraMaps
//    (heavy/parallel requests get the search endpoint throttled)
//
// Keep this as a plain .mjs module (zero deps) so it's runnable + testable
// outside the bundler. The Express route is a thin wrapper around lookupPlanning.

import { IntraMaps, IntraMapsError } from "./intramaps.mjs";
import { COUNCILS } from "./councils.mjs";

// Suburb → council slug. Extend as councils are added to councils.mjs.
// (Suburbs are matched case-insensitively, trimmed.)
const SUBURB_COUNCIL = {
  stirling: [
    "balcatta", "balga", "carine", "churchlands", "coolbinia", "dianella",
    "doubleview", "gwelup", "hamersley", "inglewood", "innaloo", "joondanna",
    "karrinyup", "menora", "mirrabooka", "mount lawley", "nollamara",
    "north beach", "osborne park", "scarborough", "stirling", "trigg",
    "tuart hill", "watermans bay", "wembley downs", "westminster", "woodlands", "yokine",
  ],
  melville: [
    "applecross", "ardross", "attadale", "bateman", "bicton", "booragoon",
    "brentwood", "bull creek", "kardinya", "leeming", "melville",
    "mount pleasant", "murdoch", "myaree", "palmyra", "willagee", "winthrop",
  ],
  "south-perth": [
    "como", "karawara", "kensington", "manning", "salter point", "south perth", "waterford",
  ],
  swan: [
    "aveley", "ballajura", "beechboro", "bellevue", "belhus", "brabham", "bullsbrook",
    "caversham", "dayton", "ellenbrook", "gnangara", "guildford", "hazelmere",
    "henley brook", "herne hill", "jane brook", "koongamia", "lockridge", "malaga",
    "middle swan", "midland", "midvale", "millendon", "mount helena", "red hill",
    "sawyers valley", "south guildford", "stratton", "swan view", "the vines",
    "upper swan", "viveash", "west swan", "woodbridge",
  ],
  belmont: [
    "ascot", "belmont", "cloverdale", "kewdale", "redcliffe", "rivervale",
  ],
  kalamunda: [
    "kalamunda", "forrestfield", "high wycombe", "lesmurdie", "gooseberry hill",
    "maida vale", "walliston", "wattle grove", "bickley", "pickering brook",
    "carmel", "canning mills", "hacketts gully", "paulls valley", "piesse brook", "reservoir",
  ],
  subiaco: [
    "subiaco", "daglish", "shenton park", "jolimont",
  ],
  wanneroo: [
    "wanneroo", "girrawheen", "koondoola", "marangaroo", "alexander heights",
    "landsdale", "darch", "madeley", "kingsway", "wangara", "pearsall", "hocking",
    "sinagra", "ashby", "tapping", "banksia grove", "carramar", "clarkson", "merriwa",
    "mindarie", "quinns rocks", "ridgewood", "butler", "jindalee", "yanchep",
    "two rocks", "neerabup", "eglinton", "alkimos", "pinjar", "jandabup",
    "mariginiup", "nowergup", "gnangara",
  ],
  cockburn: [
    "atwell", "aubin grove", "banjup", "beeliar", "bibra lake", "coogee",
    "coolbellup", "cockburn central", "hamilton hill", "hammond park", "jandakot",
    "munster", "north coogee", "north lake", "spearwood", "south lake", "success",
    "treeby", "wattleup", "yangebup",
  ],
  canning: [
    "bentley", "cannington", "canning vale", "east cannington", "ferndale",
    "lynwood", "parkwood", "queens park", "riverton", "rossmoyne", "shelley",
    "welshpool", "willetton", "wilson",
  ],
  kwinana: [
    "anketell", "bertram", "calista", "casuarina", "hope valley", "kwinana beach",
    "leda", "mandogalup", "medina", "naval base", "orelia", "parmelia", "postans",
    "wandi", "wellard", "the spectacles",
  ],
  "mosman-park": ["mosman park"],
  rockingham: [
    "baldivis", "cooloongup", "east rockingham", "golden bay", "hillman", "karnup",
    "peron", "port kennedy", "rockingham", "safety bay", "secret harbour",
    "shoalwater", "singleton", "waikiki", "warnbro",
  ],
  cottesloe: ["cottesloe", "north cottesloe"],
  cambridge: [
    "city beach", "floreat", "jolimont", "mount claremont", "wembley",
    "west leederville", "wembley downs",
  ],
  bayswater: ["bayswater", "bedford", "embleton", "maylands", "morley", "noranda"],
  nedlands: ["nedlands", "dalkeith", "crawley"],
  joondalup: [
    "joondalup", "beldon", "burns beach", "connolly", "craigie", "currambine",
    "duncraig", "edgewater", "greenwood", "heathridge", "hillarys", "iluka",
    "kallaroo", "kingsley", "kinross", "marmion", "mullaloo", "ocean reef",
    "padbury", "sorrento", "woodvale",
  ],
  "serpentine-jarrahdale": [
    "byford", "cardup", "darling downs", "hopeland", "jarrahdale", "karrakup",
    "keysbrook", "mardella", "mundijong", "oakford", "oldbury", "serpentine",
    "whitby",
  ],
  armadale: [
    "armadale", "bedfordale", "brookdale", "camillo", "champion lakes",
    "forrestdale", "harrisdale", "haynes", "hilbert", "kelmscott", "mount nasura",
    "mount richon", "piara waters", "roleystone", "seville grove", "wungong",
  ],
};

const SUBURB_TO_SLUG = {};
for (const [slug, suburbs] of Object.entries(SUBURB_COUNCIL))
  for (const s of suburbs) SUBURB_TO_SLUG[s] = slug;

export function councilForSuburb(suburb) {
  if (!suburb) return null;
  return SUBURB_TO_SLUG[String(suburb).trim().toLowerCase()] || null;
}

export function supportedCouncils() {
  return Object.keys(COUNCILS);
}

// ------------------------------- cache + queue -------------------------------

const CACHE_TTL = 24 * 60 * 60 * 1000; // planning data is stable; cache a day
const cache = new Map(); // key -> { at, value }

// Serialize all IntraMaps work through one promise chain (one in-flight call).
let chain = Promise.resolve();
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {}); // keep the chain alive on error
  return run;
}

// ------------------------------- the lookup ----------------------------------

/**
 * lookupPlanning({ address, suburb, council? }) → result object the API returns.
 * Never throws: returns { success:false, reason } so the UI can degrade.
 */
export async function lookupPlanning({ address, suburb, council }) {
  const slug = council || councilForSuburb(suburb);
  if (!slug) {
    return { success: false, reason: "council_unsupported", suburb, supported: supportedCouncils() };
  }
  if (!COUNCILS[slug]) {
    return { success: false, reason: "council_unknown", council: slug };
  }
  if (!address) {
    return { success: false, reason: "no_address" };
  }

  const key = `${slug}|${String(address).trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return { ...hit.value, cached: true };
  }

  return enqueue(async () => {
    try {
      const planning = await new IntraMaps(slug).getPlanning(address);
      // Only surface the council card when there's real planning data — otherwise
      // (data-limited council, throttle, or a bad address match) fall back to Landgate.
      const hasData =
        planning &&
        (planning.zone || planning.rCode || (planning.overlays && planning.overlays.length));
      if (!hasData) {
        return { success: false, reason: "no_data", council: slug }; // not cached → retried next time
      }
      const value = { success: true, council: slug, planning };
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      const reason = e instanceof IntraMapsError ? "intramaps_error" : "lookup_failed";
      return { success: false, reason, council: slug, message: e.message };
    }
  });
}

// Build an address string from SLIP cadastral attributes (what NexaMap has on click).
export function addressFromCadastral(c) {
  if (!c) return null;
  const num = [c.road_number_1, c.road_number_2].filter(Boolean).join("-");
  const parts = [num, c.road_name, c.road_type].filter(Boolean);
  const street = parts.join(" ").trim();
  return street || null;
}
