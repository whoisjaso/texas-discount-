// Touch feedback for phone shots: a ring where the finger lands and a soft disc that rides with the content while
// the finger drags it (the capture moves the finger 1:1 with the scroll). The disc fades AND grows in / shrinks out.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { ShotData } from "../lib/shot";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const TapRipple: React.FC<{
  data: ShotData;
  trimFrames?: number;
  /** display px per CSS px of the capture */
  k: number;
}> = ({ data, trimFrames = 0, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame + trimFrames;
  const i = Math.max(0, Math.min(data.frames.length - 1, f));
  const cur = data.frames[i];
  const R = Math.max(1, toFrames(theme.touch.rippleSec, fps));
  const nodes: React.ReactNode[] = [];
  for (const e of data.events) {
    if (e.type !== "touch" && e.type !== "tap") continue;
    const d = f - e.frame;
    if (d < 0 || d > R) continue;
    const p = clamp01(d / R);
    const r = (12 + 30 * theme.ease.out(p)) * k;
    nodes.push(
      <div
        key={`r${e.frame}`}
        style={{
          position: "absolute",
          left: e.x * k - r,
          top: e.y * k - r,
          width: 2 * r,
          height: 2 * r,
          borderRadius: "50%",
          border: `${2 * k}px solid ${theme.colors.touchRing}`,
          boxShadow: `0 0 0 ${1 * k}px ${theme.colors.touchEdge}`,
          background: theme.colors.touch,
          opacity: 0.85 * (1 - theme.ease.in(p)),
        }}
      />,
    );
  }
  // the finger itself, while it touches the glass
  const F = Math.max(1, toFrames(theme.touch.fingerFadeSec, fps));
  let touch = 0;
  for (let d = 0; d <= F; d++) {
    const a = data.frames[Math.max(0, i - d)];
    const b = data.frames[Math.min(data.frames.length - 1, i + d)];
    if (a.down || b.down) touch = Math.max(touch, 1 - d / (F + 1));
  }
  if (touch > 0) {
    const t = theme.ease.inOut(touch);
    const r = 19 * k * (0.8 + 0.2 * t);
    nodes.push(
      <div
        key="finger"
        style={{
          position: "absolute",
          left: cur.x * k - r,
          top: cur.y * k - r,
          width: 2 * r,
          height: 2 * r,
          borderRadius: "50%",
          background: theme.colors.touch,
          boxShadow: `0 0 0 ${1.5 * k}px ${theme.colors.touchRing}, 0 0 0 ${2.5 * k}px ${theme.colors.touchEdge}, 0 ${2 * k}px ${6 * k}px ${theme.colors.touchEdge}`,
          opacity: t,
        }}
      />,
    );
  }
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{nodes}</AbsoluteFill>;
};
