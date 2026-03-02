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
  BedDouble,
  Bath,
  Car,
  RefreshCw,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  fetchPropertyValuation,
  lookupPropertyDetails,
} from "@/lib/valuation-service";
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

type PanelPhase = "lookup" | "manual-input" | "valuation-loading" | "results";

export function ValuationEstimatePanel({
  selectedParcel,
  propertyData,
  show = false,
  onClose: _onClose,
}: ValuationEstimatePanelProps) {
  const [phase, setPhase] = useState<PanelPhase>("lookup");
  const [valuation, setValuation] = useState<PropertyValuation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showComparables, setShowComparables] = useState(false);
  const requestIdRef = useRef(0);

  const [bedrooms, setBedrooms] = useState<string>("");
  const [bathrooms, setBathrooms] = useState<string>("");
  const [parking, setParking] = useState<string>("");
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [listingPrice, setListingPrice] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);

  const prevShowRef = useRef(show);

  useEffect(() => {
    requestIdRef.current++;
    setPhase("lookup");
    setValuation(null);
    setError(null);
    setShowComparables(false);
    setBedrooms("");
    setBathrooms("");
    setParking("");
    setDetectedSource(null);
    setDetectedAddress(null);
    setListingPrice(null);
    setAutoDetected(false);
  }, [selectedParcel]);

  useEffect(() => {
    if (show && !prevShowRef.current) {
      requestIdRef.current++;
      setPhase("lookup");
      setValuation(null);
      setError(null);
      setShowComparables(false);
      setAutoDetected(false);
    }
    prevShowRef.current = show;
  }, [show]);

  const suburb =
    selectedParcel?.data?.cadastralInfo?.locality ||
    selectedParcel?.data?.shire ||
    "";

  const rawLotSize =
    propertyData?.lotSize || selectedParcel?.data?.lotSize || selectedParcel?.data?.area;

  let lotSize = 0;
  if (typeof rawLotSize === "string") {
    const sanitized = rawLotSize.replace(/,/g, "");
    const match = sanitized.match(/(\d+(?:\.\d+)?)/);
    if (match) lotSize = parseFloat(match[1]);
  } else if (typeof rawLotSize === "number") {
    lotSize = rawLotSize;
  }

  const buildAddress = (): string => {
    const cad = selectedParcel?.data?.cadastralInfo;
    if (!cad) return "";
    const parts: string[] = [];
    if (cad.road_number_1) parts.push(cad.road_number_1);
    if (cad.road_name) parts.push(cad.road_name);
    if (cad.road_type) parts.push(cad.road_type);
    return parts.join(" ");
  };

  useEffect(() => {
    if (!show || phase !== "lookup") return;

    if (!suburb) {
      setPhase("manual-input");
      setError("Could not determine suburb for this property.");
      return;
    }

    const address = buildAddress();
    if (!address) {
      setPhase("manual-input");
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    devLog.log(`🔍 Auto-looking up property: "${address}" in ${suburb}`);

    lookupPropertyDetails(address, suburb)
      .then((result) => {
        if (currentRequestId !== requestIdRef.current) return;

        if (result.found) {
          devLog.log(`✅ Property auto-detected:`, result);
          if (result.bedrooms) setBedrooms(result.bedrooms.toString());
          if (result.bathrooms) setBathrooms(result.bathrooms.toString());
          if (result.parking) setParking(result.parking.toString());
          setDetectedSource(result.source || null);
          setDetectedAddress(result.address || null);
          setListingPrice(result.price || null);
          setAutoDetected(true);

          runValuationWithDetails(
            result.bedrooms,
            result.bathrooms,
            currentRequestId,
          );
        } else {
          devLog.log(`❌ Property not found in listings, showing manual input`);
          setPhase("manual-input");
        }
      })
      .catch((err) => {
        if (currentRequestId !== requestIdRef.current) return;
        devLog.error("Property lookup failed:", err);
        setPhase("manual-input");
      });
  }, [show, suburb, selectedParcel]);

  const runValuationWithDetails = (
    beds?: number,
    baths?: number,
    overrideRequestId?: number,
  ) => {
    if (!suburb || lotSize <= 0) {
      setError(
        !suburb
          ? "Could not determine suburb for this property."
          : "Could not determine lot size for this property.",
      );
      setPhase("manual-input");
      return;
    }

    const currentRequestId = overrideRequestId ?? ++requestIdRef.current;
    setValuation(null);
    setError(null);
    setPhase("valuation-loading");

    fetchPropertyValuation(suburb, lotSize, beds, baths)
      .then((result) => {
        if (currentRequestId !== requestIdRef.current) return;
        if (result.comparableCount === 0) {
          setError(
            `No sold comparables found in ${suburb}. Try a nearby suburb.`,
          );
          setPhase("manual-input");
        } else {
          setValuation(result);
          setPhase("results");
        }
      })
      .catch((err) => {
        if (currentRequestId !== requestIdRef.current) return;
        devLog.error("Valuation error:", err);
        setError(err.message || "Failed to fetch valuation data.");
        setPhase("manual-input");
      });
  };

  const handleManualSubmit = () => {
    const beds = bedrooms ? parseInt(bedrooms, 10) : undefined;
    const baths = bathrooms ? parseInt(bathrooms, 10) : undefined;

    if (bedrooms && (!beds || beds < 1 || beds > 10)) {
      setError("Please enter a valid number of bedrooms (1-10).");
      return;
    }
    if (bathrooms && (!baths || baths < 1 || baths > 10)) {
      setError("Please enter a valid number of bathrooms (1-10).");
      return;
    }

    setAutoDetected(false);
    runValuationWithDetails(beds, baths);
  };

  const handleEditDetails = () => {
    setPhase("manual-input");
    setValuation(null);
    setError(null);
  };

  if (!show) return null;

  return (
    <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Home className="w-4 h-4" />
        <span className="font-medium">{suburb || "Unknown"}</span>
        {lotSize > 0 && (
          <span className="text-gray-400">| {lotSize.toFixed(0)}m²</span>
        )}
      </div>

      {phase === "lookup" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span>Searching listing data for this property...</span>
          </div>
          <div className="space-y-2 animate-pulse">
            <div className="h-10 bg-gray-100 rounded-lg" />
            <div className="h-8 bg-gray-100 rounded-lg w-3/4" />
          </div>
        </div>
      )}

      {phase === "manual-input" && (
        <div className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This property wasn't found in current listings. Enter the
                details below for accurate valuation adjustments, or leave blank
                to use suburb averages.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <BedDouble className="w-3 h-3" />
                Beds
              </label>
              <input
                type="number"
                min="1"
                max="10"
                placeholder="e.g. 3"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Bath className="w-3 h-3" />
                Baths
              </label>
              <input
                type="number"
                min="1"
                max="10"
                placeholder="e.g. 2"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Car className="w-3 h-3" />
                Cars
              </label>
              <input
                type="number"
                min="0"
                max="10"
                placeholder="e.g. 2"
                value={parking}
                onChange={(e) => setParking(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleManualSubmit}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Estimate Value
          </button>
        </div>
      )}

      {phase === "valuation-loading" && (
        <div className="space-y-3">
          {autoDetected && detectedAddress && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-green-700">
                <p className="font-medium">
                  Property found in {detectedSource === "sold" ? "sold" : "active"} listings
                </p>
                <p className="mt-0.5">
                  {bedrooms && `${bedrooms} bed`}
                  {bathrooms && ` · ${bathrooms} bath`}
                  {parking && ` · ${parking} car`}
                  {listingPrice && ` · ${listingPrice}`}
                </p>
              </div>
            </div>
          )}
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

      {phase === "results" && valuation && (
        <>
          {autoDetected && detectedAddress && (
            <div className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-green-700">
                <span className="font-medium">Auto-detected</span>
                {" from "}
                {detectedSource === "sold" ? "sold" : "active"} listings:
                {" "}
                {bedrooms && `${bedrooms} bed`}
                {bathrooms && ` · ${bathrooms} bath`}
                {parking && ` · ${parking} car`}
                {listingPrice && ` · ${listingPrice}`}
              </div>
              <button
                onClick={handleEditDetails}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium flex-shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                Edit
              </button>
            </div>
          )}

          {!autoDetected && (
            <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              <span>
                {bedrooms || bathrooms || parking ? (
                  <>
                    Target: {bedrooms && `${bedrooms} bed`}
                    {bathrooms && ` · ${bathrooms} bath`}
                    {parking && ` · ${parking} car`}
                  </>
                ) : (
                  "Using suburb averages"
                )}
              </span>
              <button
                onClick={handleEditDetails}
                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                Edit
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

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
