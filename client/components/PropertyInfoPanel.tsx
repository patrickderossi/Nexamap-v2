import { useState } from "react";
import {
  MapPin,
  House,
  Zap,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { generateSoilReport, getSoilSummary } from "@/lib/soil-classifier";
import { PropertyItem } from "./PropertyCard";
import { FeedbackModal } from "./FeedbackModal";
import type { SelectedParcel, PropertyData } from "../../shared/types";

interface PropertyInfoPanelProps {
  selectedParcel: SelectedParcel | null;
  address?: string;
  data?: PropertyData | null;
}

export function PropertyInfoPanel({
  selectedParcel,
  address,
  data,
}: PropertyInfoPanelProps) {
  // Extract data from selectedParcel if not provided directly
  const propertyData = data || selectedParcel?.data;

  if (!address) {
    return (
      <div className="p-4 text-center text-gray-500 mt-8">
        <MapPin className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>Search for a property to see detailed analysis</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Cadastral Information */}
      {selectedParcel?.data?.cadastralInfo && (
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="flex items-center space-x-2 mb-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900 text-sm">
              Cadastral Information
            </h3>
          </div>
          <div className="space-y-2">
            {selectedParcel.data.cadastralInfo.land_id && (
              <PropertyItem
                label="Land ID"
                value={selectedParcel.data.cadastralInfo.land_id.toString()}
              />
            )}
            <PropertyItem
              label="Address"
              value={`${selectedParcel.data.cadastralInfo.road_number_1 || ""} ${selectedParcel.data.cadastralInfo.road_name || ""} ${selectedParcel.data.cadastralInfo.road_type || ""}, ${selectedParcel.data.cadastralInfo.locality || ""}`
                .replace(/\s+/g, " ")
                .trim()}
            />
            {selectedParcel.data.cadastralInfo.lot_number && (
              <PropertyItem
                label="Lot Number"
                value={selectedParcel.data.cadastralInfo.lot_number}
              />
            )}
          </div>
        </div>
      )}

      {/* Lot Details */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center space-x-2 mb-2">
          <House className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-gray-900 text-sm">Lot Details</h3>
        </div>
        <div className="space-y-2">
          <PropertyItem
            label="Lot Size"
            value={propertyData?.lotSize || "Unknown"}
          />
        </div>
      </div>

      {/* Zoning */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center space-x-2 mb-2">
          <Zap className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-gray-900 text-sm">
            Zoning & Land Use
          </h3>
        </div>
        <div className="space-y-2">
          <PropertyItem
            label="R-Code"
            value={propertyData?.zoning || "Unknown"}
          />
        </div>
      </div>

      {/* Administrative */}
      {propertyData?.shire && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900 text-sm">
              Administrative
            </h3>
          </div>
          <div className="space-y-2">
            <PropertyItem
              label="Shire/Scheme"
              value={propertyData?.shire || "Unknown"}
            />
          </div>
        </div>
      )}

      {/* Bushfire Risk */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center space-x-2 mb-2">
          <Flame className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-gray-900 text-sm">Bushfire Risk</h3>
        </div>
        <PropertyItem
          label="BAL Rating"
          value={propertyData?.bushfire || "Unknown"}
          status={
            propertyData?.bushfire?.includes("In BAL Area")
              ? "warning"
              : "normal"
          }
        />
      </div>

      {/* Soil Type */}
      {propertyData?.soilType && propertyData.soilType !== "Unknown" && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center space-x-2">
            <House className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900 text-sm">
              Soil Classification
            </h3>
          </div>

          {/* Soil Summary */}
          <div className="bg-white rounded p-2 border border-gray-200">
            <p className="text-sm font-medium text-gray-900">
              {getSoilSummary(propertyData.soilType)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {propertyData.soilType}
            </p>
          </div>

          {/* Detailed Characteristics */}
          <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded p-2 border border-gray-200 max-h-[200px] overflow-y-auto">
            {generateSoilReport(propertyData.soilType)}
          </div>
        </div>
      )}

      {/* Feedback Button for Lot Data */}
      <div className="mt-6 flex justify-center">
        <FeedbackModal
          trigger={
            <button className="inline-flex items-center gap-2 text-xs font-medium rounded-md px-3 py-1.5 border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-blue-400 hover:text-blue-600 transition-all duration-200">
              💡 Suggest more lot data
            </button>
          }
          title="Suggest More Lot Data"
          description="Help us improve by suggesting additional lot data that would be valuable for your analysis."
          placeholder="What additional lot data would help with your land development analysis? (e.g., soil conditions, utilities, environmental factors, etc.)"
          feedbackType="lot-data"
          context={
            selectedParcel
              ? `
Property: ${address}
Lot Size: ${propertyData?.lotSize || "Unknown"}
Zoning: ${propertyData?.zoning || "Unknown"}
Plan Number: ${selectedParcel?.data?.planNumber || "Unknown"}
              `.trim()
              : "No property selected"
          }
        />
      </div>
    </div>
  );
}

