import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free"; // Import BEFORE using L.map()
import * as esri from "esri-leaflet";
import * as turf from "@turf/turf";
import { toMercator } from "@turf/projection";
import { devLog } from "@/lib/logger";
import { queryCadastralData, queryPropertyDetails } from "@/lib/slip-wa-api";
import { PropertyControlsState } from "./PropertyControls";
import { BaseLayerType } from "./FloatingLayerControls";
import {
  calculateSetbackGeometry,
  createSetbackLayers,
} from "@/lib/setback-geometry";
import { getSetbackRequirements } from "@/lib/setback-requirements";
import { extractRCode } from "@/lib/zoning-requirements";

// Extend Leaflet Map type to include PM
declare global {
  namespace L {
    interface Map {
      pm: any;
    }
  }
}

// Fix for default markers in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LeafletMapProps {
  center?: [number, number];
  zoom?: number;
  height?: string;
  address?: string;
  layers?: {
    placesAddresses: boolean;
    propertyPlanning: boolean;
    bushfireAreas: boolean;
    infrastructure: boolean;
    water: boolean;
    terrain: boolean;
    soilType: boolean;
    health: boolean;
    schools: boolean;
    transport: boolean;
  };
  onPropertyClick?: (
    propertyData: any,
    coordinates: [number, number],
    rawGeometry?: any,
  ) => void;
  boundaryData?: {
    geometry?: any;
    boundaryLengths?: string[];
    interiorAngles?: string[];
  };
  propertyControls?: PropertyControlsState;
  onMapReady?: (map: L.Map) => void;
  subdivisionModeActive?: boolean;
  baseLayer?: BaseLayerType;
  showSetbacks?: boolean;
  setbackData?: any;
}

export function LeafletMap({
  center = [-31.9505, 115.8605], // Perth, WA
  zoom = 15,
  height = "h-[600px]",
  address,
  layers = {
    placesAddresses: false,
    propertyPlanning: false,
    bushfireAreas: false,
    infrastructure: false,
    water: false,
    terrain: false,
    soilType: false,
    health: false,
    schools: false,
    transport: false,
  },
  onPropertyClick,
  boundaryData,
  propertyControls = { boundaryDimensions: true, propertyAngles: true },
  onMapReady,
  subdivisionModeActive = false,
  baseLayer = "osm",
  showSetbacks = false,
  setbackData = null,
}: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const layersRef = useRef<{ [key: string]: any }>({});
  const highlightLayerRef = useRef<L.GeoJSON | null>(null);
  const boundaryLabelsRef = useRef<L.Layer[]>([]);
  const angleMarkersRef = useRef<L.Layer[]>([]);
  const baseLayerRef = useRef<L.TileLayer | null>(null);

  // Setback visualization layers
  const setbackLinesRef = useRef<L.GeoJSON[]>([]);
  const footprintPolygonRef = useRef<L.GeoJSON | null>(null);

  // Store current property data for re-rendering
  const currentPropertyDataRef = useRef<any>(null);

  // Clear setback visualization
  const clearSetbackVisualization = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove setback lines
    setbackLinesRef.current.forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    setbackLinesRef.current = [];

    // Remove footprint polygon
    if (
      footprintPolygonRef.current &&
      map.hasLayer(footprintPolygonRef.current)
    ) {
      map.removeLayer(footprintPolygonRef.current);
      footprintPolygonRef.current = null;
    }
  }, []);

  // Collect available polygon data from visible map layers
  const collectMapPolygons =
    useCallback((): GeoJSON.Feature<GeoJSON.Polygon>[] => {
      if (!mapInstanceRef.current) return [];

      const polygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

      try {
        // Look for any GeoJSON layers or features that might contain polygon data
        mapInstanceRef.current.eachLayer((layer: any) => {
          if (
            layer.feature &&
            layer.feature.geometry &&
            layer.feature.geometry.type === "Polygon"
          ) {
            polygons.push(layer.feature);
          }

          // Check if it's a GeoJSON layer with multiple features
          if (layer.getLayers && typeof layer.getLayers === "function") {
            layer.getLayers().forEach((subLayer: any) => {
              if (
                subLayer.feature &&
                subLayer.feature.geometry &&
                subLayer.feature.geometry.type === "Polygon"
              ) {
                polygons.push(subLayer.feature);
              }
            });
          }
        });

        devLog.log(
          `📊 Collected ${polygons.length} polygons from map layers for street detection`,
        );
      } catch (error) {
        devLog.warn("Error collecting map polygons:", error);
      }

      return polygons;
    }, []);

  // Display setback visualization
  const displaySetbackVisualization = useCallback(
    (propertyGeometry: any, setbackData: any) => {
      if (!mapInstanceRef.current || !propertyGeometry || !setbackData) return;
      const map = mapInstanceRef.current;

      devLog.log("🏗️ Processing setback analysis (no visual display)");

      try {
        // Clear existing setback visualization
        clearSetbackVisualization();

        // Convert ESRI geometry to GeoJSON
        const geoJsonFeature = {
          type: "Feature" as const,
          geometry: {
            type: "Polygon" as const,
            coordinates: propertyGeometry.rings,
          },
          properties: {},
        };

        // Collect available polygon data for street detection
        const allPolygons = collectMapPolygons();

        // Extract R-Code and get setback requirements
        const rCode = extractRCode(setbackData.zoning || "R30");
        const setbacks = getSetbackRequirements(rCode || "R30");

        // Calculate setback geometry with street adjacency detection
        const setbackGeometry = calculateSetbackGeometry(
          geoJsonFeature,
          setbacks,
          setbackData.lotArea || 400,
          false, // Don't include footprint polygon for map display
          allPolygons, // Pass polygon data for street detection
        );

        if (setbackGeometry) {
          // Setback calculation completed but no visual elements added to map
          // Visual cues removed per user request - analysis tool remains functional
          devLog.log("✅ Setback analysis calculated (no visual display)");
        }
      } catch (error) {
        console.error("❌ Error displaying setback visualization:", error);
      }
    },
    [clearSetbackVisualization, collectMapPolygons],
  );

  // Base layer configurations
  const getBaseLayerConfig = (
    layerType: BaseLayerType,
  ): { url: string; attribution: string; maxZoom: number } => {
    const configs: Record<
      BaseLayerType,
      { url: string; attribution: string; maxZoom: number }
    > = {
      osm: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      },
      satellite: {
        url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        attribution: "© Google, Maxar Technologies",
        maxZoom: 20,
      },
    };
    return configs[layerType];
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      maxZoom: 22, // Allow much closer zoom for detailed property inspection
      minZoom: 8, // Prevent zooming out too far from WA
      attributionControl: false, // Remove attribution control
    }).setView(center, zoom);

    // Add base layer tiles with performance optimizations
    const layerConfig = getBaseLayerConfig(baseLayer);
    baseLayerRef.current = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: 22, // Allow much closer zoom - will scale existing tiles beyond the provider's limit
      updateWhenIdle: true, // Update tiles only when map stops moving
      updateWhenZooming: false, // Don't update tiles during zoom animation
      keepBuffer: 4, // Keep extra tiles around for smoother panning
      crossOrigin: true, // Enable cross-origin tile loading
    }).addTo(map);

    mapInstanceRef.current = map;

    // Notify parent component that map is ready
    if (onMapReady) {
      onMapReady(map);
    }

    // Ensure PM is available before proceeding
    if (!map.pm) {
      console.error("Leaflet PM not available on map instance");
      return;
    }

    // Motion detection to mute heavy overlays during interaction
    let motion = 0;

    const toggleHeavyLayers = (visible: boolean) => {
      Object.keys(layersRef.current).forEach((layerKey) => {
        const layer = layersRef.current[layerKey];
        if (layer && layer.setOpacity) {
          // Maintain higher opacity for better visibility
          layer.setOpacity(
            visible ? (layerKey === "placesAddresses" ? 1 : 0.8) : 0.7,
          );
        }
      });
    };

    // Handle motion start (pan/zoom begins)
    const handleMotionStart = () => {
      motion++;
      toggleHeavyLayers(false);
    };

    // Handle motion end (pan/zoom completes)
    const handleMotionEnd = () => {
      if (--motion === 0) {
        // Small delay to ensure motion has fully stopped
        setTimeout(() => toggleHeavyLayers(true), 120);
      }
    };

    // Attach motion detection events
    map.on("movestart zoomstart", handleMotionStart);
    map.on("moveend zoomend", handleMotionEnd);

    return () => {
      if (mapInstanceRef.current) {
        try {
          // Clean up motion detection events
          mapInstanceRef.current.off("movestart zoomstart", handleMotionStart);
          mapInstanceRef.current.off("moveend zoomend", handleMotionEnd);

          // Clean up all layer references
          Object.keys(layersRef.current).forEach((key) => {
            try {
              const layer = layersRef.current[key];
              if (
                layer &&
                mapInstanceRef.current &&
                mapInstanceRef.current.hasLayer(layer)
              ) {
                mapInstanceRef.current.removeLayer(layer);
              }
            } catch (error) {
              devLog.warn(`Error cleaning up layer ${key}:`, error);
            }
          });
          layersRef.current = {};

          // Clean up setback visualization layers
          setbackLinesRef.current.forEach((layer) => {
            try {
              if (
                mapInstanceRef.current &&
                mapInstanceRef.current.hasLayer(layer)
              ) {
                mapInstanceRef.current.removeLayer(layer);
              }
            } catch (error) {
              devLog.warn("Error cleaning up setback line layer:", error);
            }
          });
          setbackLinesRef.current = [];

          if (
            footprintPolygonRef.current &&
            mapInstanceRef.current.hasLayer(footprintPolygonRef.current)
          ) {
            try {
              mapInstanceRef.current.removeLayer(footprintPolygonRef.current);
            } catch (error) {
              devLog.warn("Error cleaning up footprint polygon:", error);
            }
          }
          footprintPolygonRef.current = null;

          // Clean up base layer
          if (
            baseLayerRef.current &&
            mapInstanceRef.current.hasLayer(baseLayerRef.current)
          ) {
            mapInstanceRef.current.removeLayer(baseLayerRef.current);
          }
          baseLayerRef.current = null;

          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        } catch (error) {
          devLog.warn("Error during map cleanup:", error);
          mapInstanceRef.current = null;
        }
      }
    };
  }, []);

  // Add drawing and measuring functionality
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Add a delay to ensure map is fully ready
    const timer = setTimeout(() => {
      // Check if PM is available
      if (!map.pm) {
        console.error("Leaflet PM not available on map instance");
        console.error("Available methods on map:", Object.keys(map));
        return;
      }

      // 1) Controls (top-left by default) - disable problematic modes
      try {
        map.pm.addControls({
          position: "topleft",
          drawCircle: false, // circles are not true geodesic
          drawCircleMarker: false,
          cutPolygon: false,
          rotateMode: false, // disable rotate to prevent conflicts with esri layers
          removalMode: true, // enable removal mode for user-drawn features
          editMode: false, // disable edit mode to prevent conflicts
        });
      } catch (error) {
        console.error("Error adding PM controls:", error);
        return;
      }

      // Add error handling for PM operations
      map.on("pm:error", (e: any) => {
        console.error("PM Error:", e);
      });

      // Custom deletion tool: keep Geoman but provide a robust custom remover
      let customRemovalActive = false;
      let customRemovalControl: L.Control | null = null;

      const toggleCustomRemoval = () => {
        customRemovalActive = !customRemovalActive;
        if (customRemovalActive) {
          // Disable Geoman's global removal mode to avoid conflicts
          try {
            map.pm.disableGlobalRemovalMode?.();
          } catch (e) {
            /* ignore */
          }
          map.getContainer().style.cursor = "crosshair";
        } else {
          map.getContainer().style.cursor = "";
        }

        // Update control appearance
        if (customRemovalControl) {
          const el = (customRemovalControl as any)._container as HTMLElement;
          if (el) {
            if (customRemovalActive) el.classList.add("active");
            else el.classList.remove("active");
          }
        }
      };

      const handleCustomRemovalClick = (e: L.LeafletMouseEvent) => {
        if (!customRemovalActive) return;
        const point = turf.point([e.latlng.lng, e.latlng.lat]);

        // Find top-most user-drawn layer under the click
        const candidates: { layer: any; distance?: number }[] = [];

        map.eachLayer((layer: any) => {
          try {
            if (!layer) return;

            // Only consider Polylines/Polygons that were user-drawn
            if ((layer as any)._isUserDrawn) {
              const gj = (layer as any).toGeoJSON();

              if (!gj || !gj.geometry) return;

              if (
                gj.geometry.type === "Polygon" ||
                gj.geometry.type === "MultiPolygon"
              ) {
                if ((turf.booleanPointInPolygon as any)(point, gj)) {
                  candidates.push({ layer, distance: 0 });
                }
              } else if (
                gj.geometry.type === "LineString" ||
                gj.geometry.type === "MultiLineString"
              ) {
                // distance in meters
                const dist = turf.pointToLineDistance(point, gj, {
                  units: "meters",
                });
                // consider clicks within 10 meters
                if (dist <= 10) {
                  candidates.push({ layer, distance: dist });
                }
              }
            }
          } catch (err) {
            // ignore
          }
        });

        if (candidates.length === 0) return;

        // Pick closest candidate (lines) or any polygon
        candidates.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const target = candidates[0].layer;

        try {
          map.removeLayer(target);

          // Fire an event so other parts of the app can react (if needed)
          try {
            const gj = target.toGeoJSON ? target.toGeoJSON() : null;
            map.fire("user:layerremoved", { layer: target, geojson: gj });
          } catch (e) {
            // ignore
          }
        } catch (remErr) {
          devLog.warn("Failed to remove layer via custom remover:", remErr);
        }
      };

      // Create a simple control button for custom deletion
      const createCustomRemovalControl = () => {
        const ControlClass = L.Control.extend({
          options: { position: "topleft" },
          onAdd: function () {
            const container = L.DomUtil.create(
              "div",
              "leaflet-bar leaflet-control custom-remove-control",
            );
            container.style.display = "flex";
            container.style.alignItems = "center";
            container.style.justifyContent = "center";
            container.style.width = "34px";
            container.style.height = "34px";
            container.style.cursor = "pointer";
            container.title = "Toggle Delete Mode";

            const btn = L.DomUtil.create("a", "", container);
            btn.innerHTML =
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#374151" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">\n            <polyline points="3 6 5 6 21 6"></polyline>\n            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>\n            <path d="M10 11v6"></path>\n            <path d="M14 11v6"></path>\n            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>\n          </svg>';

            L.DomEvent.on(container, "click", L.DomEvent.stopPropagation)
              .on(container, "click", L.DomEvent.preventDefault)
              .on(container, "click", () => toggleCustomRemoval());

            return container;
          },
        });

        return new ControlClass();
      };

      // Add control to map
      customRemovalControl = createCustomRemovalControl();
      map.addControl(customRemovalControl);

      // Hook up click handler
      map.on("click", handleCustomRemovalClick);

      // Ensure cleanup on unload
      map.on("unload", () => {
        try {
          if (customRemovalControl) map.removeControl(customRemovalControl);
          map.off("click", handleCustomRemovalClick);
          map.getContainer().style.cursor = "";
        } catch (e) {
          // ignore
        }
      });

      // CSS for active state (minimal)
      try {
        const styleEl = document.createElement("style");
        styleEl.innerHTML = `.custom-remove-control.active { background: #fef3c7; } .custom-remove-control { background: white; }`;
        document.head.appendChild(styleEl);
      } catch (e) {
        // ignore
      }

      // Intercept geoman's enableGlobalRemovalMode to ensure safety
      const originalEnableGlobalRemovalMode =
        map.pm.enableGlobalRemovalMode?.bind(map.pm);
      if (originalEnableGlobalRemovalMode) {
        map.pm.enableGlobalRemovalMode = function () {
          ensureLayerPMSafety();
          try {
            return originalEnableGlobalRemovalMode.apply(
              this,
              arguments as any,
            );
          } catch (error) {
            devLog.warn("Error in enableGlobalRemovalMode:", error);
            return false;
          }
        };
      }

      // Handle removal mode errors specifically
      try {
        map.on("pm:globalremovalmodetoggled", (e: any) => {
          devLog.log("Removal mode toggled:", e.enabled);
          if (e.enabled) {
            // Ensure all layers have proper PM setup before removal
            ensureLayerPMSafety();
          }
        });
      } catch (error) {
        devLog.warn("Error setting up removal mode event handler:", error);
      }

      // Ensure new layers get proper PM objects when added
      map.on("layeradd", (e: any) => {
        try {
          if (e.layer) {
            initializeLayerPM(e.layer);
          }
        } catch (error) {
          devLog.warn("Error initializing PM for new layer:", error);
        }
      });

      // Debug: Check if control container exists
      setTimeout(() => {
        const controlContainer = document.querySelector(
          ".leaflet-control-container",
        );
        const pmToolbar = document.querySelector(".leaflet-pm-toolbar");
        devLog.log("Control container exists:", !!controlContainer);
        devLog.log("PM toolbar exists:", !!pmToolbar);
        devLog.log(
          "Control container style:",
          controlContainer
            ? getComputedStyle(controlContainer).zIndex
            : "not found",
        );
        if (pmToolbar) {
          devLog.log("PM toolbar style:", getComputedStyle(pmToolbar));
        }
      }, 500);

      // Set initial button states based on current zoom (with error handling)
      try {
        const currentZoom = map.getZoom();
        if (
          map.pm.Toolbar &&
          typeof map.pm.Toolbar.setButtonDisabled === "function"
        ) {
          if (currentZoom < 14) {
            map.pm.Toolbar.setButtonDisabled("Polygon", true);
          }
          if (currentZoom < 12) {
            map.pm.Toolbar.setButtonDisabled("Line", true);
          }
        }

        // Optional: constrain draw to reasonable zooms
        map.on("zoomend", () => {
          try {
            const z = map.getZoom();
            if (
              map.pm.Toolbar &&
              typeof map.pm.Toolbar.setButtonDisabled === "function"
            ) {
              map.pm.Toolbar.setButtonDisabled("Polygon", z < 14);
              map.pm.Toolbar.setButtonDisabled("Line", z < 12);
            }
          } catch (error) {
            devLog.warn("Error updating PM toolbar on zoom:", error);
          }
        });
      } catch (error) {
        devLog.warn("Error setting up PM toolbar:", error);
      }

      // 2) Style new drawings
      map.pm.setGlobalOptions({
        snappable: true,
        snapDistance: 15,
        continueDrawing: false,
        templineStyle: { color: "#2563eb", weight: 2 },
        hintlineStyle: { color: "#2563eb", dashArray: [4, 4], weight: 2 },
        pathOptions: { color: "#0ea5e9", weight: 2, fillOpacity: 0.08 },
        ignoreShapes: ["ImageOverlay", "GridLayer", "TileLayer"], // ignore non-vector layers
      });

      // Disable problematic global modes to prevent conflicts and errors
      try {
        map.pm.disableGlobalRotateMode?.();
        map.pm.disableGlobalEditMode?.();
        map.pm.disableGlobalDragMode?.();
        // Note: Not disabling removalMode to allow deletion of user-drawn features
      } catch (error) {
        devLog.warn("Error disabling PM global modes:", error);
      }

      // Add protection for base layers while allowing removal of user-drawn features
      const initializeLayerPM = (layer: any) => {
        const isUserDrawn = layer._isUserDrawn || false;

        if (!layer.pm) {
          // Create complete PM object for layers without PM
          layer.pm = {
            _pmIgnore: true,
            allowRemoval: false,
            draggable: false,
            rotatable: false,
            editable: false,
            disableLayerDrag: () => {},
            enableLayerDrag: () => {},
            disable: () => {},
            enable: () => {},
            enabled: () => false,
            getOptions: () => ({
              allowRemoval: isUserDrawn,
              draggable: false,
              rotatable: false,
              editable: false,
            }),
            setOptions: (options: any) => {
              // Update the stored options
              try {
                const currentOptions = layer.pm.getOptions();
                if (
                  currentOptions &&
                  typeof currentOptions === "object" &&
                  options
                ) {
                  Object.assign(currentOptions, options);
                }
              } catch (e) {
                devLog.warn("Error in setOptions:", e);
              }
            },
            _shape: layer.constructor.name || "Unknown",
          };
        } else {
          // For layers with existing PM, ensure getOptions() works properly
          try {
            // Test if getOptions exists and works
            let options = null;
            try {
              options = layer.pm.getOptions ? layer.pm.getOptions() : null;
            } catch (e) {
              devLog.warn("Error calling getOptions on layer:", e);
              options = null;
            }

            if (!options || typeof options !== "object") {
              // Create a new getOptions function if missing or broken
              const defaultOptions = {
                allowRemoval: isUserDrawn,
                draggable: false,
                rotatable: false,
                editable: false,
              };

              layer.pm.getOptions = () => ({ ...defaultOptions });
              options = defaultOptions;
            } else {
              // Update existing options
              options.allowRemoval = isUserDrawn;
            }

            // Ensure setOptions exists
            if (!layer.pm.setOptions) {
              layer.pm.setOptions = (newOptions: any) => {
                try {
                  const currentOptions = layer.pm.getOptions();
                  if (
                    currentOptions &&
                    typeof currentOptions === "object" &&
                    newOptions
                  ) {
                    Object.assign(currentOptions, newOptions);
                  }
                } catch (e) {
                  devLog.warn("Error in setOptions:", e);
                }
              };
            }
          } catch (error) {
            devLog.warn("Error fixing PM object for layer:", error);
            // Fallback: replace the entire PM object with safe defaults
            const safeOptions = {
              allowRemoval: isUserDrawn,
              draggable: false,
              rotatable: false,
              editable: false,
            };

            layer.pm = {
              getOptions: () => ({ ...safeOptions }),
              setOptions: (newOptions: any) => {
                if (newOptions && typeof newOptions === "object") {
                  Object.assign(safeOptions, newOptions);
                }
              },
              disable: () => {},
              enable: () => {},
              enabled: () => false,
              _pmIgnore: true,
            };
          }
        }
      };

      // Add comprehensive safety check before any PM operations
      const ensureLayerPMSafety = () => {
        try {
          map.eachLayer((layer: any) => {
            try {
              // Force initialization for ALL layers, even if they think they have PM
              if (!layer.pm) {
                initializeLayerPM(layer);
              } else {
                // Verify and fix existing PM objects
                if (
                  !layer.pm.getOptions ||
                  typeof layer.pm.getOptions !== "function"
                ) {
                  initializeLayerPM(layer);
                } else {
                  // Test that getOptions actually works and returns valid object
                  try {
                    const opts = layer.pm.getOptions();
                    if (
                      !opts ||
                      typeof opts !== "object" ||
                      opts.allowRemoval === undefined
                    ) {
                      initializeLayerPM(layer);
                    }
                  } catch (e) {
                    initializeLayerPM(layer);
                  }
                }
              }
            } catch (layerError) {
              devLog.warn("Error ensuring PM for layer:", layerError);
              // Force a basic PM object as last resort
              try {
                layer.pm = {
                  getOptions: () => ({
                    allowRemoval: false,
                    draggable: false,
                    rotatable: false,
                    editable: false,
                  }),
                  setOptions: () => {},
                  _pmIgnore: true,
                };
              } catch (fallbackError) {
                devLog.warn("Even fallback PM creation failed:", fallbackError);
              }
            }
          });
        } catch (eachLayerError) {
          devLog.warn("Error in ensureLayerPMSafety:", eachLayerError);
        }
      };

      // Initialize PM for all existing layers with comprehensive safety
      try {
        ensureLayerPMSafety(); // Use the comprehensive safety function
      } catch (error) {
        console.error("Error during initial layer PM setup:", error);
      }

      // Performance optimization: Removed periodic safety check that was causing CPU overhead
      // Instead, we rely on event-driven layeradd checks and initial setup
      // This eliminates the expensive map.eachLayer() scan every 5 seconds

      // Clean up any intervals when map is destroyed
      map.on("unload", () => {
        // No periodic intervals to clean up anymore - better performance
      });

      // Initialize PM for any new layers added to prevent errors
      map.on("layeradd", (e: any) => {
        try {
          const layer = e.layer;
          // Add a small delay to ensure layer is fully initialized
          setTimeout(() => {
            try {
              initializeLayerPM(layer);
            } catch (error) {
              devLog.warn("Error initializing PM for new layer:", error);
            }
          }, 0);
        } catch (error) {
          devLog.warn("Error in layeradd event handler:", error);
        }
      });

      // Run safety check before enabling removal mode
      map.on("pm:globalremovalmodeenabled", ensureLayerPMSafety);

      // 3) Format helpers
      const fmt = (n: number) => n.toLocaleString();
      const m2ToHa = (m2: number) => +(m2 / 10_000).toFixed(4);
      const mToKm = (m: number) => +(m / 1000).toFixed(3);

      // 4) Compute metrics
      const computeMetrics = (layer: L.Layer) => {
        const gj = (layer as any).toGeoJSON(); // Polygon/LineString in WGS84

        if (
          gj.geometry.type === "Polygon" ||
          gj.geometry.type === "MultiPolygon"
        ) {
          // Area: Use geodesic calculation directly on WGS84 coordinates for accuracy
          // Turf.area() with geodesic=true is more accurate than Mercator projection
          const sqm = Math.max(0, turf.area(gj)); // geodesic calculation by default
          const ha = m2ToHa(sqm);
          return { kind: "area" as const, sqm: Math.round(sqm), ha };
        }

        if (
          gj.geometry.type === "LineString" ||
          gj.geometry.type === "MultiLineString"
        ) {
          // Length: geodesic along WGS84
          const km = turf.length(gj, { units: "kilometers" });
          const m = Math.round(km * 1000);
          return { kind: "length" as const, m, km: mToKm(m) };
        }

        return null;
      };

      // 5) Show measurements live while drawing
      map.on("pm:drawstart", (e: any) => {
        const tempLayer = e.workingLayer as L.Layer;

        const updateTooltip = () => {
          const m = computeMetrics(tempLayer);
          if (!m) return;
          let html = "";
          if (m.kind === "area") {
            html = `<b>Area</b><br>${fmt(m.sqm)} m² (${m.ha} ha)`;
          } else {
            html = `<b>Length</b><br>${fmt(m.m)} m (${m.km} km)`;
          }
          // bind a moving tooltip
          (tempLayer as any)
            .bindTooltip(html, { sticky: true, opacity: 0.9 })
            .openTooltip();
        };

        tempLayer.on("pm:vertexadded", updateTooltip);
        tempLayer.on("pm:update", updateTooltip);
      });

      // 6) Finalize on create
      const onCreate = (e: any) => {
        const layer = e.layer as L.Layer;
        const m = computeMetrics(layer);
        if (!m) return;

        // Mark this layer as user-drawn so it can be deleted
        (layer as any)._isUserDrawn = true;

        // Update PM options to allow removal for this specific layer
        if ((layer as any).pm && (layer as any).pm.getOptions) {
          try {
            const options = (layer as any).pm.getOptions();
            if (options && typeof options === "object") {
              options.allowRemoval = true;
            }
          } catch (error) {
            devLog.warn(
              "Error updating PM options for user-drawn layer:",
              error,
            );
          }
        }

        let html = "";
        if (m.kind === "area") {
          html = `<b>Area</b><br>${fmt(m.sqm)} m² (${m.ha} ha)`;
        } else {
          html = `<b>Length</b><br>${fmt(m.m)} m (${m.km} km)`;
        }

        // Nice, draggable label
        (layer as any)
          .bindTooltip(html, {
            permanent: true,
            direction: "center",
            className: "measure-label",
            opacity: 0.9,
          })
          .openTooltip();

        // Optional: style finalized features stronger
        if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
          layer.setStyle?.({ color: "#0ea5e9", weight: 2 });
        }

        // Optional: export GeoJSON for your sidebar
        // const gj = (layer as any).toGeoJSON();
        // onMeasure?.(gj, m);
      };

      map.on("pm:create", onCreate);

      // 7) Keep labels correct on edit
      const onEdit = (e: any) => {
        const layer = e.layer as L.Layer;
        const m = computeMetrics(layer);
        if (!m) return;
        let html = "";
        if (m.kind === "area")
          html = `<b>Area</b><br>${fmt(m.sqm)} m² (${m.ha} ha)`;
        else html = `<b>Length</b><br>${fmt(m.m)} m (${m.km} km)`;
        (layer as any).setTooltipContent?.(html);
      };
      map.on("pm:edit", onEdit);

      // 8) Keyboard: hold Shift to disable snapping (native Geoman), ESC to cancel draw
      // nothing to implement—Geoman handles it
    }, 200);

    // Function to add interior angle markers at corners
    const addAngleMarkers = (
      coordinates: number[][][],
      interiorAngles: string[],
    ) => {
      // Clear existing angle markers
      angleMarkersRef.current.forEach((marker) => map.removeLayer(marker));
      angleMarkersRef.current = [];

      if (
        !coordinates[0] ||
        !interiorAngles ||
        !propertyControls.propertyAngles
      )
        return;

      const ring = coordinates[0]; // Outer ring
      const numVertices = ring.length - 1; // Last point is same as first

      for (let i = 0; i < numVertices; i++) {
        const [lng, lat] = ring[i];

        // Create angle marker icon
        const angleIcon = L.divIcon({
          className: "angle-marker",
          html: `<div style="
            background: rgba(46, 125, 50, 0.95);
            padding: 3px 6px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            border: 1.5px solid #2e7d32;
            color: white;
            white-space: nowrap;
            text-align: center;
            line-height: 1;
            font-family: 'Courier New', monospace;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${interiorAngles[i] || ""}</div>`,
          iconSize: [80, 20],
          iconAnchor: [40, 10],
        });

        // Create marker at vertex
        const angleMarker = L.marker([lat, lng], {
          icon: angleIcon,
          interactive: false,
        }).addTo(map);

        angleMarkersRef.current.push(angleMarker);
      }
    };

    // Function to add boundary length labels on the map
    const addBoundaryLabels = (
      coordinates: number[][][],
      boundaryLengths: string[],
    ) => {
      // Clear existing labels
      boundaryLabelsRef.current.forEach((label) => map.removeLayer(label));
      boundaryLabelsRef.current = [];

      // Also clear angle markers when updating labels
      angleMarkersRef.current.forEach((marker) => map.removeLayer(marker));
      angleMarkersRef.current = [];

      if (
        !coordinates[0] ||
        !boundaryLengths ||
        !propertyControls.boundaryDimensions
      )
        return;

      const ring = coordinates[0]; // Outer ring

      for (let i = 0; i < ring.length - 1; i++) {
        const [lng1, lat1] = ring[i];
        const [lng2, lat2] = ring[i + 1];

        // Calculate midpoint
        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;

        // Convert geographic coordinates to screen coordinates for accurate angle calculation
        const point1 = map.latLngToContainerPoint([lat1, lng1]);
        const point2 = map.latLngToContainerPoint([lat2, lng2]);

        // Calculate angle based on screen pixel coordinates for perfect parallel alignment
        let angle =
          (Math.atan2(point2.y - point1.y, point2.x - point1.x) * 180) /
          Math.PI;

        // Normalize angle to keep text readable (never upside down)
        if (angle > 90) {
          angle = angle - 180;
        } else if (angle < -90) {
          angle = angle + 180;
        }

        // Extract just the length value from the boundary length string
        const lengthMatch = boundaryLengths[i]?.match(/(\d+\.\d+)m/);
        const lengthValue = lengthMatch ? lengthMatch[1] + "m" : `${i + 1}`;

        // Create a div icon for the label with perfect parallel alignment
        const labelIcon = L.divIcon({
          className: "boundary-label",
          html: `<div style="
            background: rgba(255, 255, 255, 0.95);
            padding: 2px 6px;
            border-radius: 2px;
            font-size: 11px;
            font-weight: 700;
            border: 1.5px solid #ff6b35;
            color: #333;
            transform: rotate(${angle}deg);
            white-space: nowrap;
            text-align: center;
            line-height: 1.1;
            font-family: 'Inter', system-ui, sans-serif;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
          ">${lengthValue}</div>`,
          iconSize: [50, 16],
          iconAnchor: [25, 8],
        });

        // Create marker with the label
        const labelMarker = L.marker([midLat, midLng], {
          icon: labelIcon,
          interactive: false, // Make labels non-interactive so they don't interfere with clicks
        }).addTo(map);

        boundaryLabelsRef.current.push(labelMarker);
      }
    };

    // Add map click handler for property selection
    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      // Don't handle clicks if a drawing tool is active
      if (map.pm.globalDrawModeEnabled() || map.pm.globalEditModeEnabled()) {
        return;
      }

      // Don't handle property selection if subdivision mode is active
      if (subdivisionModeActive) {
        return;
      }

      const { lat, lng } = e.latlng;
      devLog.log("🎯 Map clicked at:", [lat, lng]);

      try {
        // Query property data at clicked coordinates
        const propertyData = await queryPropertyDetails({
          coordinates: [lat, lng],
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        });

        // Query cadastral geometry for boundary highlight
        const cadastralResult = await queryCadastralData({
          coordinates: [lat, lng],
        });

        // Use ONLY Places and Addresses service for both geometry and data
        let cadastralData = null;
        let cadastralInfo = null;

        try {
          devLog.log(
            "🔍 Querying Places and Addresses for cadastral data at:",
            [lat, lng],
          );

          // First try layer 4 (large scale) for current data
          const restUrl4 =
            `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/4/query?` +
            new URLSearchParams({
              f: "json",
              returnGeometry: "true",
              spatialRel: "esriSpatialRelIntersects",
              geometry: `${lng},${lat}`,
              geometryType: "esriGeometryPoint",
              inSR: "4326",
              outSR: "4326",
              outFields:
                "land_id,road_number_1,road_number_2,road_name,road_type,road_suffix,locality,lot_number",
              maxRecordCount: "1",
              // High-precision geometry parameters
              maxAllowableOffset: "0.000001", // 1e-6 degrees ≈ 0.11m precision
              geometryPrecision: "12", // 12 decimal places for cadastral precision
            });

          devLog.log("🔍 Places and Addresses Query URL (Layer 4):", restUrl4);

          const restResponse4 = await fetch(restUrl4);
          if (restResponse4.ok) {
            const restData4 = await restResponse4.json();
            devLog.log(
              "🔍 Places and Addresses response (Layer 4):",
              restData4,
            );

            if (restData4.features && restData4.features.length > 0) {
              cadastralData = { features: restData4.features };
              cadastralInfo = restData4.features[0].attributes;
              devLog.log(
                "✅ Current cadastral data retrieved from Layer 4:",
                cadastralInfo,
              );
            }
          }

          // If layer 4 didn't work, try layer 3 (small scale)
          if (!cadastralData) {
            devLog.log("⚠️ No features found in Layer 4, trying Layer 3...");

            const restUrl3 =
              `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/3/query?` +
              new URLSearchParams({
                f: "json",
                returnGeometry: "true",
                spatialRel: "esriSpatialRelIntersects",
                geometry: `${lng},${lat}`,
                geometryType: "esriGeometryPoint",
                inSR: "4326",
                outSR: "4326",
                outFields:
                  "land_id,road_number_1,road_number_2,road_name,road_type,road_suffix,locality,lot_number",
                maxRecordCount: "1",
                // High-precision geometry parameters
                maxAllowableOffset: "0.000001", // 1e-6 degrees ≈ 0.11m precision
                geometryPrecision: "12", // 12 decimal places for cadastral precision
              });

            const restResponse3 = await fetch(restUrl3);
            if (restResponse3.ok) {
              const restData3 = await restResponse3.json();
              devLog.log(
                "���� Places and Addresses response (Layer 3):",
                restData3,
              );

              if (restData3.features && restData3.features.length > 0) {
                cadastralData = { features: restData3.features };
                cadastralInfo = restData3.features[0].attributes;
                devLog.log(
                  "✅ Current cadastral data retrieved from Layer 3:",
                  cadastralInfo,
                );
              }
            }
          }
        } catch (error) {
          console.error(
            "❌ Error querying Places and Addresses cadastral data:",
            error,
          );
        }

        if (
          cadastralData &&
          cadastralData.features &&
          cadastralData.features.length > 0
        ) {
          const feature = cadastralData.features[0];

          // Debug: Log geometry precision details
          const vertexCount = feature.geometry?.rings?.[0]?.length || 0;
          devLog.log(`🎯 LeafletMap geometry: Vertices: ${vertexCount}`);

          if (vertexCount > 0) {
            const sampleCoords = feature.geometry.rings[0].slice(0, 3);
            devLog.log(`📐 LeafletMap sample coordinates:`, sampleCoords);
          }

          // Convert ESRI geometry to GeoJSON
          if (feature.geometry && feature.geometry.rings) {
            const geoJsonFeature = {
              type: "Feature" as const,
              geometry: {
                type: "Polygon" as const,
                coordinates: feature.geometry.rings,
              },
              properties: feature.attributes,
            };

            // Remove existing highlight
            if (highlightLayerRef.current) {
              map.removeLayer(highlightLayerRef.current);
            }

            // Add new highlight layer
            highlightLayerRef.current = L.geoJSON(geoJsonFeature, {
              style: {
                color: "#ff6b35",
                weight: 3,
                opacity: 1,
                fillOpacity: 0.1,
                fillColor: "#ff6b35",
              },
              // Disable Leaflet simplification for precise boundaries
              smoothFactor: 0,
            }).addTo(map);

            // Store property data for toggle functionality
            currentPropertyDataRef.current = {
              geometry: feature.geometry,
              boundaryLengths: propertyData.boundaryLengths,
              interiorAngles: propertyData.interiorAngles,
            };

            // Update property displays
            updatePropertyDisplays();

            devLog.log(
              "✅ Property boundary highlighted with labels and angles",
            );
          }

          // Merge cadastral info with property data
          const enhancedPropertyData = {
            ...propertyData,
            cadastralInfo: cadastralInfo,
          };

          // Call the callback with enhanced property data and raw geometry
          if (onPropertyClick) {
            onPropertyClick(enhancedPropertyData, [lat, lng], feature.geometry);
          }
        } else {
          devLog.log("⚠️ No property found at clicked location");
        }
      } catch (error) {
        console.error("❌ Error querying property:", error);
      }
    };

    map.on("click", handleMapClick);

    return () => {
      clearTimeout(timer);
      if (map.pm) {
        try {
          map.off("pm:create");
          map.off("pm:edit");
          // Disable all PM modes safely
          if (typeof map.pm.disableGlobalRemovalMode === "function") {
            map.pm.disableGlobalRemovalMode();
          }
          if (typeof map.pm.disableGlobalDragMode === "function") {
            map.pm.disableGlobalDragMode();
          }
          if (typeof map.pm.disableGlobalRotateMode === "function") {
            map.pm.disableGlobalRotateMode();
          }
          if (typeof map.pm.disableGlobalEditMode === "function") {
            map.pm.disableGlobalEditMode();
          }
        } catch (error) {
          devLog.warn("Error cleaning up PM modes:", error);
        }
      }

      try {
        map.off("click", handleMapClick);
        map.off("layeradd");
      } catch (error) {
        devLog.warn("Error removing map event listeners:", error);
      }

      // Clean up boundary labels and angle markers safely
      try {
        boundaryLabelsRef.current.forEach((label) => {
          if (map.hasLayer(label)) map.removeLayer(label);
        });
        boundaryLabelsRef.current = [];
        angleMarkersRef.current.forEach((marker) => {
          if (map.hasLayer(marker)) map.removeLayer(marker);
        });
        angleMarkersRef.current = [];
      } catch (error) {
        devLog.warn("Error cleaning up map layers:", error);
      }
    };
  }, [subdivisionModeActive]);

  // Effect to handle subdivision mode changes and force map redraw
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Check map container dimensions
    if (mapRef.current) {
      devLog.log("📐 Map container dimensions:", {
        width: mapRef.current.offsetWidth,
        height: mapRef.current.offsetHeight,
        visible: mapRef.current.offsetParent !== null,
      });
    }

    // Force map to redraw when subdivision mode changes with multiple approaches
    setTimeout(() => {
      try {
        // First invalidate size without animation
        map.invalidateSize({ animate: false, pan: false });

        // Then force a tile refresh
        map.eachLayer((layer: any) => {
          if (layer.redraw && typeof layer.redraw === "function") {
            layer.redraw();
          }
        });

        // Ensure container is visible
        const container = map.getContainer();
        container.style.visibility = "visible";
        container.style.display = "block";

        // Force a repaint
        container.style.transform = "translateZ(0)";

        devLog.log(
          "🗺️ Map refreshed for subdivision mode:",
          subdivisionModeActive,
        );
      } catch (error) {
        devLog.warn("Error refreshing map:", error);
      }
    }, 100);
  }, [subdivisionModeActive]);

  // Update map center and add marker when center prop changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Only update center if it's significantly different (avoid unnecessary updates)
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const centerChanged =
      Math.abs(currentCenter.lat - center[0]) > 0.0001 ||
      Math.abs(currentCenter.lng - center[1]) > 0.0001;

    devLog.log("🎯 Map center check:", {
      currentCenter: [currentCenter.lat, currentCenter.lng],
      newCenter: center,
      currentZoom,
      targetZoom: zoom,
      centerChanged,
      address,
    });

    // Update map view - use provided zoom if center changed significantly (like from address search)
    if (centerChanged) {
      // If an address is provided, use the passed zoom level for proper address viewing
      // Otherwise maintain current zoom for property clicks
      const targetZoom = address ? zoom : map.getZoom();
      devLog.log(
        "🎯 Map center updating from:",
        [currentCenter.lat, currentCenter.lng],
        "to:",
        center,
        "zoom:",
        targetZoom,
      );
      map.setView(center, targetZoom);
      devLog.log("��� Map center updated successfully");
    } else {
      devLog.log(
        "🎯 Map center NOT updated - change too small or same location",
      );
    }

    // Remove existing marker
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
    }

    // Add new marker if address is provided
    if (address) {
      const marker = L.marker(center).addTo(map);
      marker.bindPopup(`<b>${address}</b>`);
      markerRef.current = marker;
    }
  }, [center, zoom, address]);

  // Debug logging to track prop changes
  useEffect(() => {
    devLog.log("🎯 LeafletMap props changed:", { center, zoom, address });
  }, [center, zoom, address]);

  // Function to update property displays based on current controls
  const updatePropertyDisplays = () => {
    if (!mapInstanceRef.current || !currentPropertyDataRef.current) return;

    const map = mapInstanceRef.current;
    const propertyData = currentPropertyDataRef.current;

    devLog.log("🔄 Updating property displays:", {
      boundaryDimensions: propertyControls.boundaryDimensions,
      propertyAngles: propertyControls.propertyAngles,
      hasLabels: boundaryLabelsRef.current.length > 0,
      hasMarkers: angleMarkersRef.current.length > 0,
    });

    // Clear existing labels and markers
    boundaryLabelsRef.current.forEach((label) => map.removeLayer(label));
    boundaryLabelsRef.current = [];
    angleMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    angleMarkersRef.current = [];

    if (propertyData.geometry) {
      const coordinates =
        propertyData.geometry.coordinates || propertyData.geometry.rings;

      // Add boundary labels if enabled
      if (propertyControls.boundaryDimensions && propertyData.boundaryLengths) {
        devLog.log("✅ Adding boundary labels");
        const ring = coordinates[0];
        for (let i = 0; i < ring.length - 1; i++) {
          const [lng1, lat1] = ring[i];
          const [lng2, lat2] = ring[i + 1];

          const midLat = (lat1 + lat2) / 2;
          const midLng = (lng1 + lng2) / 2;

          const point1 = map.latLngToContainerPoint([lat1, lng1]);
          const point2 = map.latLngToContainerPoint([lat2, lng2]);

          let angle =
            (Math.atan2(point2.y - point1.y, point2.x - point1.x) * 180) /
            Math.PI;

          if (angle > 90) {
            angle = angle - 180;
          } else if (angle < -90) {
            angle = angle + 180;
          }

          const lengthMatch =
            propertyData.boundaryLengths[i]?.match(/(\d+\.\d+)m/);
          const lengthValue = lengthMatch ? lengthMatch[1] + "m" : `${i + 1}`;

          const labelIcon = L.divIcon({
            className: "boundary-label",
            html: `<div style="
              background: rgba(255, 255, 255, 0.95);
              padding: 2px 6px;
              border-radius: 2px;
              font-size: 11px;
              font-weight: 700;
              border: 1.5px solid #ff6b35;
              color: #333;
              transform: rotate(${angle}deg);
              white-space: nowrap;
              text-align: center;
              line-height: 1.1;
              font-family: 'Inter', system-ui, sans-serif;
              box-shadow: 0 1px 3px rgba(0,0,0,0.2);
              display: flex;
              align-items: center;
              justify-content: center;
            ">${lengthValue}</div>`,
            iconSize: [50, 16],
            iconAnchor: [25, 8],
          });

          const labelMarker = L.marker([midLat, midLng], {
            icon: labelIcon,
            interactive: false,
          }).addTo(map);

          boundaryLabelsRef.current.push(labelMarker);
        }
      } else {
        devLog.log("��� Boundary labels disabled or no data");
      }

      // Add angle markers if enabled
      if (propertyControls.propertyAngles && propertyData.interiorAngles) {
        devLog.log("✅ Adding angle markers");
        const ring = coordinates[0];
        const numVertices = ring.length - 1;

        for (let i = 0; i < numVertices; i++) {
          const [lng, lat] = ring[i];

          const angleIcon = L.divIcon({
            className: "angle-marker",
            html: `<div style="
              background: rgba(46, 125, 50, 0.95);
              padding: 3px 6px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 700;
              border: 1.5px solid #2e7d32;
              color: white;
              white-space: nowrap;
              text-align: center;
              line-height: 1;
              font-family: 'Courier New', monospace;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${propertyData.interiorAngles[i] || ""}</div>`,
            iconSize: [80, 20],
            iconAnchor: [40, 10],
          });

          const angleMarker = L.marker([lat, lng], {
            icon: angleIcon,
            interactive: false,
          }).addTo(map);

          angleMarkersRef.current.push(angleMarker);
        }
      } else {
        devLog.log("❌ Angle markers disabled or no data");
      }
    }
  };

  // Effect to handle property controls changes
  useEffect(() => {
    devLog.log("������� Property controls changed:", propertyControls);
    updatePropertyDisplays();
  }, [propertyControls.boundaryDimensions, propertyControls.propertyAngles]);

  // Handle boundary data updates (from searches)
  useEffect(() => {
    if (!mapInstanceRef.current || !boundaryData) return;

    const map = mapInstanceRef.current;

    if (boundaryData.geometry && boundaryData.boundaryLengths) {
      // Remove existing highlight and labels
      if (highlightLayerRef.current) {
        map.removeLayer(highlightLayerRef.current);
      }

      // Convert ESRI geometry to GeoJSON if needed
      let geoJsonGeometry = boundaryData.geometry;
      if (boundaryData.geometry.rings) {
        geoJsonGeometry = {
          type: "Polygon",
          coordinates: boundaryData.geometry.rings,
        };
      }

      // Add highlight layer
      const featureObj: GeoJSON.Feature = {
        type: "Feature",
        geometry: geoJsonGeometry,
        properties: {},
      };

      highlightLayerRef.current = L.geoJSON(featureObj, {
        style: {
          color: "#ff6b35",
          weight: 3,
          opacity: 1,
          fillOpacity: 0.1,
          fillColor: "#ff6b35",
        },
        // Disable Leaflet simplification for precise boundaries
        smoothFactor: 0,
      }).addTo(map);

      // Store property data for toggle functionality
      currentPropertyDataRef.current = {
        geometry: geoJsonGeometry,
        boundaryLengths: boundaryData.boundaryLengths,
        interiorAngles: boundaryData.interiorAngles,
      };

      // Update property displays based on current controls
      updatePropertyDisplays();
    }
  }, [boundaryData]);

  // Handle layer toggles
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Places and Addresses WMS layer
    if (layers.placesAddresses && !layersRef.current.placesAddresses) {
      try {
        const layer = L.tileLayer.wms(
          "https://public-services.slip.wa.gov.au/public/services/SLIP_Public_Services/Places_and_Addresses/MapServer/WMSServer",
          {
            layers: "0", // Block Lines - Cadastre layer
            format: "image/png",
            transparent: true,
            opacity: 1,
            maxZoom: 22,
            attribution: "",
            // Enhanced styling for better visibility
            styles: "",
            version: "1.3.0",
            crs: L.CRS.EPSG3857,
            className: "cadastre-layer", // Add custom class for CSS targeting
            // Cache-busting: Add timestamp parameter to force fresh tiles from SLIP WA
            // This ensures the latest subdivisions are always displayed
            _v: Date.now(),
          } as any,
        );

        // Add error handling before adding to map
        layer.on("tileerror", (error: any) => {
          devLog.warn("Places addresses WMS layer error:", error);
        });

        layer.addTo(map);
        layersRef.current.placesAddresses = layer;

        // Force immediate refresh for enhanced visibility
        setTimeout(() => {
          if (layer.setOpacity) {
            layer.setOpacity(1);
          }
          if (layer.redraw && typeof layer.redraw === "function") {
            layer.redraw();
          }
        }, 100);
      } catch (error) {
        console.error("Failed to create places addresses WMS layer:", error);
      }
    } else if (!layers.placesAddresses && layersRef.current.placesAddresses) {
      try {
        if (map.hasLayer(layersRef.current.placesAddresses)) {
          map.removeLayer(layersRef.current.placesAddresses);
        }
        delete layersRef.current.placesAddresses;
      } catch (error) {
        devLog.warn("Error removing placesAddresses layer:", error);
        delete layersRef.current.placesAddresses;
      }
    }

    // Property and Planning layer (R-Codes, ID 111)
    if (layers.propertyPlanning && !layersRef.current.propertyPlanning) {
      devLog.log(
        "🏗️ Adding R-Codes Zoning layer (Property & Planning Layer 111)...",
      );

      // Validate ESRI is available
      if (!esri || !esri.dynamicMapLayer) {
        console.error("❌ ESRI Leaflet not available");
        return;
      }

      try {
        const layerUrl =
          "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer";
        devLog.log("🔗 Creating layer with URL:", layerUrl);

        const layer = esri.dynamicMapLayer({
          url: layerUrl,
          layers: [111], // Local Planning Scheme - R Codes
          opacity: 1,
          maxZoom: 22,
          updateWhenIdle: true, // Performance optimization
          reuseTiles: true, // Reuse tiles when possible
          // Add additional error handling parameters
          useCors: false, // Disable CORS to avoid potential issues
          timeout: 15000, // 15 second timeout
        });

        // Add comprehensive event listeners before adding to map
        layer.on("loading", () => {
          devLog.log("⏳ R-Codes layer loading...");
        });

        devLog.log("��� Layer created, adding to map...");
        layer.addTo(map);

        layersRef.current.propertyPlanning = layer;
        devLog.log("✅ R-Codes Zoning layer added successfully");

        // Add error event listener with detailed logging
        layer.on("error", (error: any) => {
          console.error("❌ R-Codes Zoning layer error details:");
          console.error("Error object:", error);
          console.error("Error type:", typeof error);
          console.error("Error keys:", Object.keys(error || {}));
          console.error("Error message:", error?.message || "No message");
          console.error(
            "Error status:",
            error?.status || error?.code || "No status",
          );
          console.error("Full error JSON:", JSON.stringify(error, null, 2));
        });

        // Add load event listener
        layer.on("load", () => {
          devLog.log("✅ R-Codes Zoning layer loaded successfully");
        });

        // Add request event listener for debugging
        layer.on("request", (e: any) => {
          devLog.log("🔄 R-Codes layer request:", e.url);
        });

        // Add response event listener
        layer.on("response", (e: any) => {
          devLog.log("📥 R-Codes layer response received");
        });
      } catch (error) {
        console.error("❌ Failed to add R-Codes Zoning layer:", error);

        // Try alternative URL/service as fallback
        devLog.log("🔄 Attempting fallback R-Codes layer...");
        try {
          const fallbackUrl =
            "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer";
          devLog.log("🔗 Trying fallback URL:", fallbackUrl);

          const fallbackLayer = esri.dynamicMapLayer({
            url: fallbackUrl,
            layers: [111],
            opacity: 1,
            maxZoom: 22,
            updateWhenIdle: true,
            reuseTiles: true,
            useCors: false,
          });

          fallbackLayer.on("error", (error: any) => {
            console.error(
              "❌ Fallback R-Codes layer also failed:",
              JSON.stringify(error, null, 2),
            );
            devLog.warn(
              "🚫 R-Codes layer unavailable - continuing without zoning overlay",
            );
          });

          fallbackLayer.on("load", () => {
            devLog.log("✅ Fallback R-Codes layer loaded successfully");
          });

          fallbackLayer.addTo(map);
          layersRef.current.propertyPlanning = fallbackLayer;
        } catch (fallbackError) {
          console.error(
            "❌ Fallback R-Codes layer creation failed:",
            fallbackError,
          );
          devLog.warn(
            "🚫 R-Codes visualization unavailable - property data queries will still work",
          );
        }
      }
    } else if (!layers.propertyPlanning && layersRef.current.propertyPlanning) {
      devLog.log("���️ Removing R-Codes Zoning layer...");
      try {
        if (map.hasLayer(layersRef.current.propertyPlanning)) {
          map.removeLayer(layersRef.current.propertyPlanning);
        }
        delete layersRef.current.propertyPlanning;
        devLog.log("✅ R-Codes Zoning layer removed");
      } catch (error) {
        devLog.warn("Error removing propertyPlanning layer:", error);
        delete layersRef.current.propertyPlanning;
      }
    }

    // Bush Fire Prone Areas (dynamic map)
    if (layers.bushfireAreas && !layersRef.current.bushfireAreas) {
      try {
        const bfpa = esri.dynamicMapLayer({
          url: "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas/MapServer",
          layers: [19], // OBRM-021: Bush Fire Prone Areas 2024
          opacity: 0.7,
          f: "image", // render server-side as an image
          maxZoom: 22,
          updateWhenIdle: true, // Performance optimization
          reuseTiles: true, // Reuse tiles when possible
        });

        bfpa.on("error", (error: any) => {
          console.error("❌ Bush Fire layer error:", error);
          devLog.warn("Bushfire areas layer error:", error);
        });

        bfpa.on("load", () => {
          devLog.log("✅ Bush Fire layer loaded successfully");
        });

        bfpa.addTo(map);
        layersRef.current.bushfireAreas = bfpa;
        devLog.log("✅ Bush Fire layer added to map");
      } catch (error) {
        console.error("Failed to create bushfire areas layer:", error);
      }
    } else if (!layers.bushfireAreas && layersRef.current.bushfireAreas) {
      try {
        if (map.hasLayer(layersRef.current.bushfireAreas)) {
          map.removeLayer(layersRef.current.bushfireAreas);
        }
        delete layersRef.current.bushfireAreas;
      } catch (error) {
        devLog.warn("Error removing bushfireAreas layer:", error);
        delete layersRef.current.bushfireAreas;
      }
    }

    // Infrastructure & Utilities layers (all layers as requested)
    if (layers.infrastructure && !layersRef.current.infrastructure) {
      const infraLayers = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23,
        24, 25, 26, 27, 28, 29, 30, 31, 34, 35,
      ];
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities_WFS/MapServer",
          layers: infraLayers, // All infrastructure layers
          opacity: 0.8,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true, // Performance optimization
          reuseTiles: true, // Reuse tiles when possible
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Infrastructure/Watercorp layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Infrastructure/Watercorp layer loaded");
      });

      layersRef.current.infrastructure = layer;
      devLog.log("✅ Infrastructure/Watercorp layer added to map");
    } else if (!layers.infrastructure && layersRef.current.infrastructure) {
      try {
        if (map.hasLayer(layersRef.current.infrastructure)) {
          map.removeLayer(layersRef.current.infrastructure);
        }
        delete layersRef.current.infrastructure;
      } catch (error) {
        devLog.warn("Error removing infrastructure layer:", error);
        delete layersRef.current.infrastructure;
      }
    }

    // Flood Zone layer (Water)
    if (layers.water && !layersRef.current.water) {
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Water/MapServer",
          layers: [8], // Water layer 8
          opacity: 0.8,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true, // Performance optimization
          reuseTiles: true, // Reuse tiles when possible
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Flood Zone layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Flood Zone layer loaded");
      });

      layersRef.current.water = layer;
      devLog.log("✅ Flood Zone layer added to map");
    } else if (!layers.water && layersRef.current.water) {
      try {
        if (map.hasLayer(layersRef.current.water)) {
          map.removeLayer(layersRef.current.water);
        }
        delete layersRef.current.water;
      } catch (error) {
        devLog.warn("Error removing water layer:", error);
        delete layersRef.current.water;
      }
    }

    // Land Contours / Terrain layer
    if (layers.terrain && !layersRef.current.terrain) {
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Terrain/MapServer",
          layers: [0], // Terrain layer 0
          opacity: 0.7,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true,
          reuseTiles: true,
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Land Contours layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Land Contours layer loaded");
      });

      layersRef.current.terrain = layer;
      devLog.log("✅ Land Contours layer added to map");
    } else if (!layers.terrain && layersRef.current.terrain) {
      try {
        if (map.hasLayer(layersRef.current.terrain)) {
          map.removeLayer(layersRef.current.terrain);
        }
        delete layersRef.current.terrain;
      } catch (error) {
        devLog.warn("Error removing terrain layer:", error);
        delete layersRef.current.terrain;
      }
    }

    // Soil Type layer
    if (layers.soilType && !layersRef.current.soilType) {
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Soil_Landscape/MapServer",
          layers: [26], // Soil Type layer 26
          opacity: 0.7,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true,
          reuseTiles: true,
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Soil Type layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Soil Type layer loaded");
      });

      layersRef.current.soilType = layer;
      devLog.log("✅ Soil Type layer added to map");
    } else if (!layers.soilType && layersRef.current.soilType) {
      try {
        if (map.hasLayer(layersRef.current.soilType)) {
          map.removeLayer(layersRef.current.soilType);
        }
        delete layersRef.current.soilType;
      } catch (error) {
        devLog.warn("Error removing soil type layer:", error);
        delete layersRef.current.soilType;
      }
    }

    // Health Services layer
    if (layers.health && !layersRef.current.health) {
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Health/MapServer",
          layers: [1], // Health Services layer 1
          opacity: 0.7,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true,
          reuseTiles: true,
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Health Services layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Health Services layer loaded");
      });

      layersRef.current.health = layer;
      devLog.log("✅ Health Services layer added to map");
    } else if (!layers.health && layersRef.current.health) {
      try {
        if (map.hasLayer(layersRef.current.health)) {
          map.removeLayer(layersRef.current.health);
        }
        delete layersRef.current.health;
      } catch (error) {
        devLog.warn("Error removing health services layer:", error);
        delete layersRef.current.health;
      }
    }

    // Schools layer
    if (layers.schools && !layersRef.current.schools) {
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Education/MapServer",
          layers: [12], // Schools layer 12
          opacity: 0.7,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true,
          reuseTiles: true,
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Schools layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Schools layer loaded");
      });

      layersRef.current.schools = layer;
      devLog.log("✅ Schools layer added to map");
    } else if (!layers.schools && layersRef.current.schools) {
      try {
        if (map.hasLayer(layersRef.current.schools)) {
          map.removeLayer(layersRef.current.schools);
        }
        delete layersRef.current.schools;
      } catch (error) {
        devLog.warn("Error removing schools layer:", error);
        delete layersRef.current.schools;
      }
    }

    // Transport layer
    if (layers.transport && !layersRef.current.transport) {
      const layer = esri
        .dynamicMapLayer({
          url: "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Transport/MapServer",
          layers: [14, 15], // Transport layers 14 and 15
          opacity: 0.7,
          f: "image",
          maxZoom: 22,
          updateWhenIdle: true,
          reuseTiles: true,
        })
        .addTo(map);

      layer.on("error", (error: any) => {
        console.error("❌ Transport layer error:", error);
      });

      layer.on("load", () => {
        devLog.log("✅ Transport layer loaded");
      });

      layersRef.current.transport = layer;
      devLog.log("✅ Transport layer added to map");
    } else if (!layers.transport && layersRef.current.transport) {
      try {
        if (map.hasLayer(layersRef.current.transport)) {
          map.removeLayer(layersRef.current.transport);
        }
        delete layersRef.current.transport;
      } catch (error) {
        devLog.warn("Error removing transport layer:", error);
        delete layersRef.current.transport;
      }
    }
  }, [layers]);

  // Handle setback visualization
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    if (
      showSetbacks &&
      setbackData &&
      currentPropertyDataRef.current?.geometry
    ) {
      // Display setback visualization
      displaySetbackVisualization(
        currentPropertyDataRef.current.geometry,
        setbackData,
      );
    } else {
      // Clear setback visualization
      clearSetbackVisualization();
    }
  }, [showSetbacks, setbackData]);

  // Handle base layer changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    try {
      // Safely remove current base layer if it exists
      if (baseLayerRef.current && map.hasLayer(baseLayerRef.current)) {
        map.removeLayer(baseLayerRef.current);
      }

      // Add new base layer with error handling
      const layerConfig = getBaseLayerConfig(baseLayer);
      const newBaseLayer = L.tileLayer(layerConfig.url, {
        attribution: layerConfig.attribution,
        maxZoom: 22,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 4,
        crossOrigin: true,
      });

      // Add error handling for tile loading
      newBaseLayer.on("tileerror", (e) => {
        devLog.warn("Tile loading error:", e);
      });

      // Add the new layer and update reference
      newBaseLayer.addTo(map);
      baseLayerRef.current = newBaseLayer;
    } catch (error) {
      console.error("�� Error changing base layer:", error);
    }
  }, [baseLayer]);

  return (
    <div
      className={`relative w-full h-full ${
        subdivisionModeActive ? "cursor-crosshair" : ""
      }`}
    >
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{
          minHeight: "500px",
          height: "100%",
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* Subdivision Mode Overlay */}
      {subdivisionModeActive && (
        <div className="absolute top-2 left-2 bg-blue-600 text-white px-3 py-1 rounded-md text-sm font-medium shadow-lg z-[999]">
          🔧 Subdivision Mode Active
        </div>
      )}
    </div>
  );
}
