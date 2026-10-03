// The finish layers. A screen recording is never graded: grade, vignette, dither and the heavier grain sit on the
// BACKDROP (above the wallpaper, under the window and the phone), and only a whisper of grain goes over the UI, where
// overlay blending leaves pure white and pure black untouched.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { shade, theme } from "../theme";

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")`;
// Grey, fine, static: dithers the wallpaper's dark gradient by about ±1.5 levels so the encoder does not band it.
const DITHER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='d'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23d)'/%3E%3C/svg%3E")`;

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

export const Dither: React.FC<{ opacity?: number }> = ({ opacity = theme.dither.opacity }) => (
  <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: DITHER, backgroundSize: "160px", opacity }} />
);

export const Vignette: React.FC<{ strength?: number; start?: number }> = ({ strength = theme.vignette.strength, start = theme.vignette.start }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse at center, transparent ${Math.round(start * 100)}%, ${shade(strength)} 100%)`,
    }}
  />
);

/** Luminance-only grade: a soft top/bottom falloff. */
export const Grade: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `linear-gradient(180deg, ${shade(theme.grade.top)} 0%, transparent 26%, transparent 70%, ${shade(theme.grade.bottom)} 100%)`,
    }}
  />
);

/** Grade, vignette, dither and grain for the backdrop: put it right above the wallpaper, under every window. */
export const BackdropFinish: React.FC = () => (
  <>
    <Dither />
    <Grade />
    <Grain />
    <Vignette />
  </>
);

/** The only finish drawn over the UI: faint grain (overlay leaves pure white and black as they are). */
export const Finish: React.FC = () => <Grain opacity={theme.grain.overUi} />;

/** A black layer over everything, eased in as `progress` goes 0 → 1 (the film's final fade). */
export const FadeOut: React.FC<{ progress: number }> = ({ progress }) => (
  <AbsoluteFill style={{ pointerEvents: "none", background: theme.colors.black, opacity: theme.ease.in(Math.max(0, Math.min(1, progress))) }} />
);
