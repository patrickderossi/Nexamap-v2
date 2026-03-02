/**
 * Comprehensive list of ALL Western Australia suburbs and regions
 * Maps every suburb to its region for proper filtering and searching
 */

export interface WASuburb {
  name: string;
  region: string;
  isRegion?: boolean;
}

// All WA suburbs organized by region
export const WA_SUBURBS_AND_REGIONS: WASuburb[] = [
  // Perth Metro CBD
  { name: "Perth", region: "Perth Metro CBD" },
  { name: "East Perth", region: "Perth Metro CBD" },
  { name: "West Perth", region: "Perth Metro CBD" },
  { name: "Northbridge", region: "Perth Metro CBD" },
  { name: "Highgate", region: "Perth Metro CBD" },
  { name: "Leederville", region: "Perth Metro CBD" },
  { name: "Claisebrook", region: "Perth Metro CBD" },

  // Perth Metro North West
  { name: "Subiaco", region: "Perth Metro North West" },
  { name: "Shenton Park", region: "Perth Metro North West" },
  { name: "Daglish", region: "Perth Metro North West" },
  { name: "Wembley", region: "Perth Metro North West" },
  { name: "Scarborough", region: "Perth Metro North West" },
  { name: "Osborne Park", region: "Perth Metro North West" },
  { name: "Stirling", region: "Perth Metro North West" },
  { name: "Innaloo", region: "Perth Metro North West" },
  { name: "Balcatta", region: "Perth Metro North West" },
  { name: "Nollamara", region: "Perth Metro North West" },
  { name: "Tuart Hill", region: "Perth Metro North West" },
  { name: "Watermans Bay", region: "Perth Metro North West" },
  { name: "Sorrento", region: "Perth Metro North West" },
  { name: "Floreat", region: "Perth Metro North West" },
  { name: "Jolimont", region: "Perth Metro North West" },
  { name: "Claremont", region: "Perth Metro North West" },

  // Perth Metro North East
  { name: "Bayswater", region: "Perth Metro North East" },
  { name: "Morley", region: "Perth Metro North East" },
  { name: "Noranda", region: "Perth Metro North East" },
  { name: "Dianella", region: "Perth Metro North East" },
  { name: "Mirrabooka", region: "Perth Metro North East" },
  { name: "Yokine", region: "Perth Metro North East" },
  { name: "Oswald", region: "Perth Metro North East" },
  { name: "Ascot", region: "Perth Metro North East" },
  { name: "Maylands", region: "Perth Metro North East" },
  { name: "Embleton", region: "Perth Metro North East" },
  { name: "Inglewood", region: "Perth Metro North East" },
  { name: "Mount Lawley", region: "Perth Metro North East" },
  { name: "Greenmount", region: "Perth Metro North East" },
  { name: "Helena Valley", region: "Perth Metro North East" },

  // Perth Metro South West
  { name: "Cottesloe", region: "Perth Metro South West" },
  { name: "Swanbourne", region: "Perth Metro South West" },
  { name: "Peppermint Grove", region: "Perth Metro South West" },
  { name: "Dalkeith", region: "Perth Metro South West" },
  { name: "Nedlands", region: "Perth Metro South West" },
  { name: "Crawley", region: "Perth Metro South West" },
  { name: "Karrakatta", region: "Perth Metro South West" },
  { name: "Applecross", region: "Perth Metro South West" },
  { name: "Ardross", region: "Perth Metro South West" },
  { name: "Melville", region: "Perth Metro South West" },
  { name: "Willagee", region: "Perth Metro South West" },
  { name: "Booragoon", region: "Perth Metro South West" },
  { name: "Bateman", region: "Perth Metro South West" },
  { name: "Myaree", region: "Perth Metro South West" },
  { name: "Palmyra", region: "Perth Metro South West" },
  { name: "Kardinya", region: "Perth Metro South West" },
  { name: "Murdoch", region: "Perth Metro South West" },

  // Perth Metro South East
  { name: "Como", region: "Perth Metro South East" },
  { name: "Manning", region: "Perth Metro South East" },
  { name: "Cannington", region: "Perth Metro South East" },
  { name: "Bentley", region: "Perth Metro South East" },
  { name: "Kensington", region: "Perth Metro South East" },
  { name: "East Victoria Park", region: "Perth Metro South East" },
  { name: "Victoria Park", region: "Perth Metro South East" },
  { name: "Rivervale", region: "Perth Metro South East" },
  { name: "Belmont", region: "Perth Metro South East" },
  { name: "Carlisle", region: "Perth Metro South East" },

  // Perth Outer Metro North
  { name: "Duncraig", region: "Perth Outer Metro North" },
  { name: "Kingsley", region: "Perth Outer Metro North" },
  { name: "Whitfords", region: "Perth Outer Metro North" },
  { name: "Edgewater", region: "Perth Outer Metro North" },
  { name: "Tapping", region: "Perth Outer Metro North" },
  { name: "Hillarys", region: "Perth Outer Metro North" },
  { name: "Trigg", region: "Perth Outer Metro North" },
  { name: "Two Rocks", region: "Perth Outer Metro North" },
  { name: "Lancelin", region: "Perth Outer Metro North" },

  // Perth Outer Metro East
  { name: "Kalamunda", region: "Perth Outer Metro East" },
  { name: "Lesmurdie", region: "Perth Outer Metro East" },
  { name: "Mundaring", region: "Perth Outer Metro East" },
  { name: "Maida Vale", region: "Perth Outer Metro East" },
  { name: "Mahogany Creek", region: "Perth Outer Metro East" },
  { name: "Castledare", region: "Perth Outer Metro East" },
  { name: "Walliston", region: "Perth Outer Metro East" },
  { name: "Parkerville", region: "Perth Outer Metro East" },
  { name: "Chidley", region: "Perth Outer Metro East" },
  { name: "Darlington", region: "Perth Outer Metro East" },
  { name: "High Wycombe", region: "Perth Outer Metro East" },

  // Perth Outer Metro South
  { name: "Armadale", region: "Perth Outer Metro South" },
  { name: "Kelmscott", region: "Perth Outer Metro South" },
  { name: "Mount Nasura", region: "Perth Outer Metro South" },
  { name: "Serpentine", region: "Perth Outer Metro South" },
  { name: "Roleystone", region: "Perth Outer Metro South" },
  { name: "Bedfordale", region: "Perth Outer Metro South" },
  { name: "Gosnells", region: "Perth Outer Metro South" },
  { name: "Maddington", region: "Perth Outer Metro South" },
  { name: "Thornlie", region: "Perth Outer Metro South" },
  { name: "Canning Vale", region: "Perth Outer Metro South" },
  { name: "Wungong", region: "Perth Outer Metro South" },
  { name: "Langford", region: "Perth Outer Metro South" },

  // Regional WA - South West
  { name: "Bunbury", region: "South West Region" },
  { name: "Busselton", region: "South West Region" },
  { name: "Dunsborough", region: "South West Region" },
  { name: "Yallingup", region: "South West Region" },
  { name: "Margaret River", region: "South West Region" },
  { name: "Cowaramup", region: "South West Region" },
  { name: "Gracetown", region: "South West Region" },
  { name: "Prevelly", region: "South West Region" },
  { name: "Wilyabrup", region: "South West Region" },
  { name: "Carbunup", region: "South West Region" },
  { name: "Metricup", region: "South West Region" },
  { name: "Karridale", region: "South West Region" },
  { name: "Pemberton", region: "South West Region" },
  { name: "Manjimup", region: "South West Region" },
  { name: "Bridgetown", region: "South West Region" },
  { name: "Greenbushes", region: "South West Region" },
  { name: "Balingup", region: "South West Region" },
  { name: "Nannup", region: "South West Region" },
  { name: "Boyup Brook", region: "South West Region" },
  { name: "Kirup", region: "South West Region" },
  { name: "Dardanup", region: "South West Region" },
  { name: "Capel", region: "South West Region" },
  { name: "Gelorup", region: "South West Region" },
  { name: "Stratton", region: "South West Region" },
  { name: "Harvey", region: "South West Region" },
  { name: "Waroona", region: "South West Region" },
  { name: "Myara", region: "South West Region" },
  { name: "Quindanning", region: "South West Region" },
  { name: "Cookernup", region: "South West Region" },

  // Regional WA - Central
  { name: "Northam", region: "Central Region" },
  { name: "York", region: "Central Region" },
  { name: "Toodyay", region: "Central Region" },
  { name: "Beverley", region: "Central Region" },
  { name: "Pingelly", region: "Central Region" },
  { name: "Narrogin", region: "Central Region" },
  { name: "Katanning", region: "Central Region" },
  { name: "Kojonup", region: "Central Region" },
  { name: "Broomehill", region: "Central Region" },
  { name: "Tambellup", region: "Central Region" },
  { name: "Woodanilling", region: "Central Region" },
  { name: "Nyabing", region: "Central Region" },
  { name: "Kukerin", region: "Central Region" },
  { name: "Badgin", region: "Central Region" },
  { name: "Cranbrook", region: "Central Region" },
  { name: "Merredin", region: "Central Region" },
  { name: "Cunderdin", region: "Central Region" },
  { name: "Kellerberrin", region: "Central Region" },
  { name: "Dowerin", region: "Central Region" },
  { name: "Bencubbin", region: "Central Region" },
  { name: "Trayning", region: "Central Region" },
  { name: "Wyalkatchem", region: "Central Region" },
  { name: "Doodlakine", region: "Central Region" },
  { name: "Dumbleyung", region: "Central Region" },
  { name: "Lake Grace", region: "Central Region" },
  { name: "Newdegate", region: "Central Region" },
  { name: "Gnowangerup", region: "Central Region" },
  { name: "Jerramungup", region: "Central Region" },
  { name: "Boxwood", region: "Central Region" },
  { name: "Rocky Gully", region: "Central Region" },
  { name: "Ongerup", region: "Central Region" },
  { name: "Frankland", region: "Central Region" },
  { name: "Porongurup", region: "Central Region" },
  { name: "Mount Barker", region: "Central Region" },
  { name: "Plantagenet", region: "Central Region" },
  { name: "Kapricorn", region: "Central Region" },
  { name: "Albans", region: "Central Region" },
  { name: "Denmark", region: "Central Region" },
  { name: "Walpole", region: "Central Region" },
  { name: "Nornalup", region: "Central Region" },
  { name: "Kendenup", region: "Central Region" },
  { name: "Stormont", region: "Central Region" },

  // Regional WA - Esperance
  { name: "Esperance", region: "Esperance Region" },
  { name: "Pink Lake", region: "Esperance Region" },
  { name: "Grass Patch", region: "Esperance Region" },
  { name: "Munglinup", region: "Esperance Region" },
  { name: "Jerdacuttup", region: "Esperance Region" },
  { name: "Gairdner", region: "Esperance Region" },

  // Regional WA - Inland North
  { name: "Geraldton", region: "Inland North Region" },
  { name: "Greenough", region: "Inland North Region" },
  { name: "Morawa", region: "Inland North Region" },
  { name: "Mullewa", region: "Inland North Region" },
  { name: "Perenjori", region: "Inland North Region" },
  { name: "Irwin", region: "Inland North Region" },
  { name: "Three Springs", region: "Inland North Region" },
  { name: "Carnamah", region: "Inland North Region" },
  { name: "Mingenew", region: "Inland North Region" },
  { name: "Northampton", region: "Inland North Region" },
  { name: "Horrocks", region: "Inland North Region" },
  { name: "Leeman", region: "Inland North Region" },
  { name: "Cervantes", region: "Inland North Region" },
  { name: "Jurien Bay", region: "Inland North Region" },
  { name: "Green Head", region: "Inland North Region" },
  { name: "Seabird", region: "Inland North Region" },

  // Regional WA - Kimberley
  { name: "Broome", region: "Kimberley Region" },
  { name: "Derby", region: "Kimberley Region" },
  { name: "Kununurra", region: "Kimberley Region" },
  { name: "Fitzroy Crossing", region: "Kimberley Region" },
  { name: "Wyndham", region: "Kimberley Region" },
  { name: "Hall Creek", region: "Kimberley Region" },
  { name: "Warmun", region: "Kimberley Region" },

  // Regional WA - Pilbara & Gascoyne
  { name: "Karratha", region: "Pilbara & Gascoyne" },
  { name: "Port Hedland", region: "Pilbara & Gascoyne" },
  { name: "Newman", region: "Pilbara & Gascoyne" },
  { name: "Roebourne", region: "Pilbara & Gascoyne" },
  { name: "Paraburdoo", region: "Pilbara & Gascoyne" },
  { name: "Onslow", region: "Pilbara & Gascoyne" },
  { name: "Exmouth", region: "Pilbara & Gascoyne" },
  { name: "Carnarvon", region: "Pilbara & Gascoyne" },
  { name: "Denham", region: "Pilbara & Gascoyne" },
  { name: "Shark Bay", region: "Pilbara & Gascoyne" },
  { name: "Kalbarri", region: "Pilbara & Gascoyne" },
  { name: "Ajana", region: "Pilbara & Gascoyne" },
  { name: "Minilya", region: "Pilbara & Gascoyne" },

  // Regional WA - Goldfields & Esperance
  { name: "Kalgoorlie", region: "Goldfields & Esperance" },
  { name: "Boulder", region: "Goldfields & Esperance" },
  { name: "Coolgardie", region: "Goldfields & Esperance" },
  { name: "Kambalda", region: "Goldfields & Esperance" },
  { name: "Kambalda West", region: "Goldfields & Esperance" },
  { name: "Widgiemooltha", region: "Goldfields & Esperance" },
  { name: "Norseman", region: "Goldfields & Esperance" },
  { name: "Leonora", region: "Goldfields & Esperance" },
  { name: "Laverton", region: "Goldfields & Esperance" },
  { name: "Menzies", region: "Goldfields & Esperance" },
  { name: "Leinster", region: "Goldfields & Esperance" },
  { name: "Broad Arrow", region: "Goldfields & Esperance" },
  { name: "Coolgardie", region: "Goldfields & Esperance" },
  { name: "Evanston", region: "Goldfields & Esperance" },
];

/**
 * Get all regions from the suburbs list
 */
export function getAllRegions(): string[] {
  const regions = new Set(WA_SUBURBS_AND_REGIONS.map((s) => s.region));
  return Array.from(regions).sort();
}

/**
 * Get all suburbs for a specific region
 */
export function getSuburbsInRegion(region: string): string[] {
  return WA_SUBURBS_AND_REGIONS.filter((s) => s.region === region)
    .map((s) => s.name)
    .sort();
}

/**
 * Get filtered suburbs based on search query
 */
export function filterSuburbs(
  query: string,
  maxResults: number = 15,
): WASuburb[] {
  if (!query.trim()) {
    return WA_SUBURBS_AND_REGIONS.slice(0, maxResults);
  }

  const lowerQuery = query.toLowerCase();

  return WA_SUBURBS_AND_REGIONS.filter((suburb) => {
    const nameMatch = suburb.name.toLowerCase().includes(lowerQuery);
    const regionMatch = suburb.region.toLowerCase().includes(lowerQuery);

    return nameMatch || regionMatch;
  }).slice(0, maxResults);
}

/**
 * Check if a string is a region name
 */
export function isRegionName(name: string): boolean {
  return getAllRegions().includes(name);
}

/**
 * Expand a region name to all suburbs in that region
 */
export function expandRegion(regionName: string): string[] {
  return getSuburbsInRegion(regionName);
}

/**
 * Parse multiple suburbs/regions from comma-separated string
 * Expands regions to their suburbs
 */
export function parseMultipleSuburbsAndRegions(input: string): string[] {
  const items = input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result: string[] = [];
  const seenSuburbs = new Set<string>();

  for (const item of items) {
    if (isRegionName(item)) {
      // Expand region to all suburbs
      const suburbs = expandRegion(item);
      for (const suburb of suburbs) {
        if (!seenSuburbs.has(suburb)) {
          result.push(suburb);
          seenSuburbs.add(suburb);
        }
      }
    } else {
      // Add individual suburb
      if (!seenSuburbs.has(item)) {
        result.push(item);
        seenSuburbs.add(item);
      }
    }
  }

  return result;
}
