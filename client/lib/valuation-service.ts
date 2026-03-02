import type { PropertyValuation } from "../../shared/types";
import { devLog } from "./logger";

export async function fetchPropertyValuation(
  suburb: string,
  lotSize: number,
): Promise<PropertyValuation> {
  const params = new URLSearchParams({
    suburb,
    lotSize: lotSize.toString(),
  });

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
