import React, { useCallback } from "react";
import { Ruler, Triangle } from "lucide-react";
import { C, FONT, monoLabel, toggleTrack, toggleKnob } from "@/lib/nexa-ui";

interface PropertyControlsState {
  boundaryDimensions: boolean;
  propertyAngles: boolean;
}

interface PropertyControlsProps {
  controls: PropertyControlsState;
  onControlsChange: (controls: PropertyControlsState) => void;
  visible: boolean;
}

function PropertyControlsComponent({ controls, onControlsChange, visible }: PropertyControlsProps) {
  const handleControlToggle = useCallback((controlKey: keyof PropertyControlsState) => {
    onControlsChange({
      ...controls,
      [controlKey]: !controls[controlKey]
    });
  }, [controls, onControlsChange]);

  if (!visible) return null;

  const Toggle = ({
    on,
    onClick,
    icon,
    label,
  }: {
    on: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
  }) => (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 6px",
        borderRadius: 9,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            background: on ? C.blueBg : "rgba(20,28,24,.05)",
            color: on ? C.blue : "#8a918a",
            transition: "all .15s",
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.body }}>{label}</span>
      </div>
      <div style={toggleTrack(on)}>
        <div style={toggleKnob(on)} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "12px 14px 14px", borderTop: `1px solid ${C.line}`, fontFamily: FONT }}>
      <div style={{ ...monoLabel(C.faint), marginBottom: 6 }}>PROPERTY DETAILS</div>
      <Toggle
        on={controls.boundaryDimensions}
        onClick={() => handleControlToggle("boundaryDimensions")}
        icon={<Ruler className="w-[15px] h-[15px]" />}
        label="Boundary Dimensions"
      />
      <Toggle
        on={controls.propertyAngles}
        onClick={() => handleControlToggle("propertyAngles")}
        icon={<Triangle className="w-[15px] h-[15px]" />}
        label="Property Line Angles"
      />
    </div>
  );
}

// Memoize PropertyControls to prevent unnecessary re-renders
export const PropertyControls = React.memo(PropertyControlsComponent);

export type { PropertyControlsState };
