// Client service for council planning data via the server-side IntraMaps proxy.
import { devLog } from "./logger";

export interface CouncilPlanningOverlay {
  caption: string;
  value: string;
}

export interface CouncilPlanning {
  council?: string;
  scheme?: string | null;
  zone?: string | null;
  rCode?: string | null;
  area?: string | null;
  lotPlan?: string | null;
  title?: string | null;
  propertyNumber?: string | null;
  ward?: string | null;
  overlays?: CouncilPlanningOverlay[];
  matchedAddress?: string;
}

export interface CouncilPlanningResult {
  success: boolean;
  reason?: string;
  council?: string;
  planning?: CouncilPlanning;
  cached?: boolean;
}

interface CadastralLike {
  road_number_1?: string | number;
  road_number_2?: string | number;
  road_name?: string;
  road_type?: string;
  locality?: string;
}

/** Build the street address + suburb IntraMaps needs from SLIP cadastral attributes. */
export function addressFromCadastral(c?: CadastralLike | null): { address: string; suburb: string } {
  if (!c) return { address: "", suburb: "" };
  const num = [c.road_number_1, c.road_number_2].filter(Boolean).join("-");
  const address = [num, c.road_name, c.road_type]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { address, suburb: (c.locality || "").trim() };
}

export async function fetchCouncilPlanning(params: {
  address?: string;
  suburb?: string;
  council?: string;
}): Promise<CouncilPlanningResult> {
  const qs = new URLSearchParams();
  if (params.address) qs.set("address", params.address);
  if (params.suburb) qs.set("suburb", params.suburb);
  if (params.council) qs.set("council", params.council);
  try {
    const res = await fetch(`/api/planning?${qs.toString()}`);
    if (!res.ok) return { success: false, reason: `http_${res.status}` };
    return (await res.json()) as CouncilPlanningResult;
  } catch (e) {
    devLog.error("Council planning fetch failed:", e);
    return { success: false, reason: "network_error" };
  }
}
