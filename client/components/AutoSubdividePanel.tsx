import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  ArrowRight,
  Home,
  Flag,
} from "lucide-react";
import * as turf from "@turf/turf";
import {
  detectFrontBoundary,
  generateAutoSubdivisionConfigs,
  type AutoSubdivisionConfig,
  type AutoLot,
  type FrontBoundaryInfo,
} from "@/lib/auto-subdivision";
import type { ParentLot } from "./SubdivisionSidebar";

export interface ApplyableLot {
  name: string;
  classification: "private" | "common-property";
  geometry: GeoJSON.Polygon;
}

interface AutoSubdividePanelProps {
  parentLot: ParentLot | undefined;
  onApplyConfig: (lots: ApplyableLot[]) => void;
  onClose?: () => void;
}

const LOT_COUNTS = [2, 3, 4, 5, 6];

function ConfigTypeIcon({
  type,
}: {
  type: "side-by-side" | "battleaxe";
}) {
  if (type === "side-by-side")
    return <Layers className="h-4 w-4 text-blue-600" />;
  return <Flag className="h-4 w-4 text-orange-600" />;
}

function LotRow({ lot }: { lot: AutoLot }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 text-xs">
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          lot.type === "common-property" ? "bg-emerald-500" : "bg-blue-500"
        }`}
      />
      <span className="flex-1 font-medium text-gray-700 truncate">
        {lot.name}
      </span>
      <span className="text-gray-500 tabular-nums">
        {lot.area.toLocaleString()} m²
      </span>
      {lot.type !== "common-property" && (
        <span className="text-gray-400 tabular-nums">{lot.frontage} m</span>
      )}
      {lot.type !== "common-property" ? (
        lot.compliant ? (
          <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
        ) : (
          <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
        )
      ) : (
        <span className="text-xs text-emerald-600 font-medium">CP</span>
      )}
    </div>
  );
}

function ConfigCard({
  config,
  onApply,
}: {
  config: AutoSubdivisionConfig;
  onApply: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const privateLots = config.lots.filter((l) => l.type === "private");
  const cpLots = config.lots.filter((l) => l.type === "common-property");

  return (
    <div
      className={`border-2 rounded-xl overflow-hidden transition-all ${
        config.overallCompliant
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-amber-200 bg-amber-50/40"
      }`}
    >
      {/* Config header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <ConfigTypeIcon type={config.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-800">
              {config.name}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] py-0 px-1.5 ${
                config.overallCompliant
                  ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                  : "border-amber-400 text-amber-700 bg-amber-50"
              }`}
            >
              {config.overallCompliant ? "Compliant" : "Non-compliant"}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">
            {config.description}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Lot summary chips */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {privateLots.map((lot) => (
          <span
            key={lot.id}
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
              lot.compliant
                ? "bg-blue-100 text-blue-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            <Home className="h-2.5 w-2.5" />
            {lot.area.toLocaleString()} m²
          </span>
        ))}
        {cpLots.map((lot) => (
          <span
            key={lot.id}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
          >
            <ArrowRight className="h-2.5 w-2.5" />
            {lot.area.toLocaleString()} m² CP
          </span>
        ))}
      </div>

      {/* Expandable lot table */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-200 pt-2 bg-white/60">
          <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">
            <span>Lot</span>
            <div className="flex items-center gap-4">
              <span>Area</span>
              <span>Frontage</span>
              <span>OK</span>
            </div>
          </div>
          {config.lots.map((lot) => (
            <LotRow key={lot.id} lot={lot} />
          ))}
          {!config.overallCompliant && (
            <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 rounded-lg p-2 leading-relaxed">
              {privateLots
                .filter((l) => !l.compliant)
                .flatMap((l) => l.issues)
                .map((issue, i) => (
                  <div key={i}>• {issue}</div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Apply button */}
      <div className="px-4 py-2.5 bg-white/80 border-t border-gray-100">
        <Button
          size="sm"
          onClick={onApply}
          className={`w-full text-xs font-semibold h-8 ${
            config.overallCompliant
              ? "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white"
              : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
          }`}
        >
          Apply {config.name} →
        </Button>
      </div>
    </div>
  );
}

export function AutoSubdividePanel({
  parentLot,
  onApplyConfig,
}: AutoSubdividePanelProps) {
  const [targetLots, setTargetLots] = useState(2);
  const [frontEdgeIndex, setFrontEdgeIndex] = useState<number | null>(null);
  const [frontBoundaryInfo, setFrontBoundaryInfo] =
    useState<FrontBoundaryInfo | null>(null);
  const [configs, setConfigs] = useState<AutoSubdivisionConfig[]>([]);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const rCode =
    parentLot?.zoning?.match(/R\d+(\.\d+)?(\/\d+(\.\d+)?)?/)?.[0] ?? "R20";

  const handleGenerate = useCallback(() => {
    if (!parentLot?.geometry) {
      setErrorMsg("No parcel loaded. Please select a property first.");
      return;
    }

    setGenerating(true);
    setErrorMsg(null);
    setConfigs([]);

    try {
      const parcelFeature = turf.feature(parentLot.geometry);

      // Detect front boundary
      const fbInfo = detectFrontBoundary(parentLot.geometry);
      setFrontBoundaryInfo(fbInfo);

      const edgeIndex = frontEdgeIndex ?? fbInfo.detectedIndex;
      setFrontEdgeIndex(edgeIndex);

      const result = generateAutoSubdivisionConfigs(
        parcelFeature,
        targetLots,
        rCode,
        edgeIndex
      );

      if (result.length === 0) {
        setErrorMsg(
          "Unable to generate valid configurations for this parcel shape and lot count. Try a different number of lots."
        );
      } else {
        setConfigs(result);
        setGenerated(true);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Unexpected error during generation."
      );
    } finally {
      setGenerating(false);
    }
  }, [parentLot, targetLots, frontEdgeIndex, rCode]);

  const handleApply = useCallback(
    (config: AutoSubdivisionConfig) => {
      const lots: ApplyableLot[] = config.lots.map((lot) => ({
        name: lot.name,
        classification: lot.type,
        geometry: lot.geometry,
      }));
      onApplyConfig(lots);
    },
    [onApplyConfig]
  );

  const handleEdgeToggle = (idx: number) => {
    setFrontEdgeIndex(idx);
    setGenerated(false);
    setConfigs([]);
  };

  const totalArea = parentLot?.area ?? 0;

  return (
    <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
      {/* Parcel summary */}
      {parentLot && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
          <span className="font-semibold">{parentLot.address}</span>
          <span className="text-blue-500 mx-2">·</span>
          <span>{totalArea.toLocaleString()} m²</span>
          <span className="text-blue-500 mx-2">·</span>
          <span className="font-medium">{rCode}</span>
        </div>
      )}

      {/* Lot count selector */}
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
          Target Lots
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              setTargetLots((v) => Math.max(2, v - 1));
              setGenerated(false);
              setConfigs([]);
            }}
            disabled={targetLots <= 2}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <div className="flex gap-1">
            {LOT_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setTargetLots(n);
                  setGenerated(false);
                  setConfigs([]);
                }}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                  targetLots === n
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              setTargetLots((v) => Math.min(6, v + 1));
              setGenerated(false);
              setConfigs([]);
            }}
            disabled={targetLots >= 6}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <span className="text-xs text-gray-500 ml-1">lots</span>
        </div>
      </div>

      {/* Front boundary selection */}
      {frontBoundaryInfo && (
        <div>
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
            Front Boundary (street-facing edge)
          </label>
          <div className="flex flex-col gap-1">
            {frontBoundaryInfo.edges
              .slice()
              .sort((a, b) => a.length - b.length)
              .slice(0, 4)
              .map((edge) => {
                const isSelected =
                  edge.index === (frontEdgeIndex ?? frontBoundaryInfo.detectedIndex);
                const isCandidate = frontBoundaryInfo.candidateIndices.includes(
                  edge.index
                );
                return (
                  <button
                    key={edge.index}
                    onClick={() => handleEdgeToggle(edge.index)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600"
                        : isCandidate
                        ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span className="font-semibold w-16">
                      {Math.round(edge.length)} m
                    </span>
                    <span className="flex-1">Edge {edge.index + 1}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase tracking-wide opacity-90">
                        Selected ✓
                      </span>
                    )}
                    {!isSelected && isCandidate && (
                      <span className="text-[10px] opacity-60">Candidate</span>
                    )}
                  </button>
                );
              })}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
            The auto-detected edge is highlighted. Click a different edge if
            the street is on another side.
          </p>
        </div>
      )}

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={generating || !parentLot}
        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold h-9"
        size="sm"
      >
        {generating ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Generating…
          </>
        ) : generated ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate Configurations
          </>
        ) : (
          <>
            <Layers className="h-4 w-4 mr-2" />
            Generate Configurations
          </>
        )}
      </Button>

      {/* Error */}
      {errorMsg && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorMsg}
        </div>
      )}

      {/* Configs */}
      {configs.length > 0 && (
        <>
          <Separator />
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {configs.length} Configuration{configs.length > 1 ? "s" : ""} Found
          </div>
          <div className="flex flex-col gap-3">
            {configs.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                onApply={() => handleApply(config)}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            After applying, use the Classify Areas tool to adjust lot types,
            or export from the Subdivision Analysis panel.
          </p>
        </>
      )}
    </div>
  );
}
