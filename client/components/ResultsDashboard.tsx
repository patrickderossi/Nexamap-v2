import { Home, Zap, Flame, Shield, Download, Building2, Layers, MapPin } from "lucide-react";
import { PropertyCard, PropertyItem } from "./PropertyCard";
import { MapViewer } from "./MapViewer";
import { Button } from "@/components/ui/button";
import { devLog } from "@/lib/logger";

interface PropertyData {
  // Cadastre
  lotSize: string;
  lotDimensions?: string;
  planNumber?: string;
  perimeter?: string;
  boundaryLengths?: string[];
  interiorAngles?: string[];

  // Planning / Zoning
  zoning: string;           // R-code
  shire?: string;           // Scheme name / LPS zone
  landUse?: string;
  mrsZone?: string;
  lpsOverlays?: string[];
  lgaName?: string;

  // Bushfire
  bushfire: string;
  bushfirePlanningArea?: string;

  // Heritage
  heritage: string;
  heritageState?: string;
  heritageStateId?: string;
  heritageLocal?: string;

  // Hazards / Constraints
  floodRisk: string;
  contamination: string;
  acidSulfateSoil?: string;
  publicDrinkingWater?: string;
  aboriginalHeritage?: string;
  airportNoiseBuf?: string;
  roadRailNoiseBuf?: string;

  // Soil
  soilType?: string;

  // Legacy
  easements?: string;
  coordinates?: [number, number];

  // External APIs
  elevationM?: number;
  postcode?: string;
  sa2Name?: string;
  roadClassification?: string;
  roadNetworkType?: string;
}

interface ResultsDashboardProps {
  data: PropertyData;
  address: string;
}

export function ResultsDashboard({ data, address }: ResultsDashboardProps) {
  const handleExportReport = () => {
    devLog.log("Exporting report for:", address);
  };

  const bushfireStatus =
    data.bushfire.includes("Not") ? "normal" : "danger";

  const heritageStatus =
    data.heritage !== "No" && data.heritage !== "Unknown" ? "warning" : "normal";

  const floodStatus =
    data.floodRisk.includes("Floodway") || data.floodRisk.includes("Fringe")
      ? "danger"
      : data.floodRisk.includes("Control") ? "warning" : "normal";

  const hasOverlays = data.lpsOverlays && data.lpsOverlays.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Address Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Site Analysis Results</h2>
        <p className="text-gray-600">{address}</p>
        {data.lgaName && data.lgaName !== "Unknown" && (
          <p className="text-sm text-gray-500 mt-1">
            {data.lgaName.replace(/, (\w+) OF$/i, " $1").replace(/ OF$/, "").replace(/^(\w+),\s/i, (_, name) => name + " ")}
          </p>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        {/* Left Column - Map */}
        <div>
          <MapViewer address={address} coordinates={data.coordinates} />
        </div>

        {/* Right Column - Property Data Cards */}
        <div className="space-y-6">
          {/* Lot Details */}
          <PropertyCard title="Lot Details" icon={<Home className="w-8 h-8" />}>
            <PropertyItem label="Lot Size" value={data.lotSize} />
            {data.lotDimensions && <PropertyItem label="Dimensions" value={data.lotDimensions} />}
            {data.perimeter && <PropertyItem label="Perimeter" value={data.perimeter} />}
            {data.planNumber && <PropertyItem label="Plan Number" value={data.planNumber} />}
            {data.lgaName && data.lgaName !== "Unknown" && (
              <PropertyItem label="Council" value={data.lgaName} />
            )}
          </PropertyCard>

          {/* Zoning & Planning */}
          <PropertyCard title="Zoning & Planning" icon={<Zap className="w-8 h-8" />}>
            <PropertyItem label="R-Code" value={data.zoning} />
            {data.shire && data.shire !== "Unknown Shire" && (
              <PropertyItem label="Planning Scheme" value={data.shire} />
            )}
            {data.mrsZone && data.mrsZone !== "Unknown" && (
              <PropertyItem label="MRS Zone" value={data.mrsZone} />
            )}
            {data.landUse && data.landUse !== "Unknown" && (
              <PropertyItem label="Land Use" value={data.landUse} />
            )}
          </PropertyCard>

          {/* LPS Overlays */}
          {hasOverlays && (
            <PropertyCard title="Planning Overlays" icon={<Layers className="w-8 h-8" />}>
              {data.lpsOverlays!.map((overlay, i) => (
                <PropertyItem key={i} label={`Overlay ${i + 1}`} value={overlay} status="warning" />
              ))}
            </PropertyCard>
          )}

          {/* Bushfire */}
          <PropertyCard title="Bushfire Risk" icon={<Flame className="w-8 h-8" />}>
            <PropertyItem label="Designation" value={data.bushfire} status={bushfireStatus} />
            {data.bushfirePlanningArea && (
              <PropertyItem label="Planning Area" value={data.bushfirePlanningArea} />
            )}
          </PropertyCard>

          {/* Constraints */}
          <PropertyCard title="Constraints & Overlays" icon={<Shield className="w-8 h-8" />}>
            <PropertyItem
              label="Heritage"
              value={data.heritage}
              status={heritageStatus}
            />
            {data.heritageState && (
              <PropertyItem
                label="State Register"
                value={`${data.heritageState}${data.heritageStateId ? ` (Place No. ${data.heritageStateId})` : ""}`}
                status="warning"
              />
            )}
            {data.heritageLocal && (
              <PropertyItem label="Local Heritage" value={data.heritageLocal} status="warning" />
            )}
            <PropertyItem label="Flood Risk" value={data.floodRisk} status={floodStatus} />
            <PropertyItem label="Contamination" value={data.contamination} />
            {data.acidSulfateSoil && data.acidSulfateSoil !== "Unknown" && (
              <PropertyItem label="Acid Sulfate Soil" value={data.acidSulfateSoil} />
            )}
            {data.publicDrinkingWater && data.publicDrinkingWater !== "Unknown" && (
              <PropertyItem label="Drinking Water Area" value={data.publicDrinkingWater} />
            )}
            {data.aboriginalHeritage && data.aboriginalHeritage !== "Unknown" && (
              <PropertyItem label="Aboriginal Heritage" value={data.aboriginalHeritage} />
            )}
            {data.airportNoiseBuf && (
              <PropertyItem label="Airport Noise" value={data.airportNoiseBuf} status="warning" />
            )}
            {data.roadRailNoiseBuf && (
              <PropertyItem label="Road/Rail Noise" value={data.roadRailNoiseBuf} status="warning" />
            )}
          </PropertyCard>

          {/* Soil */}
          {data.soilType && data.soilType !== "Unknown" && (
            <PropertyCard title="Soil Classification" icon={<Building2 className="w-8 h-8" />}>
              <PropertyItem label="Soil Type" value={data.soilType} />
            </PropertyCard>
          )}

          {/* Location & Elevation (external APIs) */}
          {(data.elevationM != null || data.postcode || data.sa2Name || data.roadClassification) && (
            <PropertyCard title="Location & Elevation" icon={<MapPin className="w-8 h-8" />}>
              {data.elevationM != null && (
                <PropertyItem label="Site Elevation" value={`${data.elevationM} m AHD`} />
              )}
              {data.postcode && (
                <PropertyItem label="Postcode" value={data.postcode} />
              )}
              {data.sa2Name && (
                <PropertyItem label="Statistical Area" value={data.sa2Name} />
              )}
              {data.roadClassification && (
                <PropertyItem label="Road Class" value={
                  data.roadNetworkType
                    ? `${data.roadClassification} (${data.roadNetworkType})`
                    : data.roadClassification
                } />
              )}
            </PropertyCard>
          )}
        </div>
      </div>

      {/* Report Generator */}
      <div className="bg-gray-50 rounded-2xl p-8 text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Generate Site Report</h3>
        <p className="text-gray-600 mb-6">
          R-code, BAL, heritage, flood, contamination and overlay summary
        </p>
        <Button
          onClick={handleExportReport}
          className="bg-gradient-to-r from-nexamap-500 to-nexamap-600 hover:from-nexamap-600 hover:to-nexamap-700 text-white font-medium px-8 py-3"
        >
          <Download className="w-5 h-5 mr-2" />
          Export Site Report (PDF)
        </Button>
      </div>
    </div>
  );
}
