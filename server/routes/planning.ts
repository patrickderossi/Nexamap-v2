import type { RequestHandler } from "express";
// Zero-dependency ESM service (kept as .mjs so it runs/tests outside the bundler).
// @ts-ignore - no type declarations for the .mjs module
import { lookupPlanning } from "../services/intramaps/planning-service.mjs";

/**
 * GET /api/planning?address=<street>&suburb=<suburb>[&council=<slug>]
 *
 * Returns council planning data (scheme, zone, R-code, overlays, title, …) for a
 * parcel via the reverse-engineered IntraMaps adapter. Council is resolved from
 * the suburb when not given. Never 5xx for an expected miss — returns
 * { success:false, reason } so the UI degrades gracefully.
 */
export const handlePlanningLookup: RequestHandler = async (req, res) => {
  try {
    const address = (req.query.address as string)?.trim() || "";
    const suburb = (req.query.suburb as string)?.trim() || "";
    const council = (req.query.council as string)?.trim() || undefined;

    if (!address && !suburb) {
      return res.status(400).json({ success: false, reason: "missing_params" });
    }

    const result = await lookupPlanning({ address, suburb, council });
    res.json(result);
  } catch (e: any) {
    console.error("❌ planning lookup error:", e);
    res.status(500).json({ success: false, reason: "server_error", message: e?.message });
  }
};
