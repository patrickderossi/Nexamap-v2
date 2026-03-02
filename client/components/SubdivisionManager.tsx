import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import * as turf from "@turf/turf";
import { SubdivisionToolbar, SubdivisionMode } from "./SubdivisionToolbar";
import { SubdivisionSidebar, SubLot, ParentLot } from "./SubdivisionSidebar";
import { DraggablePanel } from "./DraggablePanel";
import {
  robustPolygonSplitAsync,
  robustPolygonSplit,
} from "@/lib/polygon-operations";
import { getZoningRequirements, extractRCode } from "@/lib/zoning-requirements";
import { toast } from "@/hooks/use-toast";
import { queryPlanningData, fetchCadastralFeature } from "@/lib/slip-wa-api";
import { devLog } from "@/lib/logger";
import type { SelectedParcel } from "../../shared/types";

interface SubdivisionManagerProps {
  map: L.Map | null;
  subdivisionMode: SubdivisionMode;
  selectedParcel?: SelectedParcel;
  onModeChange?: (mode: SubdivisionMode) => void;
  onSplitsChange?: (hasActiveSplits: boolean) => void;
  onLotsChange?: (hasGeneratedLots: boolean) => void;
  onClearLines?: () => void;
  onGenerateLots?: () => void;
}

interface DrawnLine {
  id: string;
  geometry: L.Polyline;
  coordinates: [number, number][];
}

interface GeneratedLot {
  id: string;
  name: string;
  area: number;
  geometry: any;
  color: string;
  originalColor: string; // Preserve original color for restoration
  classification: "private" | "common-property";
}

export function SubdivisionManager({
  map,
  subdivisionMode,
  selectedParcel,
  onModeChange,
  onSplitsChange,
  onLotsChange,
  onClearLines,
  onGenerateLots,
}: SubdivisionManagerProps) {
  const [parentLot, setParentLot] = useState<ParentLot | undefined>();
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const [generatedLots, setGeneratedLots] = useState<GeneratedLot[]>([]);

  // Drawing state
  const [currentDrawingPoint, setCurrentDrawingPoint] =
    useState<L.LatLng | null>(null);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snapPoint, setSnapPoint] = useState<L.LatLng | null>(null);
  const [nearestCornerDistance, setNearestCornerDistance] = useState<
    number | null
  >(null);

  // Refs for map layers
  const parentLotLayerRef = useRef<L.GeoJSON | null>(null);
  const drawnLineLayersRef = useRef<L.Polyline[]>([]);
  const generatedLotLayersRef = useRef<L.Layer[]>([]);

  // Visual feedback refs
  const rubberBandLineRef = useRef<L.Polyline | null>(null);
  const snapIndicatorRef = useRef<L.CircleMarker | null>(null);
  const startPointIndicatorRef = useRef<L.CircleMarker | null>(null);
  const distanceIndicatorRef = useRef<L.Marker | null>(null);

  // Colors for generated lots
  const LOT_COLORS = [
    "#3B82F6",
    "#EF4444",
    "#10B981",
    "#F59E0B",
    "#8B5CF6",
    "#F97316",
    "#06B6D4",
    "#84CC16",
    "#EC4899",
    "#6B7280",
  ];

  // Classification colors
  const CLASSIFICATION_COLORS = {
    private: "#3B82F6",
    "common-property": "#059669",
  };

  // When subdivision mode changes, handle cleanup
  useEffect(() => {
    if (!subdivisionMode.active) {
      clearAllLayers();
      setParentLot(undefined);
      setDrawnLines([]);
      setGeneratedLots([]);
      setCurrentDrawingPoint(null);
      setIsSnapping(false);
      setSnapPoint(null);
    }
  }, [subdivisionMode.active]);

  // When a parcel is selected and we're in subdivision mode, use it as parent lot
  useEffect(() => {
    if (subdivisionMode.active && selectedParcel && !parentLot) {
      convertSelectedParcelToParentLot();
    }
  }, [subdivisionMode, selectedParcel, parentLot]);

  // Convert the currently selected parcel to a parent lot for subdivision
  const convertSelectedParcelToParentLot = async () => {
    if (!selectedParcel || !map) {
      devLog.log("❌ Cannot convert parcel - missing selectedParcel or map");
      return;
    }

    devLog.log("🔄 Converting selected parcel to parent lot:", selectedParcel);
    const { data: propertyData, coordinates, address } = selectedParcel;

    try {
      const feature = await fetchCadastralFeature({ coordinates });

      if (feature && feature.geometry?.rings) {
        const geoJsonGeometry = {
          type: "Polygon" as const,
          coordinates: feature.geometry.rings,
        };

        const area = turf.area({
          type: "Feature",
          geometry: geoJsonGeometry,
          properties: {},
        });

        const perimeter = turf.length(
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: feature.geometry.rings[0],
            },
            properties: {},
          },
          { units: "meters" },
        );

        devLog.log("🔍 SubdivisionManager propertyData:", propertyData);

        let zoning = propertyData?.zoning || propertyData?.rCode || "R30";
        let rCode = extractRCode(zoning);

        if (zoning && zoning.match(/^R\d+/)) {
          rCode = extractRCode(zoning) || zoning;
        }

        devLog.log("📋 SubdivisionManager zoning input:", zoning);
        devLog.log("📋 SubdivisionManager extracted rCode:", rCode);

        if (!rCode && coordinates) {
          try {
            devLog.log(
              "🔍 No R-Code found, querying Planning Layer directly...",
            );
            const planningData = await queryPlanningData({ coordinates });
            if (planningData.rCode) {
              zoning = planningData.rCode;
              rCode = extractRCode(planningData.rCode);
              devLog.log(
                "✅ Got R-Code from direct query:",
                planningData.rCode,
              );
            }
          } catch (error) {
            devLog.warn("❌ Failed to query Planning Layer:", error);
          }
        }

        let minLotSize = 300;
        let maxDwellings = Math.floor(area / minLotSize);

        if (rCode) {
          const requirements = getZoningRequirements(rCode, "single");
          if (requirements.length > 0) {
            const requirement = requirements[0];
            minLotSize = requirement.minLotArea || requirement.minSiteArea;
            maxDwellings = Math.floor(area / requirement.avgSiteArea);
          }
        }

        const newParentLot: ParentLot = {
          id: `lot_${feature.attributes.OBJECTID || Date.now()}`,
          area: Math.round(area),
          perimeter: Math.round(perimeter),
          minLotSize,
          maxDwellings,
          address:
            address ||
            `${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}`,
          planNumber:
            feature.attributes.PLAN_NO ||
            propertyData?.planNumber ||
            "Unknown",
          zoning,
          shire:
            propertyData?.shire || propertyData?.zoning || "Unknown Shire",
          geometry: geoJsonGeometry,
        };

        if (parentLotLayerRef.current) {
          map.removeLayer(parentLotLayerRef.current);
        }

        const parentFeature: GeoJSON.Feature = {
          type: "Feature",
          geometry: geoJsonGeometry,
          properties: {},
        };

        parentLotLayerRef.current = L.geoJSON(parentFeature, {
          style: {
            color: "#2563EB",
            weight: 3,
            opacity: 1,
            fillOpacity: 0.1,
            fillColor: "#2563EB",
          },
          smoothFactor: 0,
        }).addTo(map);

        setParentLot(newParentLot);
        setDrawnLines([]);
        setGeneratedLots([]);

        devLog.log(
          "✅ Parent lot created from selected parcel:",
          newParentLot,
        );
      }
    } catch (error) {
      console.error("��� Error converting selected parcel:", error);
    }
  };

  // Update lot names and numbers based on classification
  const updateLotNamesAndNumbers = (lots: any[]): GeneratedLot[] => {
    let privateCounter = 1;

    return lots.map((lot) => {
      if (lot.classification === "common-property") {
        return {
          ...lot,
          name: "CP",
        };
      } else {
        return {
          ...lot,
          name: `Lot ${privateCounter++}`,
        };
      }
    });
  };

  // Toggle lot classification between private and common property
  const toggleLotClassification = (lotId: string) => {
    setGeneratedLots((prevLots) => {
      const updatedLots = prevLots.map((lot) => {
        if (lot.id === lotId) {
          const newClassification =
            lot.classification === "private" ? "common-property" : "private";
          // Use original color when switching back to private, CP color when switching to CP
          const newColor =
            newClassification === "private"
              ? lot.originalColor
              : CLASSIFICATION_COLORS[newClassification];

          return {
            ...lot,
            classification: newClassification,
            color: newColor,
          };
        }
        return lot;
      });

      // Renumber lots and update names
      const renamedLots = updateLotNamesAndNumbers(updatedLots);

      // Update visual styling and labels on map
      if (map) {
        renamedLots.forEach((lot, index) => {
          // Find the polygon layer (even index) and label layer (odd index)
          const polygonLayerIndex = index * 2;
          const labelLayerIndex = index * 2 + 1;

          if (polygonLayerIndex < generatedLotLayersRef.current.length) {
            const polygonLayer =
              generatedLotLayersRef.current[polygonLayerIndex];
            const labelLayer = generatedLotLayersRef.current[labelLayerIndex];

            // Update polygon style with hatch pattern for CP lots
            if ((polygonLayer as any).setStyle) {
              const isCP = lot.classification === "common-property";
              const style: any = {
                color: lot.color,
                weight: 2,
                opacity: 0.8,
                fillOpacity: isCP ? 0.2 : 0.3,
                fillColor: lot.color,
              };

              // Add visual distinction for common property lots (dash pattern)
              if (isCP) {
                style.dashArray = "8, 8";
                style.weight = 3;
              } else {
                style.dashArray = undefined;
              }

              (polygonLayer as any).setStyle(style);
            }

            // Update label
            if (labelLayer && (labelLayer as any).setIcon) {
              const centroid = turf.centroid({
                type: "Feature",
                geometry: lot.geometry,
                properties: {},
              });
              const [lng, lat] = centroid.geometry.coordinates;

              const labelIcon = L.divIcon({
                className: "lot-label",
                html: `<div style="
                  background: white;
                  border: 2px solid ${lot.color};
                  border-radius: 6px;
                  padding: 4px 8px;
                  font-size: 12px;
                  font-weight: 700;
                  color: ${lot.color};
                  text-align: center;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  ${lot.classification === "common-property" ? "background: repeating-linear-gradient(45deg, white, white 3px, #e0e0e0 3px, #e0e0e0 6px);" : ""}
                ">${lot.name}<br><span style="font-size: 10px;">${lot.area} m²</span></div>`,
                iconSize: [80, 40],
                iconAnchor: [40, 20],
              });

              (labelLayer as any).setIcon(labelIcon);
              (labelLayer as any).setLatLng([lat, lng]);
            }
          }
        });
      }

      return renamedLots;
    });
  };

  // Clear all layers from map
  const clearAllLayers = () => {
    if (!map) return;

    // Clear parent lot
    if (parentLotLayerRef.current) {
      map.removeLayer(parentLotLayerRef.current);
      parentLotLayerRef.current = null;
    }

    // Clear drawn lines
    drawnLineLayersRef.current.forEach((layer) => map.removeLayer(layer));
    drawnLineLayersRef.current = [];

    // Clear generated lots
    generatedLotLayersRef.current.forEach((layer) => map.removeLayer(layer));
    generatedLotLayersRef.current = [];

    // Clear visual feedback
    if (rubberBandLineRef.current) {
      map.removeLayer(rubberBandLineRef.current);
      rubberBandLineRef.current = null;
    }
    if (snapIndicatorRef.current) {
      map.removeLayer(snapIndicatorRef.current);
      snapIndicatorRef.current = null;
    }
    if (startPointIndicatorRef.current) {
      map.removeLayer(startPointIndicatorRef.current);
      startPointIndicatorRef.current = null;
    }
    if (distanceIndicatorRef.current) {
      map.removeLayer(distanceIndicatorRef.current);
      distanceIndicatorRef.current = null;
    }
  };

  // Update splits change callback
  useEffect(() => {
    onSplitsChange?.(drawnLines.length > 0 || generatedLots.length > 0);
  }, [drawnLines, generatedLots, onSplitsChange]);

  // Update lots change callback
  useEffect(() => {
    onLotsChange?.(generatedLots.length > 0);
  }, [generatedLots, onLotsChange]);

  // Expose functions to parent component
  useEffect(() => {
    if (subdivisionMode.active) {
      // Store functions in a way the parent can access them
      (window as any).subdivisionActions = {
        clearLines,
        generateLots,
      };
    }
    return () => {
      delete (window as any).subdivisionActions;
    };
  }, [subdivisionMode.active, drawnLines, generatedLots]);

  // Find nearest corner of the property boundary
  const findNearestCorner = (
    mousePos: L.LatLng,
  ): { corner: L.LatLng; distance: number } | null => {
    if (!parentLot) return null;

    const coordinates = parentLot.geometry.coordinates[0]; // Outer ring
    let nearestCorner: L.LatLng | null = null;
    let minDistance = Infinity;

    // Check all corners (excluding the duplicate last point)
    for (let i = 0; i < coordinates.length - 1; i++) {
      const corner = coordinates[i];
      const distance = turf.distance([mousePos.lng, mousePos.lat], corner, {
        units: "meters",
      });

      if (distance < minDistance) {
        minDistance = distance;
        nearestCorner = L.latLng(corner[1], corner[0]);
      }
    }

    if (nearestCorner) {
      return { corner: nearestCorner, distance: minDistance };
    }

    return null;
  };

  // Find nearest snap point (boundary or existing line)
  const findSnapPoint = (
    mousePos: L.LatLng,
    threshold: number = 0.00003,
  ): L.LatLng | null => {
    if (!parentLot) return null;

    let nearestPoint: L.LatLng | null = null;
    let minDistance = threshold;

    // Check snapping to property boundary
    const coordinates = parentLot.geometry.coordinates[0]; // Outer ring
    for (let i = 0; i < coordinates.length - 1; i++) {
      const edgeStart = coordinates[i];
      const edgeEnd = coordinates[i + 1];

      // Create line segment
      const lineSegment = turf.lineString([edgeStart, edgeEnd]);

      // Find nearest point on this edge
      const nearestOnEdge = turf.nearestPointOnLine(lineSegment, [
        mousePos.lng,
        mousePos.lat,
      ]);
      const distance = turf.distance(
        [mousePos.lng, mousePos.lat],
        nearestOnEdge.geometry.coordinates,
        { units: "degrees" },
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = L.latLng(
          nearestOnEdge.geometry.coordinates[1],
          nearestOnEdge.geometry.coordinates[0],
        );
      }
    }

    // Check snapping to existing drawn lines
    for (const drawnLine of drawnLines) {
      const lineFeature = turf.lineString(drawnLine.coordinates);
      const nearestOnLine = turf.nearestPointOnLine(lineFeature, [
        mousePos.lng,
        mousePos.lat,
      ]);
      const distance = turf.distance(
        [mousePos.lng, mousePos.lat],
        nearestOnLine.geometry.coordinates,
        { units: "degrees" },
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = L.latLng(
          nearestOnLine.geometry.coordinates[1],
          nearestOnLine.geometry.coordinates[0],
        );
      }

      // Also check line endpoints for exact snapping
      for (const coord of drawnLine.coordinates) {
        const distance = turf.distance([mousePos.lng, mousePos.lat], coord, {
          units: "degrees",
        });
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = L.latLng(coord[1], coord[0]);
        }
      }
    }

    return nearestPoint;
  };

  // Handle lot classification clicks
  useEffect(() => {
    if (
      !map ||
      !subdivisionMode.active ||
      !subdivisionMode.classifying ||
      generatedLots.length === 0
    ) {
      return;
    }

    devLog.log("✅ Setting up lot classification mode");

    const handleLotClick = (e: L.LeafletEvent) => {
      const target = e.target;

      // Find which lot was clicked by checking the layer
      const clickedLotIndex = generatedLotLayersRef.current.findIndex(
        (layer) => layer === target,
      );
      if (clickedLotIndex !== -1) {
        // Find the corresponding lot (each lot has 2 layers: the polygon and the label)
        const lotIndex = Math.floor(clickedLotIndex / 2);
        const lot = generatedLots[lotIndex];

        if (lot) {
          devLog.log(
            `🏠 Toggling classification for ${lot.name} from ${lot.classification}`,
          );
          toggleLotClassification(lot.id);

          toast({
            title:
              lot.classification === "private"
                ? "🏢 Common Property"
                : "🏠 Private Lot",
            description: `${lot.name} is now classified as ${lot.classification === "private" ? "Common Property" : "Private Lot"}`,
            variant: "default",
            duration: 2000,
          });
        }
      }
    };

    // Add click handlers to all lot layers
    generatedLotLayersRef.current.forEach((layer) => {
      if ((layer as any).on) {
        (layer as any).on("click", handleLotClick);
      }
    });

    return () => {
      // Remove click handlers
      generatedLotLayersRef.current.forEach((layer) => {
        if ((layer as any).off) {
          (layer as any).off("click", handleLotClick);
        }
      });
    };
  }, [map, subdivisionMode.classifying, generatedLots]);

  // CAD-like drawing with rubber band line
  useEffect(() => {
    if (
      !map ||
      !subdivisionMode.active ||
      !subdivisionMode.drawing ||
      !parentLot
    ) {
      return;
    }

    devLog.log("✅ Setting up CAD-like drawing tool");

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      let targetPoint = e.latlng;
      let isSnapping = false;

      // Check for snap point
      const snapTarget = findSnapPoint(e.latlng);
      if (snapTarget) {
        targetPoint = snapTarget;
        isSnapping = true;
      }

      setIsSnapping(isSnapping);
      setSnapPoint(isSnapping ? targetPoint : null);

      // Calculate distance to nearest corner when snapping to boundary
      if (isSnapping) {
        const cornerData = findNearestCorner(targetPoint);
        if (cornerData) {
          setNearestCornerDistance(cornerData.distance);

          // Create or update distance indicator
          const distanceText = `${cornerData.distance.toFixed(2)}m to corner`;
          const icon = L.divIcon({
            className: "distance-indicator",
            html: `<div style="background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; pointer-events: none; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${distanceText}</div>`,
            iconSize: [100, 20],
            iconAnchor: [50, -10],
          });

          if (distanceIndicatorRef.current) {
            distanceIndicatorRef.current.setLatLng(targetPoint);
            distanceIndicatorRef.current.setIcon(icon);
          } else {
            distanceIndicatorRef.current = L.marker(targetPoint, {
              icon,
            }).addTo(map);
          }
        } else {
          setNearestCornerDistance(null);
          if (distanceIndicatorRef.current) {
            map.removeLayer(distanceIndicatorRef.current);
            distanceIndicatorRef.current = null;
          }
        }
      } else {
        setNearestCornerDistance(null);
        if (distanceIndicatorRef.current) {
          map.removeLayer(distanceIndicatorRef.current);
          distanceIndicatorRef.current = null;
        }
      }

      // Update or create snap indicator
      if (isSnapping) {
        if (snapIndicatorRef.current) {
          snapIndicatorRef.current.setLatLng(targetPoint);
        } else {
          snapIndicatorRef.current = L.circleMarker(targetPoint, {
            radius: 8,
            color: "#10B981",
            fillColor: "#10B981",
            fillOpacity: 0.9,
            weight: 3,
          }).addTo(map);
        }
      } else {
        if (snapIndicatorRef.current) {
          map.removeLayer(snapIndicatorRef.current);
          snapIndicatorRef.current = null;
        }
      }

      // Update or create rubber band line if we have a starting point
      if (currentDrawingPoint) {
        if (rubberBandLineRef.current) {
          // Update existing line instead of removing/re-adding (reduces flickering)
          rubberBandLineRef.current.setLatLngs([
            currentDrawingPoint,
            targetPoint,
          ]);
        } else {
          // Create new rubber band line with high visibility
          rubberBandLineRef.current = L.polyline(
            [currentDrawingPoint, targetPoint],
            {
              color: "#F59E0B",
              weight: 4,
              opacity: 0.9,
              dashArray: "8, 4",
              lineCap: "round",
            },
          ).addTo(map);
        }
      }
    };

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      let clickPoint = e.latlng;

      // Use snap point if snapping
      if (isSnapping && snapPoint) {
        clickPoint = snapPoint;
      }

      if (!currentDrawingPoint) {
        // First click - start drawing
        setCurrentDrawingPoint(clickPoint);

        // Show start point indicator
        startPointIndicatorRef.current = L.circleMarker(clickPoint, {
          radius: 5,
          color: "#3B82F6",
          fillColor: "#3B82F6",
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);

        devLog.log("🎯 Started drawing from:", clickPoint);
      } else {
        // Second click - complete the line
        const lineCoords: [number, number][] = [
          [currentDrawingPoint.lng, currentDrawingPoint.lat],
          [clickPoint.lng, clickPoint.lat],
        ];

        // Create permanent line
        const line = L.polyline([currentDrawingPoint, clickPoint], {
          color: "#EF4444",
          weight: 3,
          opacity: 0.9,
        }).addTo(map);

        const drawnLine: DrawnLine = {
          id: `line_${Date.now()}`,
          geometry: line,
          coordinates: lineCoords,
        };

        setDrawnLines((prev) => [...prev, drawnLine]);
        drawnLineLayersRef.current.push(line);

        devLog.log("✅ Line drawn:", drawnLine);

        // Reset for next line
        setCurrentDrawingPoint(null);
        if (startPointIndicatorRef.current) {
          map.removeLayer(startPointIndicatorRef.current);
          startPointIndicatorRef.current = null;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Cancel current drawing
        setCurrentDrawingPoint(null);
        if (startPointIndicatorRef.current) {
          map.removeLayer(startPointIndicatorRef.current);
          startPointIndicatorRef.current = null;
        }
        if (rubberBandLineRef.current) {
          map.removeLayer(rubberBandLineRef.current);
          rubberBandLineRef.current = null;
        }
        devLog.log("🚫 Drawing cancelled");
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("click", handleMapClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("click", handleMapClick);
      document.removeEventListener("keydown", handleKeyDown);

      // Clean up visual feedback
      if (rubberBandLineRef.current) {
        map.removeLayer(rubberBandLineRef.current);
        rubberBandLineRef.current = null;
      }
      if (snapIndicatorRef.current) {
        map.removeLayer(snapIndicatorRef.current);
        snapIndicatorRef.current = null;
      }
      if (startPointIndicatorRef.current) {
        map.removeLayer(startPointIndicatorRef.current);
        startPointIndicatorRef.current = null;
      }
      if (distanceIndicatorRef.current) {
        map.removeLayer(distanceIndicatorRef.current);
        distanceIndicatorRef.current = null;
      }
    };
  }, [
    map,
    subdivisionMode,
    parentLot,
    currentDrawingPoint,
    isSnapping,
    snapPoint,
    drawnLines,
  ]);

  // Clear all drawn lines
  const clearLines = () => {
    drawnLineLayersRef.current.forEach((layer) => map?.removeLayer(layer));
    drawnLineLayersRef.current = [];
    setDrawnLines([]);

    // Clear generated lots too
    generatedLotLayersRef.current.forEach((layer) => map?.removeLayer(layer));
    generatedLotLayersRef.current = [];
    setGeneratedLots([]);

    // Reset drawing state
    setCurrentDrawingPoint(null);
    if (startPointIndicatorRef.current) {
      map?.removeLayer(startPointIndicatorRef.current);
      startPointIndicatorRef.current = null;
    }
  };

  // Generate lots from drawn lines using Web Worker-based robust polygon splitting
  const generateLots = async () => {
    if (!parentLot || drawnLines.length === 0) {
      toast({
        title: "⚠️ Missing subdivision lines",
        description:
          "Please draw some subdivision lines first before generating lots.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    devLog.log(
      "🏗️ Generating lots from",
      drawnLines.length,
      "drawn lines using JSTS...",
    );

    try {
      // Clear existing generated lots
      generatedLotLayersRef.current.forEach((layer) => map?.removeLayer(layer));
      generatedLotLayersRef.current = [];

      // Prepare parent polygon for JSTS splitting
      const parentPolygon: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        geometry: parentLot.geometry,
        properties: { lotNumber: 1 },
      };

      // Prepare split lines for JSTS
      const splitLineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] =
        drawnLines.map((line) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: line.coordinates,
          },
          properties: {},
        }));

      devLog.log(
        "📐 Starting Web Worker polygon splitting with parent polygon, area:",
        Math.round(turf.area(parentPolygon)),
        "m²",
      );

      // Show loading state
      toast({
        title: "🔄 Processing subdivision...",
        description: "Using Web Worker for performance. Please wait...",
        duration: 2000,
      });

      // Use async Web Worker-based polygon splitting for better performance
      const resultPolygons = await robustPolygonSplitAsync(
        parentPolygon,
        splitLineFeatures,
      );

      devLog.log(
        `🎯 Web Worker polygon splitting completed: ${resultPolygons.length} polygons created`,
      );

      if (resultPolygons.length <= 1) {
        toast({
          title: "❌ Splitting failed",
          description:
            "Unable to split the polygon with the drawn lines. Try drawing lines that fully cross the property boundary.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }

      // Convert final polygons to lots
      const lots: GeneratedLot[] = resultPolygons.map((polygon, index) => {
        const area = turf.area(polygon);
        const centroid = turf.centroid(polygon);
        const color = LOT_COLORS[index % LOT_COLORS.length];

        // Extract method used from polygon properties if available
        const method = polygon.properties?.method || "unknown";

        const lot: GeneratedLot = {
          id: `lot_${index + 1}`,
          name: `Lot ${index + 1}`,
          area: Math.round(area),
          geometry: polygon.geometry,
          color,
          originalColor: color, // Store original color for restoration
          classification: "private" as const, // Default to private lot
        };

        devLog.log(
          `📦 Lot ${index + 1}: ${Math.round(area)} m² (method: ${method})`,
        );

        // Add lot to map
        const lotLayer = L.geoJSON(polygon, {
          style: {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.3,
            fillColor: color,
          },
          // Disable Leaflet simplification for precise boundaries
          smoothFactor: 0,
        }).addTo(map!);

        // Store the leaflet layer ID on the lot for easier identification
        (lot as any).leafletId = (lotLayer as any)._leaflet_id;

        // Add lot label at centroid
        const [lng, lat] = centroid.geometry.coordinates;
        const labelIcon = L.divIcon({
          className: "lot-label",
          html: `<div style="
            background: white;
            border: 2px solid ${color};
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: 700;
            color: ${color};
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${lot.name}<br><span style="font-size: 10px;">${lot.area} m²</span></div>`,
          iconSize: [80, 40],
          iconAnchor: [40, 20],
        });

        const labelMarker = L.marker([lat, lng], {
          icon: labelIcon,
          interactive: false,
        }).addTo(map!);

        generatedLotLayersRef.current.push(lotLayer, labelMarker);

        return lot;
      });

      setGeneratedLots(lots);

      // Count methods used
      const methodCounts = lots.reduce(
        (acc, lot, index) => {
          const method = resultPolygons[index]?.properties?.method || "unknown";
          acc[method] = (acc[method] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const methodSummary = Object.entries(methodCounts)
        .map(([method, count]) => `${count} via ${method}`)
        .join(", ");

      devLog.log(
        "✅ Generated",
        lots.length,
        "lots with advanced polygon splitting:",
        methodSummary,
      );

      // Show beautiful toast notification instead of ugly browser alert
      toast({
        title: "🎉 Subdivision Complete!",
        description: `Successfully generated ${lots.length} lots using advanced polygon operations. Check the sidebar for R-Code compliance analysis.`,
        variant: "default",
        duration: 6000,
      });
    } catch (error) {
      console.error("�� Web Worker polygon splitting error:", error);
      toast({
        title: "💥 Subdivision failed",
        description:
          error instanceof Error
            ? error.message
            : "Something went wrong while generating lots. Please try again.",
        variant: "destructive",
        duration: 6000,
      });
    }
  };

  return (
    <>
      {/* Subdivision Sidebar */}
      {subdivisionMode.active && (
        <DraggablePanel
          title="Subdivision Analysis"
          initialX={20}
          initialY={80}
          className="w-80"
        >
          <SubdivisionSidebar
            parentLot={parentLot}
            subLots={generatedLots.map((lot, index) => {
              // Calculate actual perimeter using turf.length
              const perimeter = lot.geometry
                ? turf.length(turf.polygon(lot.geometry.coordinates), {
                    units: "meters",
                  })
                : 0;

              return {
                id: lot.id,
                area: lot.area,
                perimeter: Math.round(perimeter), // Now calculated from actual geometry
                isCompliant: lot.area >= (parentLot?.minLotSize || 300),
                geometry: lot.geometry,
                color: lot.color,
                lotNumber:
                  lot.classification === "common-property"
                    ? undefined
                    : parseInt(lot.name.split(" ")[1]) || index + 1,
                classification: lot.classification,
                name: lot.name, // Pass the actual lot name
              };
            })}
            onExport={(format) => {
              if (format === "pdf") {
                // PDF export is handled by the SubdivisionSidebar component itself
                devLog.log("PDF export triggered");
              } else {
                // Handle other export formats
                devLog.log("Exporting lots as:", format, generatedLots);
              }
            }}
            className="border-0 rounded-none shadow-none" // Remove duplicate styling
          />
        </DraggablePanel>
      )}
    </>
  );
}
