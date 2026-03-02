import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Home,
  Ruler,
  MapPin,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";
import {
  calculateSubdivisionCompliance,
  extractRCode,
  getRCodeDisplayString,
  getRCodeDisplayInfo,
  SubdivisionMode,
  getEffectiveMinLotArea,
} from "@/lib/zoning-requirements";
import { ZoningHelper } from "./ZoningHelper";
import { devLog } from "@/lib/logger";

export interface SubLot {
  id: string;
  area: number; // in m²
  perimeter: number; // in m
  isCompliant: boolean;
  geometry: any; // GeoJSON geometry
  color: string;
  lotNumber?: number; // For automatic labeling
  classification?: "private" | "common-property";
  name?: string; // The actual lot name (e.g., "Lot 1" or "CP")
}

export interface ParentLot {
  id: string;
  area: number; // in m²
  perimeter: number; // in m
  minLotSize: number; // in m²
  maxDwellings: number;
  address: string;
  planNumber: string;
  zoning: string; // This is the R-Code
  shire?: string; // This is the shire/scheme name
  geometry: any; // GeoJSON geometry
}

interface SubdivisionSidebarProps {
  parentLot?: ParentLot;
  subLots: SubLot[];
  onExport?: (format: "geojson" | "shp" | "csv" | "pdf") => void;
  className?: string;
}

export function SubdivisionSidebar({
  parentLot,
  subLots,
  onExport,
  className = "",
}: SubdivisionSidebarProps) {
  // Removed collapsed state - handled by parent DraggablePanel
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [subdivisionMode, setSubdivisionMode] =
    useState<SubdivisionMode>("strata");

  // Calculate zoning compliance using WA R-Code requirements (only for private lots)
  const privateLots = subLots.filter(
    (lot) => lot.classification !== "common-property",
  );
  const compliance =
    parentLot && privateLots.length > 0
      ? calculateSubdivisionCompliance(
          parentLot.zoning,
          privateLots.map((lot) => lot.area),
          "single", // Default to single dwellings, could be made configurable
          subdivisionMode,
        )
      : null;

  const subdivisionPossible = compliance?.isCompliant || false;

  const formatArea = (area: number) => {
    if (area >= 10000) {
      return `${(area / 10000).toFixed(2)} ha`;
    }
    return `${area.toLocaleString()} m²`;
  };

  const formatLength = (length: number) => {
    if (length >= 1000) {
      return `${(length / 1000).toFixed(2)} km`;
    }
    return `${length.toFixed(1)} m`;
  };

  // PDF Export function with map screenshot
  const handlePDFExport = async () => {
    if (!parentLot || subLots.length === 0) {
      return;
    }

    // Show loading indicator
    const loadingToast = document.createElement("div");
    loadingToast.innerHTML =
      "📊 Generating subdivision diagram for PDF report...";
    loadingToast.style.cssText =
      "position:fixed;top:20px;right:20px;background:#2563eb;color:white;padding:10px 15px;border-radius:8px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);";
    document.body.appendChild(loadingToast);

    // Generate SVG diagram of subdivision layout
    let subdivisionDiagramSvg = "";

    try {
      console.log(
        "📐 Generating SVG subdivision diagram from lot geometries...",
      );

      if (subLots.length > 0) {
        // Calculate bounding box for all lots
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        subLots.forEach((lot) => {
          if (lot.geometry && lot.geometry.coordinates) {
            const coords = lot.geometry.coordinates[0]; // Outer ring
            coords.forEach(([lng, lat]: [number, number]) => {
              minX = Math.min(minX, lng);
              minY = Math.min(minY, lat);
              maxX = Math.max(maxX, lng);
              maxY = Math.max(maxY, lat);
            });
          }
        });

        // Add parent lot boundary if available
        if (parentLot.geometry && parentLot.geometry.coordinates) {
          const coords = parentLot.geometry.coordinates[0];
          coords.forEach(([lng, lat]: [number, number]) => {
            minX = Math.min(minX, lng);
            minY = Math.min(minY, lat);
            maxX = Math.max(maxX, lng);
            maxY = Math.max(maxY, lat);
          });
        }

        // Add padding
        const padding = (maxX - minX) * 0.1;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const width = 600;
        const height = 400;
        const scaleX = width / (maxX - minX);
        const scaleY = height / (maxY - minY);
        const scale = Math.min(scaleX, scaleY);

        // Convert coordinates to SVG space
        const toSVG = (lng: number, lat: number) => [
          (lng - minX) * scale,
          height - (lat - minY) * scale, // Flip Y axis
        ];

        let svgContent = "";

        // Draw parent lot boundary
        if (parentLot.geometry && parentLot.geometry.coordinates) {
          const coords = parentLot.geometry.coordinates[0];
          const pathData =
            coords
              .map(([lng, lat]: [number, number], index: number) => {
                const [x, y] = toSVG(lng, lat);
                return `${index === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ") + " Z";

          svgContent += `<path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="3" stroke-dasharray="5,5"/>`;
        }

        // Draw individual lots (including common property zones)
        subLots.forEach((lot, index) => {
          if (lot.geometry && lot.geometry.coordinates) {
            const coords = lot.geometry.coordinates[0];
            const pathData =
              coords
                .map(([lng, lat]: [number, number], coordIndex: number) => {
                  const [x, y] = toSVG(lng, lat);
                  return `${coordIndex === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ") + " Z";

            // Determine colors based on lot classification and compliance
            let fillColor = "#d1fae5";
            let strokeColor = "#059669";

            if (lot.classification === "common-property") {
              // Common property zones: gray color
              fillColor = "#f3f4f6";
              strokeColor = "#6b7280";
            } else {
              // Private lots: check compliance
              const isCompliant = compliance?.requirements
                ? lot.area >=
                  (compliance.requirements.minLotArea ||
                    compliance.requirements.minSiteArea)
                : lot.isCompliant;

              fillColor = isCompliant ? "#d1fae5" : "#fee2e2";
              strokeColor = isCompliant ? "#059669" : "#dc2626";
            }

            svgContent += `<path d="${pathData}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>`;

            // Calculate centroid for label
            const centroidLng =
              coords.reduce((sum, [lng]) => sum + lng, 0) / coords.length;
            const centroidLat =
              coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length;
            const [labelX, labelY] = toSVG(centroidLng, centroidLat);

            // Add lot label (show "CP" for common property)
            const lotLabel =
              lot.classification === "common-property"
                ? "CP"
                : `Lot ${lot.lotNumber || index + 1}`;
            svgContent += `
              <text x="${labelX}" y="${labelY - 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="${strokeColor}">
                ${lotLabel}
              </text>
              <text x="${labelX}" y="${labelY + 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#374151">
                ${formatArea(lot.area)}
              </text>
            `;
          }
        });

        const commonPropertyCount = subLots.filter(
          (lot) => lot.classification === "common-property",
        ).length;
        const privateLotsCount = subLots.length - commonPropertyCount;

        subdivisionDiagramSvg = `
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${width}" height="${height}" fill="white" stroke="#e5e7eb" stroke-width="1"/>
            ${svgContent}
            <text x="10" y="20" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#374151">
              Subdivision Layout - ${privateLotsCount} ${privateLotsCount === 1 ? "Lot" : "Lots"}${commonPropertyCount > 0 ? ` + ${commonPropertyCount} Common Property` : ""}
            </text>
            <text x="10" y="${height - 10}" font-family="Arial, sans-serif" font-size="10" fill="#6b7280">
              Parent Lot: ${formatArea(parentLot.area)} | ${parentLot.planNumber}
            </text>
          </svg>
        `;

        console.log("✅ SVG subdivision diagram generated successfully");
        loadingToast.innerHTML = "📄 Generating PDF report...";
      } else {
        console.log("ℹ️ No lots to diagram");
        loadingToast.innerHTML =
          "📄 Generating PDF report (no subdivision layout)...";
      }
    } catch (error) {
      console.warn("❌ Failed to generate SVG diagram:", error);
      loadingToast.innerHTML =
        "📄 Generating PDF report (no layout diagram)...";
    }

    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Subdivision Analysis Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
          h1 { color: #2563eb; text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
          h2 { color: #374151; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 25px; }
          h3 { color: #1f2937; margin-top: 20px; }
          .header-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .compliance-pass { color: #059669; font-weight: bold; }
          .compliance-fail { color: #dc2626; font-weight: bold; }
          .summary { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
          .subdivision-diagram { text-align: center; margin: 20px 0; page-break-inside: avoid; }
          .subdivision-diagram svg { max-width: 100%; height: auto; border: 2px solid #2563eb; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background: white; }
          .diagram-caption { font-size: 12px; color: #6b7280; margin-top: 8px; font-style: italic; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
          th { background: #f9fafb; font-weight: bold; }
          .lot-compliant { background: #d1fae5; color: #065f46; }
          .lot-violation { background: #fee2e2; color: #991b1b; }
          .cp-area { background: #ecfccb; color: #365314; border-left: 3px solid #84cc16; }
          .violation-list { background: #fee2e2; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .recommendation-list { background: #dbeafe; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .mode-badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
          .mode-strata { background: #dbeafe; color: #1e40af; }
          .mode-green { background: #d1fae5; color: #065f46; }
          .currency { text-align: right; }
          .center { text-align: center; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 10px 0; }
          .grid-item { padding: 10px; border: 1px solid #d1d5db; border-radius: 5px; }
          .page-break { page-break-before: always; }
        </style>
      </head>
      <body>
        <h1>Subdivision Analysis Report</h1>

        <div class="header-info">
          <h3>Property Information</h3>
          <div class="grid">
            <div><strong>Address:</strong> ${parentLot.address}</div>
            <div><strong>Plan Number:</strong> ${parentLot.planNumber}</div>
            <div><strong>Shire:</strong> ${parentLot.shire || "Unknown"}</div>
            <div><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="grid">
            <div><strong>R-Code Zone:</strong> ${(() => {
              const rCodeInfo = getRCodeDisplayInfo(parentLot.zoning);
              return (
                rCodeInfo.mainDisplay +
                (rCodeInfo.calculationNote
                  ? ` (${rCodeInfo.calculationNote})`
                  : "")
              );
            })()}</div>
            <div><strong>Subdivision Mode:</strong>
              <span class="mode-badge ${subdivisionMode === "strata" ? "mode-strata" : "mode-green"}">
                ${subdivisionMode === "strata" ? "Strata" : "Green Title"}
              </span>
            </div>
          </div>
        </div>

        <div class="summary">
          <h3>Overall Compliance Status</h3>
          <div class="center">
            ${
              compliance?.isCompliant
                ? `<span class="compliance-pass">✅ COMPLIES with ${extractRCode(parentLot.zoning)} requirements</span>`
                : `<span class="compliance-fail">❌ VIOLATIONS FOUND - Does not comply with ${extractRCode(parentLot.zoning)} requirements</span>`
            }
          </div>
        </div>

        ${
          subdivisionDiagramSvg
            ? `
        <h2>Subdivision Layout</h2>
        <div class="subdivision-diagram">
          ${subdivisionDiagramSvg}
          <div class="diagram-caption">
            Schematic diagram showing ${subLots.length} lots with color-coded compliance status<br>
            <span style="color: #059669;">■</span> Compliant lots |
            <span style="color: #dc2626;">■</span> Non-compliant lots |
            <span style="color: #2563eb;">▓</span> Parent lot boundary
          </div>
        </div>
        `
            : ""
        }

        <h2>Parent Lot Details</h2>
        <table>
          <tr><th>Property</th><th>Value</th></tr>
          <tr><td>Total Area</td><td>${formatArea(parentLot.area)}</td></tr>
          <tr><td>Perimeter</td><td>${formatLength(parentLot.perimeter)}</td></tr>
          <tr><td>Zoning</td><td>${parentLot.zoning}</td></tr>
          <tr><td>Max Theoretical Lots</td><td>${compliance?.requirements ? Math.floor(parentLot.area / compliance.requirements.avgSiteArea) : parentLot.maxDwellings}</td></tr>
          <tr><td>Actual Lots Created</td><td>${subLots.length}</td></tr>
        </table>

        ${
          compliance?.requirements
            ? `
        <h2>Zoning Requirements (${extractRCode(parentLot.zoning)})</h2>
        <table>
          <tr><th>Requirement</th><th>Value</th></tr>
          <tr><td>Minimum Lot Size</td><td>${getEffectiveMinLotArea(compliance.requirements, subdivisionMode)}m² (${subdivisionMode})</td></tr>
          <tr><td>Average Site Area</td><td>${compliance.requirements.avgSiteArea}m²</td></tr>
          ${compliance.requirements.minFrontage ? `<tr><td>Minimum Frontage</td><td>${compliance.requirements.minFrontage}m</td></tr>` : ""}
        </table>
        `
            : ""
        }

        ${(() => {
          const privateLots = subLots.filter(
            (lot) => lot.classification !== "common-property",
          );
          const commonPropertyLots = subLots.filter(
            (lot) => lot.classification === "common-property",
          );

          return `
            <h2>Private Lots Analysis</h2>
            <table>
              <tr>
                <th>Lot Number</th>
                <th>Area</th>
                <th>Compliance Status</th>
                <th>Notes</th>
              </tr>
              ${privateLots
                .map((lot, index) => {
                  const isLotCompliant = compliance?.requirements
                    ? lot.area >=
                      (compliance.requirements.minLotArea ||
                        compliance.requirements.minSiteArea)
                    : lot.isCompliant;
                  return `
                  <tr class="${isLotCompliant ? "lot-compliant" : "lot-violation"}">
                    <td>${lot.name || `Lot ${lot.lotNumber || index + 1}`}</td>
                    <td>${formatArea(lot.area)}</td>
                    <td>${isLotCompliant ? "✅ Compliant" : "❌ Non-Compliant"}</td>
                    <td>${
                      !isLotCompliant && compliance?.requirements
                        ? `Below minimum ${getEffectiveMinLotArea(compliance.requirements, subdivisionMode)}m²`
                        : "Meets requirements"
                    }</td>
                  </tr>
                `;
                })
                .join("")}
            </table>

            ${
              commonPropertyLots.length > 0
                ? `
              <h2>Common Property (CP) Areas</h2>
              <table>
                <tr>
                  <th>Area Name</th>
                  <th>Area</th>
                  <th>Type</th>
                  <th>Notes</th>
                </tr>
                ${commonPropertyLots
                  .map(
                    (lot, index) => `
                  <tr class="cp-area">
                    <td>${lot.name || `CP ${index + 1}`}</td>
                    <td>${formatArea(lot.area)}</td>
                    <td>Common Property</td>
                    <td>Shared area - not subject to minimum lot size requirements</td>
                  </tr>
                `,
                  )
                  .join("")}
              </table>

              <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #0ea5e9;">
                <h4 style="margin: 0 0 10px 0; color: #0369a1;">📊 Common Property Summary</h4>
                <p style="margin: 5px 0;"><strong>Total CP Area:</strong> ${formatArea(commonPropertyLots.reduce((sum, lot) => sum + lot.area, 0))}</p>
                <p style="margin: 5px 0;"><strong>Number of CP Areas:</strong> ${commonPropertyLots.length}</p>
                <p style="margin: 5px 0; font-size: 12px; color: #64748b;"><em>Common Property areas include driveways, gardens, and shared facilities</em></p>
              </div>
            `
                : ""
            }
          `;
        })()}

        ${
          compliance
            ? `
        <h2>Statistical Summary</h2>

        ${(() => {
          const privateLots = subLots.filter(
            (lot) => lot.classification !== "common-property",
          );
          const commonPropertyLots = subLots.filter(
            (lot) => lot.classification === "common-property",
          );
          const totalSubdivisionArea = subLots.reduce(
            (sum, lot) => sum + lot.area,
            0,
          );
          const totalCPArea = commonPropertyLots.reduce(
            (sum, lot) => sum + lot.area,
            0,
          );

          return `
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h4 style="margin: 0 0 15px 0; color: #374151;">📈 Overall Subdivision Statistics</h4>
              <div class="grid">
                <div class="grid-item">
                  <strong>Total Parent Lot Area:</strong><br>
                  ${formatArea(parentLot.area)}
                </div>
                <div class="grid-item">
                  <strong>Total Subdivided Area:</strong><br>
                  ${formatArea(totalSubdivisionArea)}
                </div>
                <div class="grid-item">
                  <strong>Private Lots Area:</strong><br>
                  ${formatArea(compliance.totalArea)}
                </div>
                <div class="grid-item">
                  <strong>Common Property Area:</strong><br>
                  <span style="color: #059669;">${formatArea(totalCPArea)}</span>
                </div>
              </div>
            </div>

            <div style="background: #fefce8; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #eab308;">
              <h4 style="margin: 0 0 15px 0; color: #92400e;">📋 Private Lots Compliance (R-Code Analysis)</h4>
              <div class="grid">
                <div class="grid-item">
                  <strong>Number of Private Lots:</strong><br>
                  ${compliance.lotCount}
                </div>
                <div class="grid-item">
                  <strong>Average Private Lot Size:</strong><br>
                  <span class="${compliance.requirements && compliance.avgLotSize < compliance.requirements.avgSiteArea ? "compliance-fail" : "compliance-pass"}">
                    ${Math.round(compliance.avgLotSize)}m²
                  </span>
                </div>
                <div class="grid-item">
                  <strong>Smallest Private Lot:</strong><br>
                  <span class="${compliance.requirements && compliance.minLotSize < (compliance.requirements.minLotArea || compliance.requirements.minSiteArea) ? "compliance-fail" : "compliance-pass"}">
                    ${Math.round(compliance.minLotSize)}m²
                  </span>
                </div>
                <div class="grid-item">
                  <strong>Largest Private Lot:</strong><br>
                  ${Math.round(compliance.maxLotSize)}m²
                </div>
              </div>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #92400e;"><em>* Compliance calculations apply to private lots only. Common Property areas are exempt from minimum lot size requirements.</em></p>
            </div>
          `;
        })()}
        `
            : ""
        }

        ${
          compliance?.violations && compliance.violations.length > 0
            ? `
        <div class="page-break"></div>
        <h2>Zoning Violations</h2>
        <div class="violation-list">
          <ul>
            ${compliance.violations.map((violation) => `<li>${violation}</li>`).join("")}
          </ul>
        </div>
        `
            : ""
        }

        ${
          compliance?.recommendations && compliance.recommendations.length > 0
            ? `
        <h2>Recommendations</h2>
        <div class="recommendation-list">
          <ul>
            ${compliance.recommendations.map((rec) => `<li>${rec}</li>`).join("")}
          </ul>
        </div>
        `
            : ""
        }

        <div class="summary">
          <h3>Report Summary</h3>
          <p><strong>Property:</strong> ${parentLot.address}</p>
          <p><strong>Analysis Date:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Subdivision Type:</strong> ${subdivisionMode === "strata" ? "Strata Title" : "Green Title"}</p>
          <p><strong>Compliance:</strong> ${compliance?.isCompliant ? "COMPLIANT" : "NON-COMPLIANT"}</p>
          <p><strong>Lots Created:</strong> ${subLots.length} lots from ${formatArea(parentLot.area)} parent lot</p>
        </div>

        <footer style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #d1d5db; text-align: center; color: #6b7280; font-size: 12px;">
          <p>This report was generated automatically based on WA R-Code requirements.</p>
          <p>Professional verification recommended before proceeding with subdivision.</p>
          ${subdivisionDiagramSvg ? "<p>Subdivision diagram generated from actual lot geometries.</p>" : ""}
        </footer>
      </body>
      </html>
    `;

    // Remove loading indicator
    document.body.removeChild(loadingToast);

    // Create a new window and print as PDF
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(reportHTML);
      printWindow.document.close();

      // Wait for content to load, then trigger print
      printWindow.addEventListener("load", () => {
        printWindow.print();
        // Close window after printing
        printWindow.addEventListener("afterprint", () => {
          printWindow.close();
        });
      });
    }
  };

  // Removed collapsed UI - handled by parent DraggablePanel

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ${className}`}
    >
      <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
        {/* Subdivision Mode Toggle */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-900 mb-2">
            Subdivision Mode
          </h4>
          <div className="flex bg-white border border-blue-200 rounded-md p-1">
            <button
              onClick={() => setSubdivisionMode("strata")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                subdivisionMode === "strata"
                  ? "bg-blue-600 text-white"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              Strata
            </button>
            <button
              onClick={() => setSubdivisionMode("green-title")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                subdivisionMode === "green-title"
                  ? "bg-blue-600 text-white"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              Green Title
            </button>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            {subdivisionMode === "strata"
              ? "Standard strata subdivision with shared common property"
              : "Green title subdivision (battleaxe, split lots) with separate titles"}
          </p>
        </div>

        {/* Parent Lot Information */}
        {parentLot && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Parent Lot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Area:</span>
                  <p className="font-medium">{formatArea(parentLot.area)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Perimeter:</span>
                  <p className="font-medium">
                    {formatLength(parentLot.perimeter)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">R-Code:</span>
                  {(() => {
                    const rCodeInfo = getRCodeDisplayInfo(parentLot.zoning);
                    return (
                      <div>
                        <p className="font-medium">{rCodeInfo.mainDisplay}</p>
                        {rCodeInfo.calculationNote && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            ({rCodeInfo.calculationNote})
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <span className="text-gray-600">Max Theoretical Lots:</span>
                  <p className="font-medium">
                    {compliance?.requirements
                      ? Math.floor(
                          parentLot.area / compliance.requirements.avgSiteArea,
                        )
                      : parentLot.maxDwellings}
                  </p>
                </div>
              </div>
              <div className="pt-1">
                <span className="text-gray-600 text-sm">Address:</span>
                <p className="font-medium text-sm">{parentLot.address}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Shire:</span>
                <p className="font-medium text-sm">
                  {parentLot.shire || "Unknown"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sub-Lots by Classification */}
        {subLots.length > 0 &&
          (() => {
            const privateLots = subLots.filter(
              (lot) => lot.classification !== "common-property",
            );
            const commonPropertyAreas = subLots.filter(
              (lot) => lot.classification === "common-property",
            );

            return (
              <>
                {/* Private Lots */}
                {privateLots.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        Private Lots ({privateLots.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {/* Table Header */}
                        <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-600 border-b pb-1">
                          <span>Lot #</span>
                          <span>Area</span>
                          <span>Status</span>
                          <span>Color</span>
                        </div>

                        {/* Table Rows */}
                        {privateLots.map((lot, index) => {
                          // Check individual lot compliance against zoning requirements
                          const isLotCompliant = compliance?.requirements
                            ? lot.area >=
                              (compliance.requirements.minLotArea ||
                                compliance.requirements.minSiteArea)
                            : lot.isCompliant;

                          return (
                            <div
                              key={lot.id}
                              className="grid grid-cols-4 gap-2 text-sm items-center"
                            >
                              <span className="font-medium">
                                {lot.name ||
                                  `Lot ${lot.lotNumber || index + 1}`}
                              </span>
                              <span>{formatArea(lot.area)}</span>
                              <div>
                                {isLotCompliant ? (
                                  <Badge
                                    variant="default"
                                    className="bg-green-100 text-green-800 hover:bg-green-100"
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    OK
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="destructive"
                                    className="bg-red-100 text-red-800 hover:bg-red-100"
                                  >
                                    <X className="h-3 w-3 mr-1" />
                                    Fail
                                  </Badge>
                                )}
                              </div>
                              <div
                                className="w-4 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: lot.color }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Common Property Areas */}
                {commonPropertyAreas.length > 0 && (
                  <Card className="border-green-200 bg-green-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-green-800">
                        <Ruler className="h-4 w-4" />
                        Common Property ({commonPropertyAreas.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {/* Table Header */}
                        <div className="grid grid-cols-4 gap-2 text-xs font-medium text-green-700 border-b border-green-300 pb-1">
                          <span>Area #</span>
                          <span>Area</span>
                          <span>Type</span>
                          <span>Color</span>
                        </div>

                        {/* Table Rows */}
                        {commonPropertyAreas.map((area, index) => (
                          <div
                            key={area.id}
                            className="grid grid-cols-4 gap-2 text-sm items-center"
                          >
                            <span className="font-medium text-green-800">
                              {area.name || "CP"}
                            </span>
                            <span className="text-green-800">
                              {formatArea(area.area)}
                            </span>
                            <div>
                              <Badge
                                variant="outline"
                                className="border-green-300 text-green-800 bg-green-100"
                              >
                                Common
                              </Badge>
                            </div>
                            <div
                              className="w-4 h-4 rounded border border-green-400"
                              style={{ backgroundColor: area.color }}
                            />
                          </div>
                        ))}

                        {/* Common Property Summary */}
                        <div className="mt-3 pt-2 border-t border-green-300 bg-green-100 rounded p-2">
                          <div className="text-xs text-green-800">
                            <strong>Total Common Property:</strong>{" "}
                            {formatArea(
                              commonPropertyAreas.reduce(
                                (sum, area) => sum + area.area,
                                0,
                              ),
                            )}
                          </div>
                          <div className="text-xs text-green-700 mt-1">
                            Includes driveways, access ways, and shared
                            facilities
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}

        {/* Zoning Compliance Summary */}
        {subLots.length > 0 && compliance && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                R-Code Compliance Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Overall Status */}
              <div className="text-center">
                {compliance.isCompliant ? (
                  <Badge
                    variant="default"
                    className="bg-green-100 text-green-800 hover:bg-green-100 px-4 py-2"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complies with {extractRCode(parentLot?.zoning || "")} ✅
                  </Badge>
                ) : (
                  <Badge
                    variant="destructive"
                    className="bg-red-100 text-red-800 hover:bg-red-100 px-4 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Zoning Violations ❌
                  </Badge>
                )}
              </div>

              {/* Zoning Requirements */}
              {compliance.requirements && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">
                    {extractRCode(parentLot?.zoning || "")} Requirements
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                    <div>
                      <span>Min Lot Size:</span>
                      <p className="font-medium">
                        {getEffectiveMinLotArea(
                          compliance.requirements,
                          subdivisionMode,
                        )}
                        m²
                      </p>
                      <p className="text-xs text-blue-500 mt-0.5">
                        {subdivisionMode === "strata"
                          ? "Strata"
                          : "Green Title"}
                      </p>
                    </div>
                    <div>
                      <span>Avg Site Area:</span>
                      <p className="font-medium">
                        {compliance.requirements.avgSiteArea}m²
                      </p>
                    </div>
                    {compliance.requirements.minFrontage && (
                      <div>
                        <span>Min Frontage:</span>
                        <p className="font-medium">
                          {compliance.requirements.minFrontage}m
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Statistics */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Private Area:</span>
                  <p className="font-medium">
                    {formatArea(compliance.totalArea)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Private Lots:</span>
                  <p className="font-medium">{compliance.lotCount} lots</p>
                </div>
                <div>
                  <span className="text-gray-600">Common Property:</span>
                  <p className="font-medium text-green-600">
                    {formatArea(
                      subLots
                        .filter(
                          (lot) => lot.classification === "common-property",
                        )
                        .reduce((sum, lot) => sum + lot.area, 0),
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Total Subdivision:</span>
                  <p className="font-medium">
                    {formatArea(
                      subLots.reduce((sum, lot) => sum + lot.area, 0),
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Average Lot Size:</span>
                  <p
                    className={`font-medium ${
                      compliance.requirements &&
                      compliance.avgLotSize <
                        compliance.requirements.avgSiteArea
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {Math.round(compliance.avgLotSize)}m²
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Smallest Lot:</span>
                  <p
                    className={`font-medium ${
                      compliance.requirements &&
                      compliance.minLotSize <
                        (compliance.requirements.minLotArea ||
                          compliance.requirements.minSiteArea)
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {Math.round(compliance.minLotSize)}m²
                  </p>
                </div>
              </div>

              {/* Violations */}
              {compliance.violations.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-red-900 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Violations ({compliance.violations.length})
                  </h4>
                  <ul className="text-xs text-red-800 space-y-1">
                    {compliance.violations.map((violation, index) => (
                      <li key={index} className="flex items-start gap-1">
                        <span className="text-red-600 mt-0.5">•</span>
                        {violation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {compliance.recommendations.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-1">
                    <Info className="h-4 w-4" />
                    Recommendations
                  </h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    {compliance.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start gap-1">
                        <span className="text-blue-600 mt-0.5">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* R-Code Reference */}
        <ZoningHelper
          currentRCode={
            parentLot ? extractRCode(parentLot.zoning) || undefined : undefined
          }
          subdivisionMode={subdivisionMode}
        />

        {/* Export Options */}
        {subLots.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePDFExport}
                  className="text-xs bg-red-600 hover:bg-red-700"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  PDF Report
                </Button>
                {onExport && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport("geojson")}
                      className="text-xs"
                    >
                      GeoJSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport("shp")}
                      className="text-xs"
                    >
                      Shapefile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport("csv")}
                      className="text-xs"
                    >
                      CSV
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {!parentLot && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <p className="text-sm text-blue-800">
                Enable subdivision mode and click on a lot to begin analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
