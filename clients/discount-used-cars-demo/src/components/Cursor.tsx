// macOS arrow cursor drawn from the shot's cursor track: spring-smoothed position, click bounce
// (scale 0.82 and back over 350 ms) and a soft ring; fades out while the page scrolls by itself.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { ShotData, toContent, useTracks } from "../lib/shot";
import { cameraAt } from "./Camera";

type Tracks = NonNullable<ReturnType<typeof useTracks>>;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// The classic arrow, tip at (2, 1.5) in a 20 × 30 box.
const ARROW = "M2 1.5 L2 24.6 L7.5 19.4 L11.1 27.8 L14.7 26.2 L11.2 18.1 L18.6 18.1 Z";
const TIP = { x: 2 / 20, y: 1.5 / 30 };

export const CursorArrow: React.FC<{ height: number }> = ({ height }) => (
  <svg width={(height * 20) / 30} height={height} viewBox="0 0 20 30" style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 ${height * 0.05}px ${height * 0.08}px ${theme.colors.cursorShadow})` }}>
    <path d={ARROW} fill={theme.colors.cursorFill} stroke={theme.colors.cursorStroke} strokeWidth={1.7} strokeLinejoin="round" />
  </svg>
);

export const Cursor: React.FC<{
  data: ShotData;
  tracks: Tracks;
  trimFrames?: number;
  /** content box of the page, in frame px */
  box: { left: number; top: number; width: number; height: number };
}> = ({ data, tracks, trimFrames = 0, box }) => {
  const frame = useCurrentFrame();
  const { fps, width: frameW, height: frameH } = useVideoConfig();
  if (data.cursor.kind !== "pointer") return null;
  const R = theme.recordly;
  const f = frame + trimFrames;
  const cam = cameraAt(data, tracks, f, box.width, box.height);
  const i = cam.index;
  const [cx, cy] = toContent(tracks.cursor.pos[i], cam);
  const x = box.left + cx;
  const y = box.top + cy;
  const opacity = tracks.cursor.opacity[i];

  // click bounce + ring from the most recent click
  const clickFrames = (R.clickMs / 1000) * fps;
  const ringFrames = (R.ringMs / 1000) * fps;
  let bounce = 0;
  const rings: React.ReactNode[] = [];
  for (const e of data.events) {
    if (e.type !== "click") continue;
    const d = f - e.frame;
    if (d >= 0 && d < clickFrames) {
      const p = d / clickFrames;
      bounce = p < 0.3 ? theme.ease.out(p / 0.3) : 1 - theme.ease.inOut((p - 0.3) / 0.7);
    }
    if (d >= 0 && d < ringFrames) {
      const p = clamp01(d / ringFrames);
      const [ex, ey] = toContent([e.x, e.y], cam);
      const r = R.ringRadius[0] + (R.ringRadius[1] - R.ringRadius[0]) * theme.ease.out(p);
      rings.push(
        <div
          key={e.frame}
          style={{
            position: "absolute",
            left: box.left + ex - r,
            top: box.top + ey - r,
            width: 2 * r,
            height: 2 * r,
            borderRadius: "50%",
            border: `2.5px solid ${theme.colors.clickRing}`,
            opacity: 0.9 * (1 - theme.ease.in(p)),
            transform: `scale(${0.9 + 0.1 * theme.ease.out(p)})`,
          }}
        />,
      );
    }
  }
  const scale = (1 - (1 - R.clickScale) * bounce) * (1 + (cam.s - 1) * R.cursorZoomGrow);
  const h = R.cursorHeight;
  const w = (h * 20) / 30;
  // While zoomed, the cursor is clipped to the page; at rest it may sit outside the window (drifting in).
  const zoomed = clamp01((cam.s - 1) / 0.04);
  const pad = (1 - zoomed) * 4000;
  const clip = `inset(${box.top - pad}px ${frameW - box.left - box.width - pad}px ${frameH - box.top - box.height - pad}px ${box.left - pad}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", clipPath: zoomed > 0 ? clip : undefined }}>
      {rings}
      <div
        style={{
          position: "absolute",
          left: x - w * TIP.x,
          top: y - h * TIP.y,
          opacity,
          transformOrigin: `${TIP.x * 100}% ${TIP.y * 100}%`,
          transform: `scale(${scale})`,
        }}
      >
        <CursorArrow height={h} />
      </div>
    </AbsoluteFill>
  );
};
