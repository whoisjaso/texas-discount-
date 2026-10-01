// Touch feedback for phone shots: a ring where the finger lands and a soft dot while it drags.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { ShotData } from "../lib/shot";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const TapRipple: React.FC<{
  data: ShotData;
  trimFrames?: number;
  /** display px per CSS px of the capture */
  k: number;
}> = ({ data, trimFrames = 0, k }) => {
  const frame = useCurrentFrame();
  const f = frame + trimFrames;
  const i = Math.max(0, Math.min(data.frames.length - 1, f));
  const cur = data.frames[i];
  const nodes: React.ReactNode[] = [];
  for (const e of data.events) {
    if (e.type !== "touch" && e.type !== "tap") continue;
    const d = f - e.frame;
    if (d < 0 || d > 16) continue;
    const p = clamp01(d / 16);
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
          background: theme.colors.touch,
          opacity: 0.85 * (1 - theme.ease.in(p)),
        }}
      />,
    );
  }
  // the finger itself, while it touches the glass (fades in and out over 3 frames)
  let touchOpacity = 0;
  for (let d = 0; d <= 3; d++) {
    const a = data.frames[Math.max(0, i - d)];
    const b = data.frames[Math.min(data.frames.length - 1, i + d)];
    if (a.down || b.down) touchOpacity = Math.max(touchOpacity, 1 - d / 4);
  }
  if (touchOpacity > 0) {
    const r = 19 * k;
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
          boxShadow: `0 0 0 ${1.5 * k}px ${theme.colors.touchRing}`,
          opacity: theme.ease.inOut(touchOpacity),
        }}
      />,
    );
  }
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{nodes}</AbsoluteFill>;
};
