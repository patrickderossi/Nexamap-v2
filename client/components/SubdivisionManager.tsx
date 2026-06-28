import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import L from "@/lib/leaflet-shim";
import * as turf from "@turf/turf";
import { SubdivisionToolbar, SubdivisionMode } from "./SubdivisionToolbar";
import { SubdivisionSidebar, SubLot, ParentLot } from "./SubdivisionSidebar";
import { DraggablePanel } from "./DraggablePanel";
import {
  AutoSubdividePanel,
  type ApplyableLot,
  type ApplyableConfig,
} from "./AutoSubdividePanel";
import { rebuildConfigFromDivisions } from "@/lib/auto-subdivision";
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
  map: any | null;
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
  coordinates: [number, number][];
}

type LL = { lng: number; lat: number };

// MapLibre source/layer ids for the drawing visuals (managed directly, not via
// the shim, so they can be updated per-frame with setData — no add/remove churn).
const DRAW = {
  linesSrc: "subdiv-lines-src",
  lines: "subdiv-lines",
  rubberSrc: "subdiv-rubber-src",
  rubber: "subdiv-rubber",
  ptsSrc: "subdiv-pts-src",
  snap: "subdiv-snap",
  start: "subdiv-start",
} as const;
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const ptFeature = (p: { lng: number; lat: number }, kind: string) => ({
  type: "Feature" as const,
  properties: { kind },
  geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
});

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
  const [showAutoSubdivide, setShowAutoSubdivide] = useState(false);

  // Transient drawing state lives in refs (NOT React state) so moving the cursor
  // never triggers a re-render or re-registers the map handlers — that was the
  // source of the old glitchiness.
  const drawStartRef = useRef<LL | null>(null);
  const snapRef = useRef<LL | null>(null);
  const drawnLinesRef = useRef<DrawnLine[]>([]);
  const lengthMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Refs for map layers
  const parentLotLayerRef = useRef<any | null>(null);
  const generatedLotLayersRef = useRef<any[]>([]);
  const autoHandleLayersRef = useRef<any[]>([]);
  const edgeHighlightLayerRef = useRef<any | null>(null);

  // Ref holding the active auto-subdivision config (for handle dragging)
  const activeAutoConfigRef = useRef<ApplyableConfig | null>(null);

  // Keep a live mirror of drawn lines for the (stable) drawing handlers.
  useEffect(() => { drawnLinesRef.current = drawnLines; }, [drawnLines]);

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
      drawStartRef.current = null;
      snapRef.current = null;
      setShowAutoSubdivide(false);
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
          (parentLotLayerRef.current)?.remove?.();
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
      (parentLotLayerRef.current)?.remove?.();
      parentLotLayerRef.current = null;
    }

    // Clear generated lots
    generatedLotLayersRef.current.forEach((layer) => (layer)?.remove?.());
    generatedLotLayersRef.current = [];

    // Clear auto handles
    autoHandleLayersRef.current.forEach((layer) => (layer)?.remove?.());
    autoHandleLayersRef.current = [];
    activeAutoConfigRef.current = null;

    // Clear edge highlight
    if (edgeHighlightLayerRef.current) {
      (edgeHighlightLayerRef.current)?.remove?.();
      edgeHighlightLayerRef.current = null;
    }

    // Clear all drawing sources/layers + transient drawing state
    const dm = map as maplibregl.Map;
    [DRAW.lines, DRAW.rubber, DRAW.snap, DRAW.start].forEach((id) => { if (dm.getLayer(id)) dm.removeLayer(id); });
    [DRAW.linesSrc, DRAW.rubberSrc, DRAW.ptsSrc].forEach((id) => { if (dm.getSource(id)) dm.removeSource(id); });
    lengthMarkerRef.current?.remove();
    lengthMarkerRef.current = null;
    drawStartRef.current = null;
    snapRef.current = null;
  };

  // Update splits change callback
  useEffect(() => {
    onSplitsChange?.(drawnLines.length > 0 || generatedLots.length > 0);
  }, [drawnLines, generatedLots, onSplitsChange]);

  // Update lots change callback
  useEffect(() => {
    onLotsChange?.(generatedLots.length > 0);
  }, [generatedLots, onLotsChange]);

  // Render a single GeneratedLot onto the map and push layers into the ref
  const renderLotOnMap = useCallback(
    (lot: GeneratedLot) => {
      if (!map) return;

      const polygon: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        geometry: lot.geometry,
        properties: {},
      };

      const isCP = lot.classification === "common-property";
      const lotLayer = L.geoJSON(polygon, {
        style: {
          color: lot.color,
          weight: isCP ? 3 : 2,
          opacity: 0.8,
          fillOpacity: isCP ? 0.2 : 0.3,
          fillColor: lot.color,
          dashArray: isCP ? "8, 8" : undefined,
        },
        smoothFactor: 0,
      }).addTo(map);

      const centroid = turf.centroid(polygon);
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
          ${isCP ? "background: repeating-linear-gradient(45deg, white, white 3px, #e0e0e0 3px, #e0e0e0 6px);" : ""}
        ">${lot.name}<br><span style="font-size: 10px;">${lot.area} m²</span></div>`,
        iconSize: [80, 40],
        iconAnchor: [40, 20],
      });

      const labelMarker = L.marker([lat, lng], {
        icon: labelIcon,
        interactive: false,
      }).addTo(map);

      generatedLotLayersRef.current.push(lotLayer, labelMarker);
    },
    [map]
  );

  // ─────────────────────────────────────────────────────────────────
  // Edge highlight — called by AutoSubdividePanel on edge hover
  // ─────────────────────────────────────────────────────────────────
  const highlightEdge = useCallback(
    (edgeIndex: number | null) => {
      if (!map) return;
      // Remove previous highlight
      if (edgeHighlightLayerRef.current) {
        (edgeHighlightLayerRef.current)?.remove?.();
        edgeHighlightLayerRef.current = null;
      }
      if (edgeIndex === null || !parentLot?.geometry) return;

      const coords = parentLot.geometry.coordinates[0];
      const n = coords.length - 1;
      if (edgeIndex < 0 || edgeIndex >= n) return;

      const start = coords[edgeIndex] as [number, number];
      const end = coords[(edgeIndex + 1) % n] as [number, number];

      const polyline = L.polyline(
        [L.latLng(start[1], start[0]), L.latLng(end[1], end[0])],
        { color: "#EF4444", weight: 6, opacity: 0.9, dashArray: undefined }
      ).addTo(map);

      edgeHighlightLayerRef.current = polyline;
    },
    [map, parentLot]
  );

  // Apply auto-generated lots from AutoSubdividePanel
  /** Clear auto-subdivision handle markers from the map */
  const clearAutoHandles = useCallback(() => {
    if (!map) return;
    autoHandleLayersRef.current.forEach((l) => (l)?.remove?.());
    autoHandleLayersRef.current = [];
  }, [map]);

  /** Render draggable division handles and connector line for an auto config */
  const renderAutoHandles = useCallback(
    (payload: ApplyableConfig) => {
      if (!map) return;
      clearAutoHandles();

      const { config, parcelPolygon, rCode } = payload;
      if (!config.divisionPointsM.length) return;

      const coords = parcelPolygon.coordinates[0];
      const n = coords.length - 1;
      const frontStart = coords[config.frontEdgeIndex] as [number, number];
      const frontEnd = coords[(config.frontEdgeIndex + 1) % n] as [number, number];

      const dx = frontEnd[0] - frontStart[0];
      const dy = frontEnd[1] - frontStart[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const u_deg = [dx / len, dy / len];

      const METERS_PER_DEGREE = 111320;

      const getHandleLatLng = (posM: number): any => {
        if (config.divisionType === "width") {
          // Point along the front edge
          const lng = frontStart[0] + (posM / METERS_PER_DEGREE) * u_deg[0];
          const lat = frontStart[1] + (posM / METERS_PER_DEGREE) * u_deg[1];
          return L.latLng(lat, lng);
        } else {
          // "depth" — point along the perpendicular from midpoint of front edge
          // Project onto depth axis: midpoint of front edge + posM in p direction
          const centroid = [
            (frontStart[0] + frontEnd[0]) / 2,
            (frontStart[1] + frontEnd[1]) / 2,
          ];
          // p_deg: rotate u_deg 90° toward centroid
          const p1 = [-u_deg[1], u_deg[0]];
          const p2 = [u_deg[1], -u_deg[0]];
          const lotCentroid = turf
            .centroid(turf.feature({ type: "Polygon", coordinates: parcelPolygon.coordinates }))
            .geometry.coordinates;
          const toc = [lotCentroid[0] - centroid[0], lotCentroid[1] - centroid[1]];
          const p_deg = p1[0] * toc[0] + p1[1] * toc[1] > 0 ? p1 : p2;

          const lng = centroid[0] + (posM / METERS_PER_DEGREE) * p_deg[0];
          const lat = centroid[1] + (posM / METERS_PER_DEGREE) * p_deg[1];
          return L.latLng(lat, lng);
        }
      };

      // Draw connector line through handle positions
      const handlePositions = config.divisionPointsM.map(getHandleLatLng);
      if (handlePositions.length > 0) {
        const line = L.polyline(handlePositions, {
          color: "#7C3AED",
          weight: 2,
          dashArray: "6, 4",
          opacity: 0.7,
        }).addTo(map);
        autoHandleLayersRef.current.push(line);
      }

      // Create draggable marker for each division line
      config.divisionPointsM.forEach((posM, idx) => {
        const latlng = getHandleLatLng(posM);

        const handleIcon = L.divIcon({
          className: "",
          html: `<div style="
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #7C3AED;
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(124,58,237,0.6);
            cursor: grab;
            display: flex;
            align-items: center;
            justify-content: center;
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = L.marker(latlng, {
          icon: handleIcon,
          draggable: true,
          zIndexOffset: 1000,
        }).addTo(map);

        marker.on("dragend", () => {
          const newLatLng = marker.getLatLng();
          const currentConfig = activeAutoConfigRef.current;
          if (!currentConfig) return;

          // Project the dragged position onto the division axis and compute new posM
          let newPosM: number;
          if (config.divisionType === "width") {
            // Project onto front edge direction from frontStart
            const dlng = newLatLng.lng - frontStart[0];
            const dlat = newLatLng.lat - frontStart[1];
            newPosM = (dlng * u_deg[0] + dlat * u_deg[1]) * METERS_PER_DEGREE;
          } else {
            // Project onto depth direction
            const centroid = [
              (frontStart[0] + frontEnd[0]) / 2,
              (frontStart[1] + frontEnd[1]) / 2,
            ];
            const p1 = [-u_deg[1], u_deg[0]];
            const p2 = [u_deg[1], -u_deg[0]];
            const lotCentroid = turf
              .centroid(turf.feature({ type: "Polygon", coordinates: parcelPolygon.coordinates }))
              .geometry.coordinates;
            const toc = [lotCentroid[0] - centroid[0], lotCentroid[1] - centroid[1]];
            const p_deg = p1[0] * toc[0] + p1[1] * toc[1] > 0 ? p1 : p2;

            const dlng = newLatLng.lng - centroid[0];
            const dlat = newLatLng.lat - centroid[1];
            newPosM = (dlng * p_deg[0] + dlat * p_deg[1]) * METERS_PER_DEGREE;
          }

          // Clamp to neighbours so lots don't go below 30m²
          const allDivisions = [...currentConfig.config.divisionPointsM];
          const minGap = 1; // 1 metre min lot size in the division direction
          const prevBound = idx === 0 ? minGap : allDivisions[idx - 1] + minGap;
          const nextBound =
            idx === allDivisions.length - 1
              ? (config.divisionType === "width" ? config.widthM : config.depthM) - minGap
              : allDivisions[idx + 1] - minGap;

          newPosM = Math.max(prevBound, Math.min(nextBound, newPosM));
          allDivisions[idx] = newPosM;

          // Rebuild config with updated divisions
          const parcelFeature = turf.feature({ type: "Polygon", coordinates: parcelPolygon.coordinates } as GeoJSON.Polygon);
          const rebuilt = rebuildConfigFromDivisions(
            currentConfig.config,
            parcelFeature,
            allDivisions,
            rCode
          );
          if (!rebuilt) return;

          const newPayload: ApplyableConfig = {
            ...currentConfig,
            config: rebuilt,
            lots: rebuilt.lots.map((l) => ({
              name: l.name,
              classification: l.type,
              geometry: l.geometry,
            })),
          };

          activeAutoConfigRef.current = newPayload;

          // Re-render lots without closing the panel
          generatedLotLayersRef.current.forEach((layer) => (layer)?.remove?.());
          generatedLotLayersRef.current = [];

          let privateCounter = 1;
          const newLots: GeneratedLot[] = rebuilt.lots.map((rl, i) => {
            const isCP = rl.type === "common-property";
            const color = isCP
              ? CLASSIFICATION_COLORS["common-property"]
              : LOT_COLORS[privateCounter % LOT_COLORS.length];
            if (!isCP) privateCounter++;
            return {
              id: `auto_${i + 1}`,
              name: rl.name,
              area: rl.area,
              geometry: rl.geometry,
              color,
              originalColor: color,
              classification: rl.type,
            };
          });

          newLots.forEach((lot) => renderLotOnMap(lot));
          setGeneratedLots(newLots);
          renderAutoHandles(newPayload);
        });

        autoHandleLayersRef.current.push(marker);
      });
    },
    [map, clearAutoHandles, renderLotOnMap]
  );

  const applyAutoLots = useCallback(
    (payload: ApplyableConfig) => {
      if (!map) return;

      // Store for handle dragging
      activeAutoConfigRef.current = payload;

      // Clear existing drawn lines and generated lots
      setDrawnLines([]);

      generatedLotLayersRef.current.forEach((layer) => (layer)?.remove?.());
      generatedLotLayersRef.current = [];

      clearAutoHandles();

      // Reset drawing state
      drawStartRef.current = null;
      snapRef.current = null;

      let privateCounter = 1;
      const newLots: GeneratedLot[] = payload.lots.map((applyable, i) => {
        const isCP = applyable.classification === "common-property";
        const color = isCP
          ? CLASSIFICATION_COLORS["common-property"]
          : LOT_COLORS[privateCounter % LOT_COLORS.length];

        const name = applyable.name;
        if (!isCP) privateCounter++;

        const area = Math.round(
          turf.area({ type: "Feature", geometry: applyable.geometry, properties: {} })
        );

        return {
          id: `auto_${i + 1}`,
          name,
          area,
          geometry: applyable.geometry,
          color,
          originalColor: isCP ? color : LOT_COLORS[(privateCounter - 1) % LOT_COLORS.length],
          classification: applyable.classification,
        };
      });

      newLots.forEach((lot) => renderLotOnMap(lot));
      setGeneratedLots(newLots);

      // Add draggable handles for division lines
      renderAutoHandles(payload);
    },
    [map, renderLotOnMap, clearAutoHandles, renderAutoHandles]
  );

  // Expose functions to parent component
  useEffect(() => {
    if (subdivisionMode.active) {
      // Store functions in a way the parent can access them
      (window as any).subdivisionActions = {
        clearLines,
        generateLots,
        applyAutoLots,
        toggleAutoSubdivide: () => setShowAutoSubdivide((v) => !v),
      };
    }
    return () => {
      delete (window as any).subdivisionActions;
    };
  }, [subdivisionMode.active, drawnLines, generatedLots, applyAutoLots]);

  // Snap the cursor to the nearest parcel corner, boundary edge, or existing
  // drawn line/endpoint within SNAP_PX *pixels* (so it feels identical at every
  // zoom). Reads drawnLinesRef so the stable drawing handlers always see the
  // latest lines. Returns the snapped point, or null when nothing is in range.
  const computeSnap = useCallback(
    (e: maplibregl.MapMouseEvent): LL | null => {
      const m = map as maplibregl.Map | null;
      if (!m || !parentLot) return null;
      const SNAP_PX = 12;
      const px = e.point;
      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      let best: LL | null = null;
      let bestD = Infinity;
      const consider = (lng: number, lat: number, threshold: number) => {
        const q = m.project([lng, lat]);
        const d = Math.hypot(q.x - px.x, q.y - px.y);
        if (d <= threshold && d < bestD) { best = { lng, lat }; bestD = d; }
      };
      const ring = parentLot.geometry.coordinates[0] as [number, number][];
      // Corners are "stickier" (larger threshold) so lines lock onto vertices.
      for (let i = 0; i < ring.length - 1; i++) consider(ring[i][0], ring[i][1], SNAP_PX + 5);
      // Nearest point along each boundary edge.
      for (let i = 0; i < ring.length - 1; i++) {
        const np = turf.nearestPointOnLine(turf.lineString([ring[i], ring[i + 1]]), cursor);
        consider(np.geometry.coordinates[0], np.geometry.coordinates[1], SNAP_PX);
      }
      // Existing drawn lines + their endpoints.
      for (const dl of drawnLinesRef.current) {
        if (dl.coordinates.length < 2) continue;
        const np = turf.nearestPointOnLine(turf.lineString(dl.coordinates), cursor);
        consider(np.geometry.coordinates[0], np.geometry.coordinates[1], SNAP_PX);
        for (const c of dl.coordinates) consider(c[0], c[1], SNAP_PX + 5);
      }
      return best;
    },
    [map, parentLot],
  );

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

    const handleLotClick = (e: any) => {
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

  // ── CAD-style drawing ─────────────────────────────────────────────────────
  // Transient visuals (rubber band, snap dot, start dot, length label) are drawn
  // straight onto MapLibre sources and updated with setData on each mouse move —
  // no React re-render, no add/remove churn — so drawing stays smooth.
  const setSrc = useCallback((id: string, data: any) => {
    const s = (map as maplibregl.Map | null)?.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (s) s.setData(data);
  }, [map]);

  const updateDrawPoints = useCallback(() => {
    const feats: any[] = [];
    if (snapRef.current) feats.push(ptFeature(snapRef.current, "snap"));
    if (drawStartRef.current) feats.push(ptFeature(drawStartRef.current, "start"));
    setSrc(DRAW.ptsSrc, { type: "FeatureCollection", features: feats });
  }, [setSrc]);

  const showLength = useCallback((at: LL, text: string) => {
    const m = map as maplibregl.Map | null;
    if (!m) return;
    if (!lengthMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "background:rgba(17,24,39,.9);color:#fff;padding:2px 7px;border-radius:6px;font:600 11px system-ui,sans-serif;white-space:nowrap;pointer-events:none;";
      lengthMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -10] })
        .setLngLat([at.lng, at.lat])
        .addTo(m);
    }
    lengthMarkerRef.current.setLngLat([at.lng, at.lat]);
    lengthMarkerRef.current.getElement().textContent = text;
  }, [map]);

  const hideLength = useCallback(() => {
    lengthMarkerRef.current?.remove();
    lengthMarkerRef.current = null;
  }, []);

  // Keep the committed-lines layer in sync with state.
  useEffect(() => {
    setSrc(DRAW.linesSrc, {
      type: "FeatureCollection",
      features: drawnLines.map((l) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: l.coordinates },
      })),
    });
  }, [drawnLines, setSrc]);

  // Drawing interaction — registered ONCE per drawing session (stable deps).
  useEffect(() => {
    const m = map as maplibregl.Map | null;
    if (!m || !subdivisionMode.active || !subdivisionMode.drawing || !parentLot) return;

    const ensure = () => {
      const add = (srcId: string, layer: any) => {
        if (!m.getSource(srcId)) m.addSource(srcId, { type: "geojson", data: EMPTY_FC as any });
        if (!m.getLayer(layer.id)) m.addLayer(layer);
      };
      add(DRAW.linesSrc, { id: DRAW.lines, type: "line", source: DRAW.linesSrc, paint: { "line-color": "#EF4444", "line-width": 3 } });
      add(DRAW.rubberSrc, { id: DRAW.rubber, type: "line", source: DRAW.rubberSrc, layout: { "line-cap": "round" }, paint: { "line-color": "#F59E0B", "line-width": 3, "line-dasharray": [2, 1.5] } });
      add(DRAW.ptsSrc, { id: DRAW.snap, type: "circle", source: DRAW.ptsSrc, filter: ["==", ["get", "kind"], "snap"], paint: { "circle-radius": 7, "circle-color": "#10B981", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      if (!m.getLayer(DRAW.start)) m.addLayer({ id: DRAW.start, type: "circle", source: DRAW.ptsSrc, filter: ["==", ["get", "kind"], "start"], paint: { "circle-radius": 5, "circle-color": "#2563EB", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      // refresh committed lines onto the (possibly just-created) source
      setSrc(DRAW.linesSrc, {
        type: "FeatureCollection",
        features: drawnLinesRef.current.map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l.coordinates } })),
      });
    };
    if (m.isStyleLoaded()) ensure();
    else m.once("idle", ensure);

    devLog.log("✅ CAD drawing tool ready");

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const snap = computeSnap(e);
      snapRef.current = snap;
      const target = snap || { lng: e.lngLat.lng, lat: e.lngLat.lat };
      updateDrawPoints();
      const start = drawStartRef.current;
      if (start) {
        setSrc(DRAW.rubberSrc, {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[start.lng, start.lat], [target.lng, target.lat]] },
        });
        const len = turf.distance([start.lng, start.lat], [target.lng, target.lat], { units: "meters" });
        showLength(target, `${len.toFixed(1)} m`);
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const p = snapRef.current || { lng: e.lngLat.lng, lat: e.lngLat.lat };
      const start = drawStartRef.current;
      if (!start) {
        drawStartRef.current = p;
        updateDrawPoints();
      } else {
        const coords: [number, number][] = [[start.lng, start.lat], [p.lng, p.lat]];
        setDrawnLines((prev) => [...prev, { id: `line_${Date.now()}`, coordinates: coords }]);
        drawStartRef.current = null;
        setSrc(DRAW.rubberSrc, EMPTY_FC as any);
        updateDrawPoints();
        hideLength();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawStartRef.current) {
        drawStartRef.current = null;
        setSrc(DRAW.rubberSrc, EMPTY_FC as any);
        updateDrawPoints();
        hideLength();
      }
    };

    m.on("mousemove", onMove);
    m.on("click", onClick);
    document.addEventListener("keydown", onKey);
    // Crosshair on the canvas container (MapLibre's idiomatic cursor target —
    // it isn't reset on hover the way the inner canvas element is).
    const cc = m.getCanvasContainer();
    const prevCursor = cc.style.cursor;
    cc.style.cursor = "crosshair";

    return () => {
      m.off("mousemove", onMove);
      m.off("click", onClick);
      document.removeEventListener("keydown", onKey);
      cc.style.cursor = prevCursor;
      drawStartRef.current = null;
      snapRef.current = null;
      setSrc(DRAW.rubberSrc, EMPTY_FC as any);
      setSrc(DRAW.ptsSrc, EMPTY_FC as any);
      hideLength();
    };
  }, [map, subdivisionMode.active, subdivisionMode.drawing, parentLot, computeSnap, setSrc, updateDrawPoints, showLength, hideLength]);

  // Clear all drawn lines (and any generated lots).
  const clearLines = () => {
    setDrawnLines([]);
    generatedLotLayersRef.current.forEach((layer) => (layer)?.remove?.());
    generatedLotLayersRef.current = [];
    setGeneratedLots([]);
    drawStartRef.current = null;
    snapRef.current = null;
    setSrc(DRAW.rubberSrc, EMPTY_FC as any);
    updateDrawPoints();
    hideLength();
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
      generatedLotLayersRef.current.forEach((layer) => (layer)?.remove?.());
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
      {/* Auto Subdivide Panel */}
      {subdivisionMode.active && showAutoSubdivide && (
        <DraggablePanel
          title="Auto Subdivide"
          initialX={340}
          initialY={80}
          className="w-96"
        >
          <AutoSubdividePanel
            parentLot={parentLot}
            onApplyConfig={(payload) => {
              applyAutoLots(payload);
              setShowAutoSubdivide(false);
            }}
            onEdgeHighlight={highlightEdge}
            onClose={() => setShowAutoSubdivide(false)}
          />
        </DraggablePanel>
      )}

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
