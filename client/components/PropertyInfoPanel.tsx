import { useState } from "react";
import {
  MapPin,
  Building2,
  Layers,
  Square,
  Flame,
  Mountain,
  DollarSign,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { generateSoilReport, getSoilSummary } from "@/lib/soil-classifier";
import {
  C, FONT, MONO, monoLabel, sourceTag, divider, badge, dot,
  kvRow, kvKey, kvVal,
} from "@/lib/nexa-ui";
import { FeedbackModal } from "./FeedbackModal";
import type { SelectedParcel, PropertyData, PropertyValuation } from "../../shared/types";
import type { CouncilPlanningResult } from "@/lib/intramaps-service";

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function extractRCode(s?: string | null): string | null {
  if (!s) return null;
  const m = String(s).match(/R\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*(?:-\w+)?/i);
  return m ? m[0].toUpperCase() : null;
}

function titleCase(s?: string | null): string {
  if (!s) return "";
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ---------------------------------------------------------------------------
// Merge SLIP + IntraMaps into one view model. IntraMaps (council-authoritative)
// wins wherever the two overlap, so nothing is shown twice.
// ---------------------------------------------------------------------------
function resolveBlock(
  propertyData: PropertyData | null | undefined,
  council: CouncilPlanningResult | null | undefined,
) {
  const cad: any = propertyData?.cadastralInfo;
  const cp = council?.success ? council.planning : null;
  const councilName = cp && council?.council ? titleCase(council.council) : null;
  const clean = (v: any): any => {
    if (v == null) return null;
    const s = String(v).trim();
    return !s || /^unknown\b/i.test(s) ? null : v;
  };

  const street = cad
    ? [
        [cad.road_number_1, cad.road_number_2].filter(Boolean).join("-"),
        cad.road_name,
        cad.road_type,
        cad.road_suffix,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const streetAddress = titleCase(street);
  const suburb = titleCase(cad?.locality) || "";
  const postcode = clean(propertyData?.postcode) ? String(propertyData?.postcode) : null;
  const address = (streetAddress + (suburb ? `, ${suburb}` : "")).replace(/^,\s*/, "").trim();

  return {
    councilName,
    hasCouncil: !!cp,
    address,
    streetAddress,
    suburb,
    postcode,
    // identity
    lotNumber: cad?.lot_number ?? null,
    landId: cad?.land_id ?? null,
    // planning (IntraMaps preferred)
    zone: clean(cp?.zone ?? propertyData?.zoning),
    rCode: cp?.rCode ?? extractRCode(propertyData?.zoning ?? propertyData?.rCode),
    scheme: clean(cp?.scheme ?? propertyData?.shire),
    landUse: !cp ? clean(propertyData?.landUse) : null,
    overlays: cp?.overlays ?? [],
    planningSource: cp ? `${councilName} · IntraMaps` : propertyData?.zoning ? "Landgate" : null,
    // SLIP Property & Planning (layer 111) R-code — always shown on its own card,
    // independent of IntraMaps, so the authoritative REST value is visible too.
    slipRCode: extractRCode(propertyData?.rCode ?? propertyData?.zoning),
    slipScheme: clean(propertyData?.zoning),
    slipMrsZone: clean(propertyData?.mrsZone),
    // land — council legal/title area (off the Title/Deposited Plan) wins;
    // SLIP's polygon-computed area is the fallback when no council data.
    area: clean(cp?.area) ?? propertyData?.lotSize ?? null,
    areaSource: clean(cp?.area) ? "legal" : propertyData?.lotSize ? "computed" : null,
    lotPlan: clean(cp?.lotPlan ?? propertyData?.planNumber),
    title: cp?.title ?? null,
    boundaryLengths: propertyData?.boundaryLengths ?? null,
    perimeter: propertyData?.perimeter ?? null,
    // constraints
    bushfire: propertyData?.bushfire ?? null,
    soil:
      propertyData?.soilType && propertyData.soilType !== "Unknown"
        ? propertyData.soilType
        : null,
  };
}

interface PropertyInfoPanelProps {
  selectedParcel: SelectedParcel | null;
  address?: string;
  data?: PropertyData | null;
  valuationData?: PropertyValuation | null;
  valuationLoading?: boolean;
  valuationError?: string | null;
  estimateUrl?: string | null;
  estimateLoading?: boolean;
  onGetEstimate?: () => void;
  councilPlanning?: CouncilPlanningResult | null;
  councilPlanningLoading?: boolean;
}

export function PropertyInfoPanel({
  selectedParcel,
  address,
  data,
  valuationData,
  valuationLoading,
  valuationError,
  estimateUrl,
  estimateLoading,
  onGetEstimate,
  councilPlanning,
  councilPlanningLoading,
}: PropertyInfoPanelProps) {
  // Prefer the live, progressively-enriched parcel data (set on map click and
  // streamed into via onPropertyEnrich) over the `data` prop, which is a stale
  // snapshot built from the initial cadastral metrics.
  const propertyData = selectedParcel?.data || data;

  if (!address) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", fontFamily: FONT }}>
        <MapPin className="w-9 h-9 mx-auto mb-3" style={{ color: C.fainter }} />
        <p style={{ fontSize: 13, color: C.label, lineHeight: 1.5 }}>
          Click a parcel on the map to see its full block report.
        </p>
      </div>
    );
  }

  const b = resolveBlock(propertyData, councilPlanning);
  const councilFailed =
    councilPlanning && !councilPlanning.success && councilPlanning.reason === "council_unsupported";

  const councilLabel = b.councilName
    ? `City of ${b.councilName.replace(/^City Of\s*/i, "")}`
    : null;
  const co = selectedParcel?.coordinates;
  const coordStr = co
    ? `${(co.find((n) => n < 0) ?? co[1]).toFixed(6)}, ${(co.find((n) => n > 0) ?? co[0]).toFixed(6)}`
    : null;

  return (
    <div style={{ padding: "14px 16px 18px", fontFamily: FONT, color: C.ink }}>
      {/* Identity header — street address, suburb · council, coordinates */}
      <header>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.015em", lineHeight: 1.15 }}>
          {b.streetAddress || "Selected parcel"}
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          {[b.suburb, councilLabel].filter(Boolean).join(" · ") || "Western Australia"}
        </div>
        {coordStr && (
          <div
            style={{
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 11,
              color: C.faint,
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={dot(C.blue)} />
            {coordStr}
          </div>
        )}
      </header>

      {/* status badges */}
      {(b.rCode || b.slipRCode || b.zone || b.lotNumber) && (
        <div style={{ display: "flex", gap: 6, marginTop: 13, flexWrap: "wrap" }}>
          {(b.rCode || b.slipRCode || b.zone) && (
            <span style={badge("blue")}>
              {(b.rCode || b.slipRCode) && (
                <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11 }}>{b.rCode || b.slipRCode}</span>
              )}
              {b.rCode || b.slipRCode ? "Residential" : titleCase(b.zone)}
            </span>
          )}
          {b.lotNumber && (
            <span style={badge("neutral")}>Lot {b.lotNumber}</span>
          )}
        </div>
      )}

      {/* PLANNING — the priority block */}
      <Section
        icon={<Building2 className="w-3.5 h-3.5" />}
        title="Planning"
        source={b.planningSource}
      >
        {councilPlanningLoading ? (
          <div className="space-y-2 py-1 animate-pulse">
            <div className="h-5 w-2/3 rounded" style={{ background: "#E8EAE6" }} />
            <div className="h-3 w-1/2 rounded" style={{ background: "#EDEEE9" }} />
          </div>
        ) : (
          <>
            {(b.zone || b.rCode) && (
              <Row
                label="Zoning"
                value={[titleCase(b.zone) || "Residential", b.rCode].filter(Boolean).join(" ")}
              />
            )}
            {b.scheme && <Row label="Local scheme" value={b.scheme} />}
            {b.landUse && <Row label="Land use" value={titleCase(b.landUse)} />}
            {councilLabel && <Row label="Local government" value={councilLabel} />}

            {/* Overlays — the signal that governs the lot */}
            {b.overlays.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  border: `1px solid ${C.amber}55`,
                  background: C.amberBg,
                  padding: "9px 11px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Layers className="w-3.5 h-3.5" style={{ color: C.amberText }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.amberText }}>Overlays govern this lot</span>
                </div>
                {b.overlays.map((o, i) => (
                  <p key={i} style={{ fontSize: 11.5, color: C.amberText, lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 700 }}>{o.caption}:</span> {o.value}
                  </p>
                ))}
              </div>
            )}

            {councilFailed && (
              <p style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>
                Council (IntraMaps) data isn't wired up for this area yet — showing Landgate zoning.
              </p>
            )}
          </>
        )}
      </Section>

      {/* R-CODE (SLIP) — the R-code straight from the Property & Planning REST
          layer 111, shown alongside the IntraMaps value for comparison */}
      {b.slipRCode && (
        <Section
          icon={<Building2 className="w-3.5 h-3.5" />}
          title="R-Code (SLIP)"
          source="Property & Planning · L111"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...badge("blue"), fontFamily: MONO, height: 22 }}>{b.slipRCode}</span>
            {b.slipScheme && (
              <span style={{ fontSize: 12.5, color: C.muted }}>{titleCase(b.slipScheme)}</span>
            )}
          </div>
          {b.slipMrsZone && <Row label="MRS zone" value={b.slipMrsZone} />}
        </Section>
      )}

      {/* LAND */}
      <Section icon={<Square className="w-3.5 h-3.5" />} title="Land">
        {b.area && (
          <Row label="Area" value={b.area} tag={b.areaSource ?? undefined} />
        )}
        {b.lotPlan && <Row label="Lot / Plan" value={b.lotPlan} />}
        {b.title && <Row label="Certificate of Title" value={b.title} />}
        {b.landId && <Row label="Land ID" value={String(b.landId)} />}
        {b.perimeter && <DimensionsRow perimeter={b.perimeter} boundaryLengths={b.boundaryLengths} />}
        {!b.area && !b.lotPlan && !b.title && !b.landId && (
          <p style={{ fontSize: 12, color: C.faint, padding: "4px 0" }}>No cadastral detail available.</p>
        )}
      </Section>

      {/* CONSTRAINTS */}
      {(b.bushfire || b.soil) && (
        <Section icon={<Flame className="w-3.5 h-3.5" />} title="Constraints" source="Landgate">
          {b.bushfire && (
            <Row
              label="Bushfire (BAL)"
              value={b.bushfire}
              warn={/^in bal area/i.test(b.bushfire.trim())}
            />
          )}
          {b.soil && <SoilRow soilType={b.soil} />}
        </Section>
      )}

      {/* ESTIMATE — a pre-built link straight to the property.com.au page */}
      <Section icon={<DollarSign className="w-3.5 h-3.5" />} title="Property Value" source="property.com.au">
        <div style={{ fontSize: 13, color: C.muted, marginTop: -2, marginBottom: 10 }}>
          Live estimate · <span style={{ fontWeight: 600, color: C.ink }}>property.com.au</span>
        </div>
        {estimateUrl ? (
          <a
            href={estimateUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
              height: 46,
              borderRadius: 12,
              background: "linear-gradient(120deg,#7C5CCB,#5E3DB5)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "-.01em",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.12)",
              textDecoration: "none",
            }}
          >
            <DollarSign className="w-[18px] h-[18px]" />
            Get estimate
            <ExternalLink className="w-3.5 h-3.5" style={{ opacity: 0.8 }} />
          </a>
        ) : estimateLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
              height: 46,
              borderRadius: 12,
              background: "linear-gradient(120deg,#7C5CCB,#5E3DB5)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              opacity: 0.7,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,.4)",
                borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite",
              }}
            />
            Finding listing…
          </div>
        ) : (
          <p style={{ padding: "4px 0", textAlign: "center", fontSize: 12, color: C.faint }}>
            No property.com.au page found for this address
          </p>
        )}
      </Section>

      {/* Feedback */}
      <div className="pt-1 flex justify-center">
        <FeedbackModal
          trigger={
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 9,
                padding: "7px 13px",
                border: `1px solid ${C.lineStrong}`,
                background: "transparent",
                color: C.muted,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Suggest more block data
            </button>
          }
          title="Suggest More Lot Data"
          description="Help us improve by suggesting additional lot data that would be valuable for your analysis."
          placeholder="What additional data would help your analysis? (utilities, easements, environmental factors, etc.)"
          feedbackType="lot-data"
          context={`Property: ${b.address}\nZone: ${b.zone || "Unknown"} ${b.rCode || ""}\nArea: ${b.area || "Unknown"}`.trim()}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  source,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  source?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section style={{ fontFamily: FONT }}>
      <div style={{ ...divider, margin: "14px 0 12px" }} />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 9,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ color: C.label, display: "flex" }}>{icon}</span>
          <span style={monoLabel()}>{title.toUpperCase()}</span>
        </div>
        {source && (
          <span style={{ ...sourceTag, marginLeft: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {source}
          </span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  tag,
  warn,
}: {
  label: string;
  value: string;
  tag?: string;
  warn?: boolean;
}) {
  return (
    <div style={kvRow}>
      <span style={kvKey}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "right" }}>
        {tag && (
          <span style={{ ...sourceTag, textTransform: "uppercase" }}>{tag}</span>
        )}
        <span style={{ ...kvVal, color: warn ? C.amberText : C.ink }}>{value}</span>
      </span>
    </div>
  );
}

function DimensionsRow({
  perimeter,
  boundaryLengths,
}: {
  perimeter: string;
  boundaryLengths?: string[] | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-50 py-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full gap-3 cursor-pointer group"
      >
        <span className="text-xs text-slate-500">Perimeter / dimensions</span>
        <span className="flex items-center gap-1 text-sm font-medium text-slate-900">
          {perimeter}
          {boundaryLengths && boundaryLengths.length > 0 &&
            (open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />)}
        </span>
      </button>
      {open && boundaryLengths && boundaryLengths.length > 0 && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {boundaryLengths.map((s, i) => (
            <span key={i} className="text-[11px] text-slate-500">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SoilRow({ soilType }: { soilType: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-50 py-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-start justify-between w-full gap-3 cursor-pointer text-left"
      >
        <span className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0 pt-0.5">
          <Mountain className="w-3.5 h-3.5 text-slate-400" /> Soil
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-slate-900 text-right">
          {getSoilSummary(soilType)}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 text-[11px] text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2 max-h-[180px] overflow-y-auto">
          <p className="text-slate-400 mb-1">{soilType}</p>
          {generateSoilReport(soilType)}
        </div>
      )}
    </div>
  );
}

function ValuationBody({ valuation }: { valuation: PropertyValuation }) {
  const [showComparables, setShowComparables] = useState(false);
  const comps = valuation.comparables.slice(0, 5);

  const conf = (valuation.confidence || "").trim();
  const fullValue = (n: number) => `$${Math.round(n).toLocaleString()}`;
  // property.com.au estimates carry these extra fields (not on PropertyValuation).
  const v = valuation as any;
  const src: string | undefined = v.source;
  const lastUpdated: string | undefined = v.lastUpdated;
  const sourceUrl: string | undefined = v.sourceUrl;
  const hasPerSqm = valuation.pricePerSqm?.median > 0;

  return (
    <div className="pt-1">
      {/* Hero valuation card */}
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-violet-50 px-4 py-5 text-center shadow-sm">
        {conf && (
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-600 mb-1.5">
            {conf} Confidence
          </div>
        )}
        <div className="text-[34px] leading-none font-extrabold text-slate-900 tabular-nums">
          {fullValue(valuation.estimatedValue.mid)}
        </div>
        {hasPerSqm && (
          <div className="mt-2.5 inline-flex items-center rounded-full bg-violet-100/80 px-3 py-1 text-xs font-semibold text-violet-700">
            ${Math.round(valuation.pricePerSqm.median).toLocaleString()} per m²
          </div>
        )}
      </div>

      {/* Low / High range */}
      <div className="flex items-end justify-between px-1 pt-3">
        <div>
          <div className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(valuation.estimatedValue.low)}</div>
          <div className="text-[11px] text-slate-400">Low range</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(valuation.estimatedValue.high)}</div>
          <div className="text-[11px] text-slate-400">High range</div>
        </div>
      </div>

      {comps.length > 0 && (
        <div className="mt-1.5">
          <button
            onClick={() => setShowComparables(!showComparables)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer w-full"
          >
            <TrendingUp className="w-3 h-3" />
            <span>Comparable sales ({comps.length})</span>
            {showComparables ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showComparables && (
            <div className="mt-1.5 space-y-1">
              {comps.map((c, i) => (
                <div key={i} className="bg-slate-50 rounded p-2 text-[11px]">
                  <p className="font-medium text-slate-900 truncate">{c.address}</p>
                  <div className="flex justify-between mt-0.5 text-slate-500">
                    <span>{formatCurrency(c.price)}</span>
                    <span>{c.landSize}m²</span>
                    <span>${Math.round(c.pricePerSqm)}/m²</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-2 leading-tight">
        {src === "property.com.au" ? (
          <>
            PropTrack estimate{lastUpdated ? ` · updated ${lastUpdated}` : ""}
            {sourceUrl ? (
              <> · <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-violet-600">property.com.au</a></>
            ) : " · via property.com.au"}
            . Not a formal valuation.
          </>
        ) : (
          <>Based on {valuation.comparableCount} sold listings in {valuation.suburb}. Not a formal valuation.</>
        )}
      </p>
    </div>
  );
}
