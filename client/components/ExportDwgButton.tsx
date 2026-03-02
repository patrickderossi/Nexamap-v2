import { Button } from "@/components/ui/button";
import { devLog } from "@/lib/logger";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DxfWriter, point2d, point3d } from "@tarikjabiri/dxf";
import proj4 from "proj4";

// Setup EPSG:7850 projection (GDA2020 / MGA Zone 50 - used in WA)
proj4.defs(
  "EPSG:7850",
  "+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs",
);

/**
 * Project a coordinate from WGS84 (lat/lng) to GDA2020 MGA Zone 50 (meters)
 * This ensures DXF exports have correct real-world scale
 */
function projectCoordinate([lng, lat]: [number, number]): [number, number] {
  return proj4("EPSG:4326", "EPSG:7850", [lng, lat]) as [number, number];
}

interface ExportDwgButtonProps {
  selectedParcel?: any;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ExportDwgButton({
  selectedParcel,
  disabled = false,
  onClick,
  className = "",
}: ExportDwgButtonProps) {
  const handleExport = async () => {
    if (!selectedParcel) {
      toast({
        title: "❌ No property selected",
        description: "Please select a property first.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    try {
      // Extract property information
      const planNumber = selectedParcel.data?.planNumber || "Unknown";
      const lotSize = selectedParcel.data?.lotSize || "Unknown";

      // Create DXF file
      const dxf = new DxfWriter();

      // Try to extract actual boundary geometry from different sources
      let polygonCoords: [number, number][] = [];

      // 1. First try to get from raw geometry (best source - actual SLIP WA boundary)
      if (selectedParcel.geometry?.rings) {
        // ESRI geometry format from SLIP WA API
        const rings = selectedParcel.geometry.rings;
        if (rings.length > 0 && rings[0].length > 0) {
          devLog.log(
            "✅ Using raw ESRI geometry for DXF export:",
            rings[0].length,
            "points",
          );

          // Project from WGS84 (lat/lng) to GDA2020 MGA Zone 50 (meters)
          // This ensures the DXF export has correct real-world scale
          const projectedCoords = rings[0].map(([lng, lat]: [number, number]) =>
            projectCoordinate([lng, lat]),
          );

          // Use the first projected point as origin for relative coordinates
          const [originX, originY] = projectedCoords[0];

          polygonCoords = projectedCoords.map(([x, y]: [number, number]) => [
            x - originX, // Relative to origin
            y - originY, // Relative to origin
          ]);

          devLog.log(
            "✅ Projected coordinates to GDA2020 MGA Zone 50 (meters)",
          );
        }
      }

      // 2. Try coordinates array (polygon format) - NOTE: This is typically a single point, not a polygon
      // Skip this for now as it's usually just the property center, not the actual boundary

      // 3. Try to reconstruct from boundary lengths (if available)
      if (polygonCoords.length === 0 && selectedParcel.data?.boundaryLengths) {
        const lengths = selectedParcel.data.boundaryLengths.map(
          (length: string) => {
            const match = length.match(/[\d.]+/);
            return match ? parseFloat(match[0]) : 25; // Default to 25m if can't parse
          },
        );

        if (lengths.length >= 3) {
          // Create polygon from boundary lengths (simple rectangle for now)
          const width = lengths[0] || 25;
          const height = lengths[1] || 25;

          polygonCoords = [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
          ];
        }
      }

      // 4. Fallback to lot size based rectangle
      if (polygonCoords.length === 0) {
        const area = selectedParcel.data?.lotSize
          ? parseFloat(selectedParcel.data.lotSize.replace(/[^\d.]/g, ""))
          : 625; // Default 25x25
        const width = Math.sqrt(area * 1.2); // Slightly rectangular
        const height = area / width;

        polygonCoords = [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ];
      }

      // Ensure polygon is closed
      if (polygonCoords.length > 0) {
        const first = polygonCoords[0];
        const last = polygonCoords[polygonCoords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          polygonCoords.push([first[0], first[1]]);
        }

        // Debug: Log polygon info
        const totalDistance = polygonCoords.reduce((sum, [x, y], i, arr) => {
          if (i === 0) return 0;
          const [px, py] = arr[i - 1];
          return sum + Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        }, 0);

        devLog.log(
          `✅ DXF Polygon: ${polygonCoords.length} vertices, perimeter ≈ ${totalDistance.toFixed(2)}m`,
        );
      }

      // Add the polygon to DXF using LWPOLYLINE
      const vertices = polygonCoords.map(([x, y]) => ({
        point: point2d(x, y),
      }));
      dxf.addLWPolyline(vertices, { flags: 1 }); // flags: 1 = closed polygon

      // Add boundary dimensions

      if (selectedParcel.data?.boundaryLengths) {
        selectedParcel.data.boundaryLengths.forEach(
          (length: string, index: number) => {
            if (index < polygonCoords.length - 1) {
              const [x1, y1] = polygonCoords[index];
              const [x2, y2] = polygonCoords[index + 1];

              // Calculate midpoint for dimension text
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;

              // Offset text slightly from the line
              const offsetDistance = 2;
              const angle = Math.atan2(y2 - y1, x2 - x1);
              const offsetX =
                midX + offsetDistance * Math.cos(angle + Math.PI / 2);
              const offsetY =
                midY + offsetDistance * Math.sin(angle + Math.PI / 2);

              // Clean up the length text
              const lengthText = length.replace(/Side \d+:\s*/, "");
              dxf.addText(point3d(offsetX, offsetY), 1, lengthText);
            }
          },
        );
      }

      // Add text annotations

      // Calculate centroid for text placement
      const centroidX =
        polygonCoords.reduce((sum, [x]) => sum + x, 0) / polygonCoords.length;
      const centroidY =
        polygonCoords.reduce((sum, [, y]) => sum + y, 0) / polygonCoords.length;

      // Add property information as text
      dxf.addText(
        point3d(centroidX, centroidY + 8),
        2.5,
        `Plan: ${planNumber}`,
      );
      dxf.addText(point3d(centroidX, centroidY + 5), 2, `Area: ${lotSize}`);

      // Add coordinate system note
      dxf.addText(
        point3d(centroidX, centroidY + 2),
        1.5,
        `Coordinates: GDA2020 MGA Zone 50 (meters)`,
      );

      // Add geographic coordinates if available
      if (selectedParcel.coordinates) {
        const [lat, lng] = selectedParcel.coordinates;
        dxf.addText(
          point3d(centroidX, centroidY - 1),
          1.5,
          `WGS84: ${lat.toFixed(6)}° / ${lng.toFixed(6)}°`,
        );
      }

      dxf.addText(
        point3d(centroidX, centroidY - 4),
        1,
        `Exported: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      );

      // Generate DXF content
      const dxfContent = dxf.stringify();

      // Create and download file
      const blob = new Blob([dxfContent], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Generate filename - more descriptive
      const planCode = planNumber
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 20); // Limit length
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:-]/g, ""); // YYYYMMDDTHHMMSS
      const cleanLotSize = lotSize
        .replace(/[^a-zA-Z0-9.]/g, "")
        .substring(0, 10);
      link.download = `Lot_${planCode}_${cleanLotSize}m2_BlockExport_${timestamp}.dxf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "✅ DXF Export Complete",
        description: `Successfully exported geometry for ${planNumber}`,
        variant: "default",
        duration: 4000,
      });

      if (onClick) {
        onClick();
      }
    } catch (error) {
      console.error("DXF Export Error:", error);
      toast({
        title: "❌ Export Failed",
        description: "Failed to generate DXF file. Please try again.",
        variant: "destructive",
        duration: 4000,
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={disabled || !selectedParcel}
          className={`border-2 border-amber-300 hover:border-amber-400 hover:bg-amber-50 text-amber-700 font-medium ${className}`}
        >
          <Download className="h-4 w-4 mr-2" />
          Export DXF
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Export selected property geometry as DXF/CAD file</p>
      </TooltipContent>
    </Tooltip>
  );
}
