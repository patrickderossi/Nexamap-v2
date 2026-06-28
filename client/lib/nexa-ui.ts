// ---------------------------------------------------------------------------
// NexaMap "Professional Redesign" design system.
//
// Central tokens + reusable inline-style objects mirroring the Claude Design
// canvas redesign. Components import from here so the look stays consistent and
// a single edit re-themes the whole app. Purely presentational — no logic.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";

export const FONT = "'Hanken Grotesk', system-ui, -apple-system, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// Palette ───────────────────────────────────────────────────────────────────
export const C = {
  bg: "#E4E7E5", // sage page background
  ink: "#1B221E", // primary text
  body: "#2b322b",
  muted: "#5a6158",
  label: "#7a817a",
  faint: "#9aa19a",
  fainter: "#b4bab2",
  line: "rgba(20,28,24,.07)",
  lineStrong: "rgba(20,28,24,.12)",
  hover: "rgba(20,28,24,.05)",
  cardBorder: "rgba(20,28,24,.08)",

  blue: "#2F6FB2",
  blueDark: "#27567f",
  blueBg: "#EAF2F9",
  green: "#2E9E6E",
  greenText: "#1F7A52",
  greenBg: "#EAF6EF",
  purple: "#7C5CCB",
  purpleDark: "#5E3DB5",
  purpleBg: "#F5F1FF",
  amber: "#E0A33A",
  amberText: "#9A6A1C",
  amberBg: "#FBF1E1",
  red: "#D45B57",
  redText: "#C0433F",
  redBg: "#FDE8E8",
  white: "#fff",
} as const;

// Frosted-glass floating panel chrome (left/right panels, search) ─────────────
export const panel: CSSProperties = {
  background: "rgba(255,255,255,.92)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 18,
  boxShadow:
    "0 1px 2px rgba(16,24,20,.04), 0 18px 40px -12px rgba(16,24,20,.18)",
  overflow: "hidden",
  fontFamily: FONT,
  color: C.ink,
};

export const floatChrome: CSSProperties = {
  background: "rgba(255,255,255,.92)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: `1px solid ${C.cardBorder}`,
  boxShadow: "0 6px 18px -6px rgba(16,24,20,.22)",
};

// Mono section eyebrow label (e.g. "PLANNING") ───────────────────────────────
export const monoLabel = (color: string = C.label): CSSProperties => ({
  fontFamily: MONO,
  fontWeight: 600,
  fontSize: "10.5px",
  letterSpacing: ".13em",
  color,
});

// Tiny mono "source" tag on the right of a section header ─────────────────────
export const sourceTag: CSSProperties = {
  fontFamily: MONO,
  fontWeight: 500,
  fontSize: "9.5px",
  color: C.fainter,
};

// Hairline divider between sections
export const divider: CSSProperties = {
  height: 1,
  background: C.line,
};

// Pill badge (status / zone). Pass tone for color variants.
export type Tone = "blue" | "green" | "amber" | "red" | "neutral" | "purple";
export function badge(tone: Tone = "neutral"): CSSProperties {
  const map: Record<Tone, { bg: string; color: string }> = {
    blue: { bg: C.blueBg, color: C.blue },
    green: { bg: C.greenBg, color: C.greenText },
    amber: { bg: C.amberBg, color: C.amberText },
    red: { bg: C.redBg, color: C.redText },
    purple: { bg: C.purpleBg, color: C.purpleDark },
    neutral: { bg: "rgba(20,28,24,.05)", color: C.muted },
  };
  const { bg, color } = map[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 23,
    padding: "0 9px",
    borderRadius: 7,
    background: bg,
    color,
    fontSize: "11.5px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

export const dot = (color: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: color,
  flexShrink: 0,
});

// Key→value row inside a section
export const kvRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "5px 0",
};
export const kvKey: CSSProperties = { fontSize: "12.5px", color: C.muted };
export const kvVal: CSSProperties = { fontSize: "13px", fontWeight: 600 };

// Bordered stat card (AREA / FRONTAGE etc.)
export const statCard: CSSProperties = {
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 11,
  padding: "10px 11px",
};
export const statCardLabel: CSSProperties = {
  fontFamily: MONO,
  fontWeight: 500,
  fontSize: "10px",
  letterSpacing: ".06em",
  color: C.faint,
};

// Toggle switch (track + knob) ───────────────────────────────────────────────
export function toggleTrack(on: boolean): CSSProperties {
  return {
    position: "relative",
    width: 34,
    height: 20,
    borderRadius: 20,
    flexShrink: 0,
    transition: "background .18s",
    background: on ? C.blue : "#D2D7D1",
  };
}
export function toggleKnob(on: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 2px rgba(16,24,20,.3)",
    transition: "transform .18s",
    transform: on ? "translateX(14px)" : "translateX(0)",
  };
}
