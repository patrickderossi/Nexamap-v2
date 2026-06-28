import React, { useCallback, useState } from "react";
import {
  Layers, Map, Globe, ChevronDown, ChevronRight,
  Grid3x3, Flame, Droplets, Mountain, Building2,
} from "lucide-react";
import { PropertyControls, PropertyControlsState } from "./PropertyControls";
import { FeedbackModal } from "./FeedbackModal";
import { devLog } from "@/lib/logger";
import { C, FONT, MONO, monoLabel, toggleTrack, toggleKnob, dot } from "@/lib/nexa-ui";

export type BaseLayerType = "positron" | "osm" | "satellite";

export interface BaseLayerConfig {
  id: BaseLayerType;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  icon: React.ReactNode;
}

export interface LayerState {
  // ── Main layers ──────────────────────────────────────
  placesAddresses: boolean;
  propertyPlanning: boolean;
  bushfireAreas: boolean;
  infrastructure: boolean;
  water: boolean;
  terrain: boolean;
  soilType: boolean;
  // ── Additional — community ───────────────────────────
  health: boolean;
  schools: boolean;
  transport: boolean;
  // ── Additional — planning overlays ───────────────────
  mrsZone: boolean;
  lpsZones: boolean;
  lpsOverlays: boolean;
  // ── Additional — constraints ─────────────────────────
  heritageState: boolean;
  heritageLocal: boolean;
  aboriginalHeritage: boolean;
  contamination: boolean;
  envSensitive: boolean;
  airportNoise: boolean;
  roadRailNoise: boolean;
  bushForever: boolean;
  acidSulfateSoil: boolean;
  drinkingWater: boolean;
}

interface FloatingLayerControlsProps {
  layers: LayerState;
  onLayersChange: (layers: LayerState) => void;
  propertyControls?: PropertyControlsState;
  onPropertyControlsChange?: (controls: PropertyControlsState) => void;
  hasSelectedProperty?: boolean;
  baseLayer?: BaseLayerType;
  onBaseLayerChange?: (layer: BaseLayerType) => void;
}

// Shared toggle row — icon chip + name on the left, switch on the right
function LayerRow({
  label,
  checked,
  onToggle,
  icon,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 6px",
        borderRadius: 9,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            flexShrink: 0,
            background: checked ? C.blueBg : "rgba(20,28,24,.05)",
            color: checked ? C.blue : "#8a918a",
            transition: "all .15s",
          }}
        >
          {icon || <Layers className="w-[15px] h-[15px]" />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.body }}>{label}</span>
      </div>
      <div style={toggleTrack(checked)}>
        <div style={toggleKnob(checked)} />
      </div>
    </div>
  );
}

function FloatingLayerControlsComponent({
  layers,
  onLayersChange,
  propertyControls,
  onPropertyControlsChange,
  hasSelectedProperty = false,
  baseLayer = "osm",
  onBaseLayerChange,
}: FloatingLayerControlsProps) {
  const [showAdditional, setShowAdditional] = useState(false);

  const baseLayerConfigs: BaseLayerConfig[] = [
    {
      id: "positron",
      name: "Light",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: "© OpenStreetMap contributors © CARTO",
      maxZoom: 20,
      icon: <Map className="w-4 h-4" />,
    },
    {
      id: "osm",
      name: "Street",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
      icon: <Map className="w-4 h-4" />,
    },
    {
      id: "satellite",
      name: "Satellite",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "© Esri, Maxar, Earthstar Geographics",
      maxZoom: 18,
      icon: <Globe className="w-4 h-4" />,
    },
  ];

  const toggle = useCallback(
    (key: keyof LayerState) => {
      devLog.log(`🎛️ Toggling ${key}: ${layers[key]} → ${!layers[key]}`);
      onLayersChange({ ...layers, [key]: !layers[key] });
    },
    [layers, onLayersChange],
  );

  const handleBaseLayerChange = useCallback(
    (id: BaseLayerType) => onBaseLayerChange?.(id),
    [onBaseLayerChange],
  );

  // Count active additional layers for the collapsed badge
  const additionalKeys: (keyof LayerState)[] = [
    "health", "schools", "transport",
    "mrsZone", "lpsZones", "lpsOverlays",
    "heritageState", "heritageLocal", "aboriginalHeritage",
    "contamination", "envSensitive", "airportNoise",
    "roadRailNoise", "bushForever", "acidSulfateSoil", "drinkingWater",
  ];
  const activeAdditional = additionalKeys.filter((k) => layers[k]).length;
  const mainKeys: (keyof LayerState)[] = [
    "placesAddresses", "propertyPlanning", "bushfireAreas",
    "infrastructure", "water", "terrain", "soilType",
  ];
  const activeCount = mainKeys.filter((k) => layers[k]).length + activeAdditional;
  const chip = (i: React.ReactNode) => i;

  return (
    <div style={{ fontFamily: FONT, color: C.ink }}>
      <div style={{ overflow: "hidden" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "15px 16px 13px",
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers className="w-[17px] h-[17px]" style={{ color: C.muted }} />
            <span style={{ fontWeight: 700, fontSize: "14.5px" }}>Map Layers</span>
          </div>
          {activeCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: 10,
                color: C.greenText,
              }}
            >
              <span style={dot(C.green)} />
              {activeCount} ON
            </span>
          )}
        </div>

        <div style={{ padding: "14px 14px 6px" }}>
          {/* Base Map */}
          <div style={{ ...monoLabel(C.faint), marginBottom: 8 }}>BASE MAP</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 4,
              padding: 3,
              background: "rgba(20,28,24,.05)",
              borderRadius: 11,
            }}
          >
            {baseLayerConfigs.map((config) => {
              const active = baseLayer === config.id;
              return (
                <div
                  key={config.id}
                  onClick={() => handleBaseLayerChange(config.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    height: 30,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    background: active ? "#fff" : "transparent",
                    color: active ? C.ink : C.label,
                    boxShadow: active ? "0 1px 2px rgba(16,24,20,.12)" : "none",
                  }}
                >
                  {config.name}
                </div>
              );
            })}
          </div>

          {/* MAIN LAYERS */}
          <div style={{ ...monoLabel(C.faint), margin: "16px 0 4px" }}>MAIN LAYERS</div>
          <LayerRow label="Cadastre (Block Lines)"   icon={chip(<Grid3x3 className="w-[15px] h-[15px]" />)}    checked={layers.placesAddresses}  onToggle={() => toggle("placesAddresses")} />
          <LayerRow label="R-Code Zoning"             icon={chip(<Building2 className="w-[15px] h-[15px]" />)}  checked={layers.propertyPlanning} onToggle={() => toggle("propertyPlanning")} />
          <LayerRow label="Bush Fire Areas"           icon={chip(<Flame className="w-[15px] h-[15px]" />)}     checked={layers.bushfireAreas}    onToggle={() => toggle("bushfireAreas")} />
          <LayerRow label="Watercorp"                 icon={chip(<Droplets className="w-[15px] h-[15px]" />)}   checked={layers.infrastructure}   onToggle={() => toggle("infrastructure")} />
          <LayerRow label="Flood Zone"                icon={chip(<Droplets className="w-[15px] h-[15px]" />)}   checked={layers.water}            onToggle={() => toggle("water")} />
          <LayerRow label="Land Contours"             icon={chip(<Mountain className="w-[15px] h-[15px]" />)}   checked={layers.terrain}          onToggle={() => toggle("terrain")} />
          <LayerRow label="Soil Type"                 icon={chip(<Mountain className="w-[15px] h-[15px]" />)}   checked={layers.soilType}         onToggle={() => toggle("soilType")} />
        </div>

        {/* ── ADDITIONAL LAYERS ───────────────────────────── */}
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.line}`, marginTop: 4 }}>
          {/* Collapse header */}
          <button
            onClick={() => setShowAdditional((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 2px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", color: C.fainter, transform: showAdditional ? "rotate(0)" : "rotate(-90deg)", transition: "transform .2s" }}>
                <ChevronDown className="w-4 h-4" />
              </span>
              <span style={monoLabel(C.muted)}>ADDITIONAL LAYERS</span>
            </div>
            {activeAdditional > 0 && (
              <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 10, color: C.greenText }}>
                {activeAdditional} ON
              </span>
            )}
          </button>

          {showAdditional && (
            <div>
              {/* Planning overlays */}
              <div>
                <div style={{ ...monoLabel(C.faint), fontSize: "9.5px", margin: "6px 0 4px" }}>PLANNING OVERLAYS</div>
                <div>
                  <LayerRow label="MRS Zone"       checked={layers.mrsZone}     onToggle={() => toggle("mrsZone")} />
                  <LayerRow label="LPS Zones"      checked={layers.lpsZones}    onToggle={() => toggle("lpsZones")} />
                  <LayerRow label="LPS Overlays"   checked={layers.lpsOverlays} onToggle={() => toggle("lpsOverlays")} />
                </div>
              </div>

              {/* Constraints */}
              <div style={{ paddingTop: 4 }}>
                <div style={{ ...monoLabel(C.faint), fontSize: "9.5px", margin: "6px 0 4px" }}>CONSTRAINTS</div>
                <div>
                  <LayerRow label="Heritage — State Register" checked={layers.heritageState}     onToggle={() => toggle("heritageState")} />
                  <LayerRow label="Heritage — Local Survey"   checked={layers.heritageLocal}     onToggle={() => toggle("heritageLocal")} />
                  <LayerRow label="Aboriginal Heritage"       checked={layers.aboriginalHeritage} onToggle={() => toggle("aboriginalHeritage")} />
                  <LayerRow label="Contaminated Sites"        checked={layers.contamination}     onToggle={() => toggle("contamination")} />
                  <LayerRow label="Environmentally Sensitive" checked={layers.envSensitive}      onToggle={() => toggle("envSensitive")} />
                  <LayerRow label="Airport Noise Buffers"     checked={layers.airportNoise}      onToggle={() => toggle("airportNoise")} />
                  <LayerRow label="Road / Rail Noise"         checked={layers.roadRailNoise}     onToggle={() => toggle("roadRailNoise")} />
                  <LayerRow label="Bush Forever"              checked={layers.bushForever}       onToggle={() => toggle("bushForever")} />
                  <LayerRow label="Acid Sulfate Soil"         checked={layers.acidSulfateSoil}   onToggle={() => toggle("acidSulfateSoil")} />
                  <LayerRow label="Drinking Water Areas"      checked={layers.drinkingWater}     onToggle={() => toggle("drinkingWater")} />
                </div>
              </div>

              {/* Community */}
              <div style={{ paddingTop: 4 }}>
                <div style={{ ...monoLabel(C.faint), fontSize: "9.5px", margin: "6px 0 4px" }}>COMMUNITY</div>
                <div>
                  <LayerRow label="Health Services" checked={layers.health}     onToggle={() => toggle("health")} />
                  <LayerRow label="Schools"          checked={layers.schools}    onToggle={() => toggle("schools")} />
                  <LayerRow label="Transport"        checked={layers.transport}  onToggle={() => toggle("transport")} />
                </div>
              </div>

              <div style={{ paddingTop: 8 }}>
                <FeedbackModal
                  trigger={
                    <button
                      style={{
                        width: "100%",
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 10,
                        padding: "8px 10px",
                        border: `1px solid ${C.lineStrong}`,
                        background: "transparent",
                        color: C.muted,
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Suggest more layers
                    </button>
                  }
                  title="Suggest More Map Layers"
                  description="Help us add layers that matter to your work."
                  placeholder="What additional map layers would be useful?"
                  feedbackType="map-layers"
                  context="Additional layers panel"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Property Controls — only when a property is selected */}
      {hasSelectedProperty && propertyControls && onPropertyControlsChange && (
        <PropertyControls
          controls={propertyControls}
          onControlsChange={onPropertyControlsChange}
          visible={hasSelectedProperty}
        />
      )}
    </div>
  );
}

// Memoize FloatingLayerControls to prevent unnecessary re-renders
export const FloatingLayerControls = React.memo(FloatingLayerControlsComponent);
