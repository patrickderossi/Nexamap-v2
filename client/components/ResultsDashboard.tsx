import { Home, Zap, Flame, Shield, Download } from "lucide-react";
import { PropertyCard, PropertyItem } from "./PropertyCard";
import { MapViewer } from "./MapViewer";
import { Button } from "@/components/ui/button";

interface PropertyData {
  lotSize: string;
  lotDimensions: string;
  planNumber: string;
  zoning: string;
  bushfire: string;
  heritage: string;
  floodRisk: string;
  contamination: string;
  easements: string;
  coordinates?: [number, number];
}

interface ResultsDashboardProps {
  data: PropertyData;
  address: string;
}

export function ResultsDashboard({ data, address }: ResultsDashboardProps) {
  const handleExportReport = () => {
    // TODO: Implement PDF export
    console.log('Exporting report for:', address);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Address Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Site Analysis Results</h2>
        <p className="text-gray-600">{address}</p>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        {/* Left Column - Map */}
        <div>
          <MapViewer address={address} coordinates={data.coordinates} />
        </div>

        {/* Right Column - Property Data Cards */}
        <div className="space-y-6">
          {/* Lot Details Card */}
          <PropertyCard
            title="Lot Details"
            icon={<Home className="w-8 h-8" />}
          >
            <PropertyItem label="Lot Size" value={data.lotSize} />
            <PropertyItem label="Dimensions" value={data.lotDimensions} />
          </PropertyCard>

          {/* Zoning Card */}
          <PropertyCard
            title="Zoning"
            icon={<Zap className="w-8 h-8" />}
          >
            <PropertyItem label="R-Code" value={data.zoning} />
          </PropertyCard>

          {/* Bushfire Risk Card */}
          <PropertyCard
            title="Bushfire Risk"
            icon={<Flame className="w-8 h-8" />}
          >
            <PropertyItem 
              label="BAL Rating" 
              value={data.bushfire}
              status={data.bushfire.includes('High') ? 'danger' : 'normal'}
            />
          </PropertyCard>

          {/* Overlays & Constraints Card */}
          <PropertyCard
            title="Overlays & Constraints"
            icon={<Shield className="w-8 h-8" />}
          >
            <PropertyItem 
              label="Heritage" 
              value={data.heritage}
              status={data.heritage === 'Yes' ? 'warning' : 'normal'}
            />
            <PropertyItem 
              label="Flood Risk" 
              value={data.floodRisk}
              status={data.floodRisk.includes('Moderate') ? 'warning' : 'normal'}
            />
            <PropertyItem label="Contamination" value={data.contamination} />
            <PropertyItem label="Easements" value={data.easements} />
          </PropertyCard>
        </div>
      </div>

      {/* Report Generator Section */}
      <div className="bg-gray-50 rounded-2xl p-8 text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Generate Site Report</h3>
        <p className="text-gray-600 mb-6">
          Includes zoning, BAL, heritage and overlays summary
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
