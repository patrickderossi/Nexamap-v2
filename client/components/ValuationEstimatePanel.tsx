import { devLog } from "@/lib/logger";
import { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  BarChart3,
  Home,
} from "lucide-react";
import { fetchPropertyValuation } from "@/lib/valuation-service";
import type { SelectedParcel, PropertyValuation } from "../../shared/types";

interface ValuationEstimatePanelProps {
  selectedParcel?: SelectedParcel;
  propertyData?: any;
  show?: boolean;
  onClose?: () => void;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${Math.round(value / 1000)}K`;
  }
  return `$${value}`;
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getConfidenceColor(confidence?: string): string {
  switch (confidence) {
    case "Very High":
      return "bg-emerald-500";
    case "High":
      return "bg-green-500";
    case "Medium":
      return "bg-yellow-500";
    case "Low":
      return "bg-orange-500";
    case "Very Low":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function getConfidenceBorder(confidence?: string): string {
  switch (confidence) {
    case "Very High":
      return "border-emerald-200 bg-emerald-50";
    case "High":
      return "border-green-200 bg-green-50";
    case "Medium":
      return "border-yellow-200 bg-yellow-50";
    case "Low":
      return "border-orange-200 bg-orange-50";
    case "Very Low":
      return "border-red-200 bg-red-50";
    default:
      return "border-gray-200 bg-gray-50";
  }
}

export function ValuationEstimatePanel({
  selectedParcel,
  propertyData,
  show = false,
  onClose,
}: ValuationEstimatePanelProps) {
  const [valuation, setValuation] = useState<PropertyValuation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComparables, setShowComparables] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;

    setValuation(null);
    setError(null);
    setShowComparables(false);
    setLoading(false);

    if (!show || !selectedParcel) return;

    const suburb =
      selectedParcel.data?.cadastralInfo?.locality ||
      selectedParcel.data?.shire ||
      "";

    const rawLotSize =
      propertyData?.lotSize || selectedParcel.data?.lotSize || selectedParcel.data?.area;

    let lotSize = 0;
    if (typeof rawLotSize === "string") {
      const sanitized = rawLotSize.replace(/,/g, "");
      const match = sanitized.match(/(\d+(?:\.\d+)?)/);
      if (match) lotSize = parseFloat(match[1]);
    } else if (typeof rawLotSize === "number") {
      lotSize = rawLotSize;
    }

    if (!suburb || lotSize <= 0) {
      setError(
        !suburb
          ? "Could not determine suburb for this property."
          : "Could not determine lot size for this property.",
      );
      return;
    }

    setLoading(true);

    devLog.log(
      `💰 Fetching valuation estimate for ${suburb}, ${lotSize}m²`,
    );

    fetchPropertyValuation(suburb, lotSize)
      .then((result) => {
        if (currentRequestId !== requestIdRef.current) return;
        if (result.comparableCount === 0) {
          setError(
            `No sold comparables found in ${suburb}. Try a nearby suburb.`,
          );
        } else {
          setValuation(result);
        }
      })
      .catch((err) => {
        if (currentRequestId !== requestIdRef.current) return;
        devLog.error("Valuation error:", err);
        setError(err.message || "Failed to fetch valuation data.");
      })
      .finally(() => {
        if (currentRequestId !== requestIdRef.current) return;
        setLoading(false);
      });

    return () => {
      requestIdRef.current++;
    };
  }, [show, selectedParcel, propertyData]);

  if (!show) return null;

  const suburb =
    selectedParcel?.data?.cadastralInfo?.locality ||
    selectedParcel?.data?.shire ||
    "Unknown";

  return (
    <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Home className="w-4 h-4" />
        <span className="font-medium">{suburb}</span>
        {selectedParcel?.data?.lotSize && (
          <span className="text-gray-400">
            | {selectedParcel.data.lotSize}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
            <span>Analysing sold comparables...</span>
          </div>
          <div className="space-y-2 animate-pulse">
            <div className="h-16 bg-gray-100 rounded-lg" />
            <div className="h-8 bg-gray-100 rounded-lg" />
            <div className="h-8 bg-gray-100 rounded-lg w-3/4" />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {valuation && !loading && (
        <>
          <div
            className={`rounded-lg border-2 p-4 ${getConfidenceBorder(valuation.confidence)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Estimated Value
              </span>
              <span
                className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${getConfidenceColor(valuation.confidence)}`}
              >
                {valuation.confidence} Confidence
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrencyFull(valuation.estimatedValue.mid)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Range: {formatCurrency(valuation.estimatedValue.low)} –{" "}
              {formatCurrency(valuation.estimatedValue.high)}
            </div>
            {valuation.confidenceScore !== undefined && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Confidence Score</span>
                  <span>{valuation.confidenceScore}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${getConfidenceColor(valuation.confidence)}`}
                    style={{
                      width: `${Math.min(100, valuation.confidenceScore)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <BarChart3 className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500">Price/m²</span>
              </div>
              <div className="text-sm font-semibold text-gray-800">
                ${valuation.pricePerSqm.median.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">
                ${valuation.pricePerSqm.low.toLocaleString()} –{" "}
                ${valuation.pricePerSqm.high.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500">Comparables</span>
              </div>
              <div className="text-sm font-semibold text-gray-800">
                {valuation.comparableCount} sold
              </div>
              <div className="text-xs text-gray-400">
                in {valuation.suburb}
              </div>
            </div>
          </div>

          {valuation.comparables.length > 0 && (
            <div>
              <button
                onClick={() => setShowComparables(!showComparables)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium text-gray-700"
              >
                <span>
                  View {valuation.comparables.length} Comparable Sales
                </span>
                {showComparables ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showComparables && (
                <div className="mt-2 space-y-2">
                  {valuation.comparables.map((comp, i) => (
                    <div
                      key={i}
                      className="border border-gray-200 rounded-lg p-3 bg-white"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {comp.address || "Address unavailable"}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                            {comp.bedrooms ? (
                              <span>{comp.bedrooms} bed</span>
                            ) : null}
                            {comp.bathrooms ? (
                              <span>{comp.bathrooms} bath</span>
                            ) : null}
                            {comp.parking ? (
                              <span>{comp.parking} car</span>
                            ) : null}
                            {comp.landSize ? (
                              <span>{comp.landSize}m²</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-sm font-bold text-gray-900">
                            {formatCurrencyFull(comp.price)}
                          </p>
                          <p className="text-xs text-gray-400">
                            ${comp.pricePerSqm.toLocaleString()}/m²
                          </p>
                        </div>
                      </div>
                      {comp.similarityScore !== undefined && (
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <div className="w-16 bg-gray-200 rounded-full h-1">
                              <div
                                className="h-1 rounded-full bg-emerald-500"
                                style={{
                                  width: `${Math.min(100, (comp.similarityScore / 170) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">
                              {comp.similarityScore >= 145
                                ? "Excellent"
                                : comp.similarityScore >= 100
                                  ? "Good"
                                  : comp.similarityScore >= 70
                                    ? "Fair"
                                    : "Weak"}{" "}
                              match
                            </span>
                          </div>
                          {comp.adjustedPrice &&
                            comp.adjustedPrice !== comp.price && (
                              <span className="text-xs text-blue-600">
                                Adj: {formatCurrencyFull(comp.adjustedPrice)}
                              </span>
                            )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-gray-400 italic border-t border-gray-100 pt-3">
            Estimate based on {valuation.comparableCount} recently sold
            properties in {valuation.suburb}. This is not a formal valuation
            and should not be relied upon for financial decisions.
          </div>
        </>
      )}
    </div>
  );
}
