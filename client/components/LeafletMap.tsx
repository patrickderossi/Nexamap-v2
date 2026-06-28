/**
 * LeafletMap.tsx — MapLibre GL JS implementation
 * Renders the interactive map with SLIP WA overlay layers.
 * Component name kept as LeafletMap so no other file needs changing.
 */
import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import * as turf from "@turf/turf";
import { Ruler, Hexagon, Trash2 } from "lucide-react";
import { C, FONT, MONO, floatChrome } from "@/lib/nexa-ui";
import { devLog } from "@/lib/logger";
import { queryPropertyDetails, computeCadastralMetrics } from "@/lib/slip-wa-api";
import { queryExternalApis } from "@/lib/external-apis";
import { PropertyControlsState } from "./PropertyControls";
import { BaseLayerType } from "./FloatingLayerControls";
import { calculateSetbackGeometry } from "@/lib/setback-geometry";
import { getSetbackRequirements } from "@/lib/setback-requirements";
import { extractRCode } from "@/lib/zoning-requirements";

// ── @mapbox/mapbox-gl-draw default styles patched for MapLibre GL v5 ─────────
// MapLibre v5 requires bare numeric arrays inside expressions to be ["literal", [...]].
// The only affected layer is gl-draw-lines (line-dasharray expression).
const DRAW_STYLES = [
  { id: "gl-draw-polygon-fill", type: "fill",
    filter: ["all", ["==", "$type", "Polygon"]],
    paint: { "fill-color": ["case", ["==", ["get", "active"], "true"], "#fbb03b", "#3887be"], "fill-opacity": 0.1 } },
  { id: "gl-draw-lines", type: "line",
    filter: ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["case", ["==", ["get", "active"], "true"], "#fbb03b", "#3887be"],
      "line-dasharray": ["case", ["==", ["get", "active"], "true"], ["literal", [0.2, 2]], ["literal", [2, 0]]],
      "line-width": 2,
    } },
  { id: "gl-draw-point-outer", type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint: { "circle-radius": ["case", ["==", ["get", "active"], "true"], 7, 5], "circle-color": "#fff" } },
  { id: "gl-draw-point-inner", type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint: {
      "circle-radius": ["case", ["==", ["get", "active"], "true"], 5, 3],
      "circle-color": ["case", ["==", ["get", "active"], "true"], "#fbb03b", "#3887be"],
    } },
  { id: "gl-draw-vertex-outer", type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"], ["!=", "mode", "simple_select"]],
    paint: { "circle-radius": ["case", ["==", ["get", "active"], "true"], 7, 5], "circle-color": "#fff" } },
  { id: "gl-draw-vertex-inner", type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"], ["!=", "mode", "simple_select"]],
    paint: { "circle-radius": ["case", ["==", ["get", "active"], "true"], 5, 3], "circle-color": "#fbb03b" } },
  { id: "gl-draw-midpoint", type: "circle",
    filter: ["all", ["==", "meta", "midpoint"]],
    paint: { "circle-radius": 3, "circle-color": "#fbb03b" } },
];

// ── Base map styles (all free, no API key) ───────────────────────────────────

// Landgate (WA) "Locate" imagery — the free, whole-of-State seamless aerial
// basemap (~5 cm in metro). It's a dynamic ArcGIS service (not pre-cached), so
// we consume it WMS-style via the `export` endpoint using MapLibre's
// `{bbox-epsg-3857}` token. 512 px tiles cut the request count on a non-CDN
// service. Far sharper and more current than the old Esri World Imagery mosaic.
const LANDGATE_IMAGERY =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Locate/MapServer/export" +
  "?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&format=jpg&transparent=false&f=image";

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [LANDGATE_IMAGERY],
      tileSize: 512,
      attribution: "Imagery © Landgate (WA) · SLIP",
      maxzoom: 21,
    },
  },
  layers: [{ id: "satellite-bg", type: "raster", source: "satellite" }],
};

function getStyle(type: BaseLayerType): string | maplibregl.StyleSpecification {
  switch (type) {
    case "osm":
      return "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
    case "satellite":
      return SATELLITE_STYLE;
    case "positron":
    default:
      return "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
  }
}

// ── SLIP WA overlay layer definitions ────────────────────────────────────────
// SLIP's WMS endpoint rejects these numeric layer IDs (returns a
// ServiceExceptionReport), so we use the ArcGIS REST `export` endpoint — the
// same one esri-leaflet's dynamicMapLayer used.
//
// IMPORTANT: these are *dynamic* map services, not pre-rendered tiles. Slicing
// them into a 256px raster-tile grid makes the server render every tile in
// isolation, which clips/duplicates labels, point symbols and dashed lines at
// each tile seam (the "glitching"). Instead we request ONE image covering the
// whole viewport and re-fetch it on moveend — exactly how esri-leaflet did it.
// This is implemented with a MapLibre `image` source per active overlay.

const PS = "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services";

// Web-Mercator (EPSG:3857) forward projection
function lngLatTo3857(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}

// Build a single full-viewport ArcGIS export request.
function slipExportUrl(
  service: string,
  layers: (string | number)[],
  bbox3857: [number, number, number, number],
  width: number,
  height: number,
): string {
  const [minx, miny, maxx, maxy] = bbox3857;
  return (
    `${PS}/${service}/MapServer/export` +
    `?bbox=${minx},${miny},${maxx},${maxy}&bboxSR=3857&imageSR=3857` +
    `&size=${width},${height}&format=png32&transparent=true` +
    `&dpi=96&layers=show:${layers.join(",")}&f=image`
  );
}

interface WmsDef {
  service: string;
  layers: (string | number)[];
  opacity: number;
}

type LayerKey =
  | "placesAddresses" | "propertyPlanning" | "bushfireAreas"
  | "infrastructure" | "water" | "terrain" | "soilType"
  | "health" | "schools" | "transport"
  | "mrsZone" | "lpsZones" | "lpsOverlays"
  | "heritageState" | "heritageLocal" | "aboriginalHeritage"
  | "contamination" | "envSensitive" | "airportNoise"
  | "roadRailNoise" | "bushForever" | "acidSulfateSoil" | "drinkingWater";

const LAYER_DEFS: Record<LayerKey, WmsDef> = {
  placesAddresses:    { service: "Places_and_Addresses",           layers: [3, 4],                         opacity: 1    },
  propertyPlanning:   { service: "Property_and_Planning",          layers: [111],                          opacity: 0.85 },
  bushfireAreas:      { service: "Bush_Fire_Prone_Areas",          layers: [20],                           opacity: 0.7  },
  infrastructure:     { service: "Infrastructure_and_Utilities_WFS",layers: [0,1,2,3,4,5,6,7,8,11,13,14,15,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,34,35], opacity: 0.8 },
  water:              { service: "Water",                          layers: [8],                            opacity: 0.75 },
  terrain:            { service: "Terrain",                        layers: [0],                            opacity: 0.7  },
  soilType:           { service: "Soil_Landscape",                 layers: [26],                           opacity: 0.7  },
  health:             { service: "Health",                         layers: [1],                            opacity: 0.8  },
  schools:            { service: "Education",                      layers: [12],                           opacity: 0.8  },
  transport:          { service: "Transport",                      layers: [14, 15],                       opacity: 0.7  },
  mrsZone:            { service: "Property_and_Planning",          layers: [48],                           opacity: 0.7  },
  lpsZones:           { service: "Property_and_Planning",          layers: [112],                          opacity: 0.7  },
  lpsOverlays:        { service: "Property_and_Planning",          layers: [109],                          opacity: 0.7  },
  heritageState:      { service: "People_and_Society",             layers: [7],                            opacity: 0.8  },
  heritageLocal:      { service: "People_and_Society",             layers: [9],                            opacity: 0.8  },
  aboriginalHeritage: { service: "People_and_Society",             layers: [10],                           opacity: 0.65 },
  contamination:      { service: "Environment",                    layers: [5],                            opacity: 0.85 },
  envSensitive:       { service: "Environment",                    layers: [6],                            opacity: 0.65 },
  airportNoise:       { service: "Property_and_Planning",          layers: [77, 78],                       opacity: 0.7  },
  roadRailNoise:      { service: "Property_and_Planning",          layers: [100],                          opacity: 0.7  },
  bushForever:        { service: "Property_and_Planning",          layers: [31],                           opacity: 0.65 },
  acidSulfateSoil:    { service: "Soil_Risk_Map",                  layers: [3],                            opacity: 0.7  },
  drinkingWater:      { service: "Water",                          layers: [24],                           opacity: 0.65 },
};

const srcId  = (k: LayerKey) => `slip-src-${k}`;
const lyrId  = (k: LayerKey) => `slip-lyr-${k}`;
const ALL_LAYER_KEYS = Object.keys(LAYER_DEFS) as LayerKey[];

// ── Cadastre: rendered as native vector lines (not a raster image) ───────────
// The cadastre is the heart of the app, so above CAD_MIN_ZOOM we fetch the
// parcel polygons as GeoJSON and draw them with a MapLibre line layer — crisp at
// any zoom, GPU-rendered, and sharp *during* zoom (no bitmap stretching). Below
// the threshold (zoomed right out, thousands of parcels) we fall back to the
// raster image for complete coverage.
const CAD_SRC = "slip-cad-src";
const CAD_LINE = "slip-cad-line";
const CAD_MIN_ZOOM = 16;         // at z16+ a padded viewport holds well under the 1000-feature cap
const CAD_PAD = 0.25;            // fetch 25% beyond the viewport so small pans don't refetch
const CAD_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/4/query";

// ── Component props (identical interface to old Leaflet version) ─────────────

interface LeafletMapProps {
  center?: [number, number];
  zoom?: number;
  height?: string;
  address?: string;
  layers?: Record<LayerKey, boolean>;
  onPropertyClick?: (propertyData: any, coordinates: [number, number], rawGeometry?: any) => void;
  // Streams in supplementary data (elevation, postcode, road class) after the
  // core SLIP report is already on screen, so the panel isn't gated by it.
  onPropertyEnrich?: (extraData: any) => void;
  boundaryData?: {
    geometry?: any;
    boundaryLengths?: string[];
    interiorAngles?: string[];
  };
  propertyControls?: PropertyControlsState;
  onMapReady?: (map: any) => void;
  subdivisionModeActive?: boolean;
  baseLayer?: BaseLayerType;
  showSetbacks?: boolean;
  setbackData?: any;
}

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  placesAddresses: false, propertyPlanning: false, bushfireAreas: false,
  infrastructure: false, water: false, terrain: false, soilType: false,
  health: false, schools: false, transport: false,
  mrsZone: false, lpsZones: false, lpsOverlays: false,
  heritageState: false, heritageLocal: false, aboriginalHeritage: false,
  contamination: false, envSensitive: false, airportNoise: false,
  roadRailNoise: false, bushForever: false, acidSulfateSoil: false,
  drinkingWater: false,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function LeafletMap({
  center = [-31.9505, 115.8605],
  zoom = 15,
  height = "h-[600px]",
  layers = DEFAULT_LAYERS,
  onPropertyClick,
  onPropertyEnrich,
  boundaryData,
  propertyControls = { boundaryDimensions: true, propertyAngles: true },
  onMapReady,
  subdivisionModeActive = false,
  baseLayer = "positron",
  showSetbacks = false,
  setbackData = null,
}: LeafletMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const markerRef     = useRef<maplibregl.Marker | null>(null);
  const drawRef       = useRef<any>(null);
  // Measure / draw tool state (surfaced as an on-map control)
  const [measureMode, setMeasureMode] = useState<"line" | "polygon" | null>(null);
  const [measureText, setMeasureText] = useState<string | null>(null);
  const labelMarkersRef   = useRef<maplibregl.Marker[]>([]);
  const angleMarkersRef   = useRef<maplibregl.Marker[]>([]);
  const currentPropRef    = useRef<any>(null);
  const subdivisionRef    = useRef(subdivisionModeActive);
  const activeLayersRef   = useRef<Set<LayerKey>>(new Set()); // overlays currently toggled on
  const clickSeqRef       = useRef(0); // guards against stale click results overwriting newer ones
  const cadBufRef         = useRef<{ minx: number; miny: number; maxx: number; maxy: number; zoom: number } | null>(null);
  const cadSeqRef         = useRef(0); // guards against stale cadastre fetches overwriting newer ones

  // Keep subdivisionRef current without re-running effects
  useEffect(() => { subdivisionRef.current = subdivisionModeActive; }, [subdivisionModeActive]);

  // ── Helper: clear boundary highlight ──────────────────────────────────────
  const clearHighlight = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    ["prop-fill", "prop-line"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("prop-boundary")) map.removeSource("prop-boundary");

    labelMarkersRef.current.forEach((m) => m.remove());
    labelMarkersRef.current = [];
    angleMarkersRef.current.forEach((m) => m.remove());
    angleMarkersRef.current = [];
  }, []);

  // ── Helper: add label/angle HTML markers ──────────────────────────────────
  const addBoundaryLabels = useCallback((
    geometry: any,
    lengths?: string[],
    angles?: string[],
  ) => {
    const map = mapRef.current;
    if (!map || !geometry?.rings) return;

    const ring: [number, number][] = geometry.rings[0];
    if (!ring || ring.length < 2) return;

    // Side length labels (midpoint of each edge)
    if (propertyControls.boundaryDimensions && lengths) {
      ring.slice(0, -1).forEach((coord, i) => {
        if (!lengths[i]) return;
        const next = ring[i + 1];
        const midLng = (coord[0] + next[0]) / 2;
        const midLat = (coord[1] + next[1]) / 2;

        const dx = next[0] - coord[0];
        const dy = next[1] - coord[1];
        const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

        const el = document.createElement("div");
        el.style.cssText = `
          background: rgba(255,255,255,0.92); color: #1f2937;
          font-size: 10px; font-weight: 600; padding: 1px 5px;
          border-radius: 3px; border: 1px solid #d1d5db;
          white-space: nowrap; pointer-events: none;
          transform: rotate(${angleDeg}deg);
        `;
        el.textContent = lengths[i];

        labelMarkersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([midLng, midLat])
            .addTo(map),
        );
      });
    }

    // Angle markers (at each vertex)
    if (propertyControls.propertyAngles && angles) {
      ring.slice(0, -1).forEach((coord, i) => {
        if (!angles[i]) return;
        const el = document.createElement("div");
        el.style.cssText = `
          background: rgba(59,130,246,0.9); color: white;
          font-size: 9px; font-weight: 700; padding: 1px 4px;
          border-radius: 10px; white-space: nowrap; pointer-events: none;
        `;
        el.textContent = angles[i];

        angleMarkersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([coord[0], coord[1]])
            .addTo(map),
        );
      });
    }
  }, [propertyControls]);

  // ── Helper: show property boundary on map ─────────────────────────────────
  const showBoundary = useCallback((geometry: any, lengths?: string[], angles?: string[]) => {
    const map = mapRef.current;
    if (!map || !geometry?.rings) return;

    clearHighlight();

    const geojson: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: geometry.rings },
      properties: {},
    };

    map.addSource("prop-boundary", { type: "geojson", data: geojson });
    map.addLayer({
      id: "prop-fill",
      type: "fill",
      source: "prop-boundary",
      paint: { "fill-color": "#ff6b35", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: "prop-line",
      type: "line",
      source: "prop-boundary",
      paint: { "line-color": "#ff6b35", "line-width": 3, "line-opacity": 1 },
      layout: { "line-join": "round" },
    });

    addBoundaryLabels(geometry, lengths, angles);
  }, [clearHighlight, addBoundaryLabels]);

  // ── Dynamic overlay: one viewport-wide image per layer, refreshed on move ──
  // Build the export URL + image-source coordinates for the current viewport.
  const buildOverlayRequest = useCallback((key: LayerKey) => {
    const map = mapRef.current!;
    const def = LAYER_DEFS[key];
    const b = map.getBounds();
    const w = b.getWest(), e = b.getEast(), n = b.getNorth(), s = b.getSouth();
    const [minx, miny] = lngLatTo3857(w, s);
    const [maxx, maxy] = lngLatTo3857(e, n);

    // The requested image `size` MUST match the bbox aspect ratio exactly,
    // otherwise ArcGIS expands the bbox to fit the image and the overlay ends up
    // mis-georeferenced (offset that grows with zoom). So derive height from
    // width using the bbox aspect, and cap proportionally (never per-axis).
    const canvas = map.getCanvas();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const bboxAspect = (maxx - minx) / (maxy - miny);
    const MAX = 2048;
    let width = Math.round(canvas.clientWidth * scale) || 1024;
    let height = Math.round(width / bboxAspect);
    if (width > MAX) { width = MAX; height = Math.round(width / bboxAspect); }
    if (height > MAX) { height = MAX; width = Math.round(height * bboxAspect); }

    const url = slipExportUrl(def.service, def.layers, [minx, miny, maxx, maxy], width, height);
    // image-source corner order: top-left, top-right, bottom-right, bottom-left
    const coordinates: [number, number][] = [[w, n], [e, n], [e, s], [w, s]];
    return { url, coordinates };
  }, []);

  // Raster overlay (the dynamic export image) — used by all layers except the
  // cadastre, plus the cadastre's zoomed-out fallback.
  const refreshRasterOverlay = useCallback((key: LayerKey) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const def = LAYER_DEFS[key];
    const sid = srcId(key);
    const lid = lyrId(key);
    const { url, coordinates } = buildOverlayRequest(key);

    const existing = map.getSource(sid) as maplibregl.ImageSource | undefined;
    if (existing) {
      existing.updateImage({ url, coordinates: coordinates as any });
    } else {
      map.addSource(sid, { type: "image", url, coordinates: coordinates as any });
      map.addLayer({
        id: lid,
        type: "raster",
        source: sid,
        paint: { "raster-opacity": def.opacity, "raster-fade-duration": 0 },
      });
    }
  }, [buildOverlayRequest]);

  // ── Cadastre vector path ────────────────────────────────────────────────
  const removeCadastreVector = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(CAD_LINE)) map.removeLayer(CAD_LINE);
    if (map.getSource(CAD_SRC)) map.removeSource(CAD_SRC);
    cadBufRef.current = null;
  }, []);

  // Fetch parcel polygons for the (padded) viewport and render them as vectors.
  const fetchCadastreVector = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const b = map.getBounds();
    const w = b.getWest(), e = b.getEast(), n = b.getNorth(), s = b.getSouth();
    const padX = (e - w) * CAD_PAD, padY = (n - s) * CAD_PAD;
    const minx = w - padX, maxx = e + padX, miny = s - padY, maxy = n + padY;

    // Skip refetch while the viewport stays inside what we already loaded.
    const buf = cadBufRef.current;
    if (
      buf && map.getSource(CAD_SRC) &&
      w >= buf.minx && e <= buf.maxx && s >= buf.miny && n <= buf.maxy &&
      Math.abs(buf.zoom - map.getZoom()) < 0.75
    ) return;

    // Simplify to ~half a screen pixel so payloads stay small without visible loss.
    const simplify = ((e - w) / Math.max(map.getCanvas().clientWidth, 1)) * 0.5;
    const params = new URLSearchParams({
      f: "geojson",
      where: "1=1",
      geometry: `${minx},${miny},${maxx},${maxy}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326", outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "true",
      outFields: "land_id",
      resultRecordCount: "1000",
      maxAllowableOffset: String(simplify),
      geometryPrecision: "7",
    });

    const seq = ++cadSeqRef.current;
    try {
      const res = await fetch(`${CAD_QUERY}?${params}`);
      if (!res.ok) return;
      const gj = await res.json();
      if (seq !== cadSeqRef.current) return; // superseded by a newer fetch
      const m = mapRef.current;
      if (!m || !m.isStyleLoaded()) return;

      const src = m.getSource(CAD_SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(gj);
      } else {
        m.addSource(CAD_SRC, { type: "geojson", data: gj });
        m.addLayer({
          id: CAD_LINE,
          type: "line",
          source: CAD_SRC,
          paint: {
            "line-color": "#e8870c",
            "line-opacity": 0.9,
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              14, 0.4, 16, 0.8, 19, 1.6, 22, 2.6,
            ] as any,
          },
        });
      }
      cadBufRef.current = { minx, miny, maxx, maxy, zoom: m.getZoom() };
    } catch { /* network hiccup — keep last good vectors */ }
  }, []);

  // Cadastre: vector lines when zoomed in, raster image when zoomed right out.
  const refreshCadastre = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getZoom() >= CAD_MIN_ZOOM) {
      // vector mode — drop the raster fallback if present
      const sid = srcId("placesAddresses"), lid = lyrId("placesAddresses");
      if (map.getLayer(lid)) map.removeLayer(lid);
      if (map.getSource(sid)) map.removeSource(sid);
      fetchCadastreVector();
    } else {
      removeCadastreVector();
      refreshRasterOverlay("placesAddresses");
    }
  }, [fetchCadastreVector, removeCadastreVector, refreshRasterOverlay]);

  // Dispatch: cadastre uses the vector path, everything else the raster image.
  const refreshOverlay = useCallback((key: LayerKey) => {
    if (key === "placesAddresses") refreshCadastre();
    else refreshRasterOverlay(key);
  }, [refreshCadastre, refreshRasterOverlay]);

  const addOverlay = useCallback((key: LayerKey) => {
    activeLayersRef.current.add(key);
    refreshOverlay(key);
  }, [refreshOverlay]);

  const removeOverlay = useCallback((key: LayerKey) => {
    activeLayersRef.current.delete(key);
    const map = mapRef.current;
    if (!map) return;
    const sid = srcId(key);
    const lid = lyrId(key);
    if (map.getLayer(lid)) map.removeLayer(lid);
    if (map.getSource(sid)) map.removeSource(sid);
    if (key === "placesAddresses") removeCadastreVector();
  }, [removeCadastreVector]);

  // Re-request every active overlay for the new viewport (called on moveend).
  const refreshActiveOverlays = useCallback(() => {
    activeLayersRef.current.forEach((key) => refreshOverlay(key));
  }, [refreshOverlay]);

  // ── Map initialisation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyle(baseLayer),
      center: [center[1], center[0]], // MapLibre uses [lng, lat]
      zoom,
      maxZoom: 22,
      minZoom: 8,
      fadeDuration: 0,      // instant tile transitions (no fade)
    });

    mapRef.current = map;

    map.on("error", (e: any) => devLog.warn("MapLibre error:", e?.error?.message || e));

    map.on("load", () => {
      // Ensure the GL canvas matches the (now laid-out) container size.
      map.resize();
      onMapReady?.(map as any);

      // Dynamic overlays cover the viewport, so re-request them after every
      // pan/zoom (moveend) and on resize. This is what keeps labels/symbols
      // seamless instead of clipped per-tile.
      map.on("moveend", () => refreshActiveOverlays());
      map.on("resize", () => refreshActiveOverlays());

      // ── Drawing / measure tools ──────────────────────────────────────────
      // Default control buttons are hidden (they'd sit behind the left panel);
      // we drive draw via our own on-brand control and show a live area/length
      // readout instead.
      try {
        const draw = new (MapboxDraw as any)({
          displayControlsDefault: false,
          controls: {},
          styles: DRAW_STYLES,
        });
        (map as any).addControl(draw, "top-left");
        drawRef.current = draw;

        const updateMeasurement = () => {
          const fc = draw.getAll();
          const polys = fc.features.filter((f: any) =>
            /Polygon/.test(f.geometry?.type || ""));
          const lines = fc.features.filter((f: any) =>
            /LineString/.test(f.geometry?.type || ""));
          if (polys.length) {
            const m2 = polys.reduce((a: number, f: any) => a + turf.area(f), 0);
            setMeasureText(
              m2 < 10000
                ? `${m2.toFixed(0)} m²`
                : `${(m2 / 10000).toFixed(2)} ha · ${m2.toFixed(0)} m²`,
            );
          } else if (lines.length) {
            const m = lines.reduce(
              (a: number, f: any) => a + turf.length(f, { units: "kilometers" }) * 1000,
              0,
            );
            setMeasureText(m < 1000 ? `${m.toFixed(1)} m` : `${(m / 1000).toFixed(2)} km`);
          } else {
            setMeasureText(null);
          }
        };
        map.on("draw.create", () => { updateMeasurement(); setMeasureMode(null); });
        map.on("draw.update", updateMeasurement);
        map.on("draw.delete", updateMeasurement);
      } catch (e) {
        devLog.warn("MapboxDraw init failed:", e);
      }

      // ── Map click → property query ───────────────────────────────────────
      map.on("click", async (e: maplibregl.MapMouseEvent) => {
        // Don't query while drawing
        const drawMode = drawRef.current?.getMode?.();
        if (drawMode && drawMode !== "simple_select" && drawMode !== "static") return;
        if (subdivisionRef.current) return;

        const { lng, lat } = e.lngLat;
        const seq = ++clickSeqRef.current; // newest-click-wins guard
        devLog.log("🎯 Map clicked at:", [lat, lng]);

        // 1️⃣ Fetch ONLY the parcel boundary first (one fast request) and
        //    highlight it immediately, so the click registers instantly instead
        //    of waiting on the ~25-request full property report.
        let feature: any = null;
        for (const layerNum of [4, 3]) {
          const url =
            `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/${layerNum}/query?` +
            new URLSearchParams({
              f: "json",
              returnGeometry: "true",
              spatialRel: "esriSpatialRelIntersects",
              geometry: `${lng},${lat}`,
              geometryType: "esriGeometryPoint",
              inSR: "4326", outSR: "4326",
              outFields: "land_id,road_number_1,road_number_2,road_name,road_type,road_suffix,locality,lot_number",
              maxRecordCount: "1",
              maxAllowableOffset: "0.000001",
              geometryPrecision: "12",
            });
          try {
            const res = await fetch(url);
            if (res.ok) {
              const json = await res.json();
              if (json.features?.length > 0) { feature = json.features[0]; break; }
            }
          } catch { /* try next layer */ }
        }

        if (clickSeqRef.current !== seq) return; // superseded by a newer click
        if (!feature?.geometry?.rings) {
          devLog.log("⚠️ No property found at clicked location");
          return;
        }

        // 2️⃣ OPEN THE PANEL IMMEDIATELY with what we already have: the parcel
        //    boundary plus lot size / dimensions / address computed locally from
        //    the geometry (no network). This makes the panel appear after a
        //    single fetch (~0.5s) instead of waiting on the ~20-request batch.
        const metrics = computeCadastralMetrics(feature.geometry.rings, feature.attributes);
        showBoundary(feature.geometry, metrics.boundaryLengths, metrics.interiorAngles);
        currentPropRef.current = {
          geometry: feature.geometry,
          boundaryLengths: metrics.boundaryLengths,
          interiorAngles: metrics.interiorAngles,
        };
        onPropertyClick?.(
          { ...metrics, cadastralInfo: feature.attributes },
          [lat, lng],
          feature.geometry,
        );

        // 3️⃣ Fetch the SLIP R-code (Property & Planning layer 111) on its own,
        //    so the R-Code card shows promptly instead of waiting on the whole
        //    property-details batch (which stalls if any one sub-query is slow).
        fetch(
          `https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/111/query?` +
          new URLSearchParams({
            f: "json", returnGeometry: "false", spatialRel: "esriSpatialRelIntersects",
            geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
            outFields: "*", maxRecordCount: "1",
          }),
        )
          .then((r) => r.json())
          .then((j) => {
            const a = j?.features?.[0]?.attributes;
            const rCode = a?.rcode_no ?? a?.RCODE_NO ?? a?.rcode ?? a?.RCODE;
            const zoning = a?.scheme_nam ?? a?.SCHEME_NAM ?? a?.zone_code ?? a?.ZONE_CODE;
            if (clickSeqRef.current === seq && (rCode || zoning)) {
              onPropertyEnrich?.({ rCode, zoning });
            }
          })
          .catch(() => { /* the full batch below also carries the R-code */ });

        // 3b️⃣ Independent bushfire / BAL fetch (Bush Fire Prone Areas layer 20)
        //     so the constraint shows promptly and reliably, not gated by the batch.
        fetch(
          `https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas/MapServer/20/query?` +
          new URLSearchParams({
            f: "json", returnGeometry: "false", spatialRel: "esriSpatialRelIntersects",
            geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
            outFields: "PlanningArea", maxRecordCount: "1",
          }),
        )
          .then((r) => r.json())
          .then((j) => {
            const inBushfire = (j?.features?.length ?? 0) > 0;
            const bushfire = inBushfire
              ? "Bushfire Prone Area — BAL Assessment Required"
              : "Not in Designated Bushfire Prone Area";
            if (clickSeqRef.current === seq) onPropertyEnrich?.({ bushfire });
          })
          .catch(() => { /* the full batch below also carries the BAL */ });

        // 4️⃣ Stream in the full SLIP report (zoning, heritage, flood,
        //    constraints…) and merge it into the already-visible panel.
        queryPropertyDetails(
          { coordinates: [lat, lng], address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` },
          { includeExternal: false },
        )
          .then((full) => {
            if (clickSeqRef.current !== seq) return; // superseded by a newer click
            // Map raw SLIP field names to what the panel reads. Only set bushfire
            // when the batch actually has it, so it never clobbers the independent
            // BAL fetch above with "Unknown".
            const enrich: any = { ...full };
            delete enrich.balRating;
            if (full.balRating) enrich.bushfire = full.balRating;
            onPropertyEnrich?.(enrich);
          })
          .catch((err) => console.error("❌ Error querying property:", err));

        // 4️⃣ Stream in supplementary external data (elevation, postcode, road).
        queryExternalApis(lat, lng)
          .then((extra) => { if (clickSeqRef.current === seq) onPropertyEnrich?.(extra); })
          .catch((err) => devLog.warn("External API enrichment failed:", err));
      });

      // Change cursor on hover
      map.on("mouseenter", "prop-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "prop-fill", () => { map.getCanvas().style.cursor = ""; });
    });

    // ── Navigation controls ───────────────────────────────────────────────
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      labelMarkersRef.current.forEach((m) => m.remove());
      angleMarkersRef.current.forEach((m) => m.remove());
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Base layer / style switching ──────────────────────────────────────────
  // The map is constructed with the initial baseLayer's style, so we must NOT
  // call setStyle on mount (that would restart the in-progress style load).
  // Only swap when baseLayer actually changes value.
  const prevBaseLayerRef = useRef<BaseLayerType>(baseLayer);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevBaseLayerRef.current === baseLayer) return; // no change → skip (incl. mount)
    prevBaseLayerRef.current = baseLayer;

    // Active overlays are tracked in activeLayersRef; the style swap wipes their
    // sources, so re-add them once the new style is ready.
    map.once("styledata", () => {
      activeLayersRef.current.forEach((k) => refreshOverlay(k));
      if (currentPropRef.current?.geometry) {
        showBoundary(
          currentPropRef.current.geometry,
          currentPropRef.current.boundaryLengths,
          currentPropRef.current.interiorAngles,
        );
      }
    });

    map.setStyle(getStyle(baseLayer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLayer]);

  // ── SLIP WA overlay layer toggles ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      ALL_LAYER_KEYS.forEach((key) => {
        if (layers[key]) addOverlay(key);
        else removeOverlay(key);
      });
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      // Style still loading (initial load or mid base-layer swap) — apply once ready.
      map.once("idle", apply);
      return () => map.off("idle", apply);
    }
  }, [
    layers.placesAddresses, layers.propertyPlanning, layers.bushfireAreas,
    layers.infrastructure, layers.water, layers.terrain, layers.soilType,
    layers.health, layers.schools, layers.transport,
    layers.mrsZone, layers.lpsZones, layers.lpsOverlays,
    layers.heritageState, layers.heritageLocal, layers.aboriginalHeritage,
    layers.contamination, layers.envSensitive, layers.airportNoise,
    layers.roadRailNoise, layers.bushForever, layers.acidSulfateSoil,
    layers.drinkingWater,
    addOverlay, removeOverlay,
  ]);

  // ── Fly to new center / zoom when props change ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.easeTo({ center: [center[1], center[0]], zoom, duration: 600 });

    // Drop/move a marker at the target location
    if (markerRef.current) {
      markerRef.current.setLngLat([center[1], center[0]]);
    } else {
      const el = document.createElement("div");
      el.innerHTML = `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26s14-16.667 14-26C28 6.268 21.732 0 14 0z" fill="#3b82f6"/>
        <circle cx="14" cy="14" r="6" fill="white"/>
      </svg>`;
      el.style.cssText = "cursor: pointer; width: 28px; height: 40px;";
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([center[1], center[0]])
        .addTo(map);
    }
  }, [center, zoom]);

  // ── Display boundary from external boundaryData prop ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaryData?.geometry) return;

    const onStyleLoaded = () => {
      showBoundary(
        boundaryData.geometry,
        boundaryData.boundaryLengths,
        boundaryData.interiorAngles,
      );
      currentPropRef.current = {
        geometry: boundaryData.geometry,
        boundaryLengths: boundaryData.boundaryLengths,
        interiorAngles: boundaryData.interiorAngles,
      };
    };

    if (map.isStyleLoaded()) {
      onStyleLoaded();
    } else {
      map.once("load", onStyleLoaded);
    }
  }, [boundaryData, showBoundary]);

  // ── Re-render labels when propertyControls toggles change ────────────────
  useEffect(() => {
    if (!currentPropRef.current?.geometry) return;
    clearHighlight();
    showBoundary(
      currentPropRef.current.geometry,
      currentPropRef.current.boundaryLengths,
      currentPropRef.current.interiorAngles,
    );
  }, [propertyControls, clearHighlight, showBoundary]);

  // ── Setback analysis (calculation only — no visual) ───────────────────────
  useEffect(() => {
    if (!showSetbacks || !setbackData || !currentPropRef.current?.geometry) return;

    try {
      const geoJsonFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: currentPropRef.current.geometry.rings },
        properties: {},
      };
      const rCode = extractRCode(setbackData.zoning || "R30");
      const setbacks = getSetbackRequirements(rCode || "R30");
      calculateSetbackGeometry(geoJsonFeature, setbacks, setbackData.lotArea || 400, false, []);
    } catch (e) {
      devLog.warn("Setback calculation error:", e);
    }
  }, [showSetbacks, setbackData]);

  const startMeasure = (kind: "line" | "polygon") => {
    const draw = drawRef.current;
    if (!draw) return;
    try {
      draw.changeMode(kind === "line" ? "draw_line_string" : "draw_polygon");
      setMeasureMode(kind);
    } catch (e) {
      devLog.warn("startMeasure failed:", e);
    }
  };
  const clearMeasure = () => {
    const draw = drawRef.current;
    try {
      draw?.deleteAll?.();
      draw?.changeMode?.("simple_select");
    } catch {}
    setMeasureMode(null);
    setMeasureText(null);
  };

  const toolBtn = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: "0 11px",
    borderRadius: 9,
    cursor: "pointer",
    border: "none",
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: 600,
    background: active ? C.blue : "transparent",
    color: active ? "#fff" : C.muted,
  });
  const measureKind = measureText && /m²|ha/.test(measureText) ? "AREA" : "DISTANCE";

  return (
    <div className={`relative w-full ${height}`}>
      {/* MapLibre forces position:relative on this node, so it must carry an
          explicit width/height — `inset-0` would collapse it to 0. */}
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Measure / draw tools (on-brand, bottom-left) ──────────────────── */}
      {!subdivisionModeActive && (
        <div
          style={{
            position: "absolute",
            left: 382,
            bottom: 26,
            zIndex: 18,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-start",
            fontFamily: FONT,
          }}
        >
          {(measureText || measureMode) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 32,
                padding: "0 12px",
                borderRadius: 10,
                color: C.ink,
                fontWeight: 700,
                fontSize: 13,
                ...floatChrome,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: C.faint }}>
                {measureKind}
              </span>
              {measureText || (
                <span style={{ fontWeight: 500, color: C.muted }}>
                  {measureMode === "polygon" ? "Click to outline an area…" : "Click to measure a distance…"}
                </span>
              )}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 4,
              borderRadius: 12,
              ...floatChrome,
            }}
          >
            <button onClick={() => startMeasure("line")} style={toolBtn(measureMode === "line")}>
              <Ruler className="w-4 h-4" /> Distance
            </button>
            <button onClick={() => startMeasure("polygon")} style={toolBtn(measureMode === "polygon")}>
              <Hexagon className="w-4 h-4" /> Area
            </button>
            <div style={{ width: 1, height: 20, background: C.line, margin: "0 2px" }} />
            <button onClick={clearMeasure} style={toolBtn(false)} title="Clear">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
