// Top of the five-layer stack: grain (procedural, flickers per frame) then vignette.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")`;

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = theme.grain.opacity }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundImage: NOISE,
        backgroundSize: "240px",
        backgroundPosition: `${(frame * 37) % 240}px ${(frame * 61) % 240}px`,
        opacity,
        mixBlendMode: "overlay",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = theme.vignette.strength }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Luminance-only grade (layer 4 of 5): a soft top/bottom falloff that ties the window to the wallpaper. */
export const Grade: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `linear-gradient(180deg, rgba(0,0,0,${theme.grade.top}) 0%, transparent 26%, transparent 70%, rgba(0,0,0,${theme.grade.bottom}) 100%)`,
    }}
  />
);

/** Grade, grain + vignette, always the last children of a scene. */
export const Finish: React.FC = () => (
  <>
    <Grade />
    <Grain />
    <Vignette />
  </>
);
