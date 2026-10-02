// Dark brand wallpaper: neutral charcoal gradient mesh with a slow drift. `Backdrop` adds the backdrop finish
// (dither, grade, grain, vignette) so that everything drawn after it (the window, the phone) stays ungraded.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { BackdropFinish } from "./Overlays";

const Blob: React.FC<{ size: number; x: number; y: number; color: string; blur: number; opacity?: number }> = ({ size, x, y, color, blur, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      width: size,
      height: size,
      left: x - size / 2,
      top: y - size / 2,
      borderRadius: "50%",
      filter: `blur(${blur}px)`,
      opacity,
      background: `radial-gradient(circle, ${color} 0%, transparent 66%)`,
    }}
  />
);

/** `glow` (0–1) adds one faint brand-colour bloom; leave it at 0 when the frame already has a red element. */
export const Wallpaper: React.FC<{ glow?: number }> = ({ glow = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const d1 = Math.sin(t / 1.9) * 70;
  const d2 = Math.cos(t / 2.4) * 60;
  const d3 = Math.sin(t / 3.1 + 1.3) * 50;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${theme.colors.bgAlt} 0%, ${theme.colors.bg} 55%, ${theme.colors.bg} 100%)`, overflow: "hidden" }}>
      <Blob size={1500} x={width * 0.18 + d1} y={height * 0.05 + d2 * 0.5} color={theme.colors.meshC} blur={60} opacity={0.85} />
      <Blob size={1300} x={width * 0.92 - d2} y={height * 0.95 + d3} color={theme.colors.meshA} blur={70} opacity={0.9} />
      <Blob size={900} x={width * 0.62 + d3} y={height * 0.3 - d1 * 0.4} color={theme.colors.meshB} blur={80} />
      {glow > 0 && <Blob size={1100} x={width * 0.5 + d2 * 0.6} y={height * 0.62 + d1 * 0.3} color={theme.colors.primary} blur={120} opacity={0.22 * glow} />}
      {/* a soft diagonal sheen, like light across a desk */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent 30%, ${theme.colors.sheen} 48%, transparent 62%)`,
          transform: `translateX(${Math.sin(t / 4) * 80}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Wallpaper + backdrop finish: the bottom two layers of every scene. */
export const Backdrop: React.FC<{ glow?: number }> = ({ glow }) => (
  <AbsoluteFill>
    <Wallpaper glow={glow} />
    <BackdropFinish />
  </AbsoluteFill>
);
