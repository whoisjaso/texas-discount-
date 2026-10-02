// macOS pointer drawn from the shot's cursor track: the arrow, the pointing hand over links and buttons, the I-beam in
// text fields (the shape the capture recorded under the pointer), spring-smoothed position, click bounce (scale 0.82
// and back over 350 ms) and a soft ring with a faint dark edge (it reads on white pages and on black bands). It fades
// AND shrinks a little while the page scrolls by itself or while typing.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { ShotData, toContent, useTracks } from "../lib/shot";
import { cameraAt } from "./Camera";

type Tracks = NonNullable<ReturnType<typeof useTracks>>;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type Shape = { view: [number, number]; hot: [number, number]; draw: React.ReactNode };
// All three share one scale: theme.recordly.cursorHeight px per 30 units (the arrow's height).
const SHAPES: Record<"a" | "p" | "t", Shape> = {
  // the classic arrow, tip at (2, 1.5)
  a: {
    view: [20, 30],
    hot: [2, 1.5],
    draw: <path d="M2 1.5 L2 24.6 L7.5 19.4 L11.1 27.8 L14.7 26.2 L11.2 18.1 L18.6 18.1 Z" fill={theme.colors.cursorFill} stroke={theme.colors.cursorStroke} strokeWidth={1.7} strokeLinejoin="round" />,
  },
  // the pointing hand: index finger up, white with a black outline, hotspot at the fingertip
  p: {
    view: [24, 27],
    hot: [9.6, 1.2],
    draw: (
      <g fill={theme.colors.handFill} stroke={theme.colors.handStroke} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
        <path d="M7.9 2.9c0-1.1.8-1.9 1.8-1.9s1.8.8 1.8 1.9v8.4c.2-.9.9-1.5 1.8-1.5 1 0 1.7.7 1.7 1.7v.6c.2-.8.9-1.4 1.7-1.4 1 0 1.7.7 1.7 1.7v.9c.2-.7.8-1.2 1.6-1.2.9 0 1.6.7 1.6 1.7v5.6c0 4-2.7 7-6.6 7h-2.5c-2.3 0-3.8-.9-5.1-2.6l-3.8-5.2c-.7-.9-.5-2.1.3-2.7.8-.6 2-.5 2.7.3l1.4 1.7V2.9z" />
        <path d="M11.5 11.6v4.6M15 12.4v3.8M18.4 13.2v3.1" fill="none" />
      </g>
    ),
  },
  // the I-beam, black with a white outline, hotspot in the middle
  t: {
    view: [14, 24],
    hot: [7, 12],
    draw: (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {[theme.colors.cursorStroke, theme.colors.cursorFill].map((c, i) => (
          <path key={c} d="M3.6 2.2h1.9c.8 0 1.3.3 1.5.8.2-.5.7-.8 1.5-.8h1.9M7 3v18M3.6 21.8h1.9c.8 0 1.3-.3 1.5-.8.2.5.7.8 1.5.8h1.9" stroke={c} strokeWidth={i === 0 ? 3.4 : 1.4} />
        ))}
      </g>
    ),
  },
};

export const CursorGlyph: React.FC<{ kind?: "a" | "p" | "t"; unit: number }> = ({ kind = "a", unit }) => {
  const sh = SHAPES[kind];
  return (
    <svg width={sh.view[0] * unit} height={sh.view[1] * unit} viewBox={`0 0 ${sh.view[0]} ${sh.view[1]}`} style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 ${unit * 1.5}px ${unit * 2.4}px ${theme.colors.cursorShadow})` }}>
      {sh.draw}
    </svg>
  );
};

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
  const kind = tracks.cursor.kind[i];

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
            boxShadow: `0 0 0 1px ${theme.colors.clickRingEdge}, inset 0 0 0 1px ${theme.colors.clickRingEdge}`,
            opacity: 0.9 * (1 - theme.ease.in(p)),
            transform: `scale(${0.9 + 0.1 * theme.ease.out(p)})`,
          }}
        />,
      );
    }
  }
  const hide = R.cursorHideScale + (1 - R.cursorHideScale) * opacity; // fades are paired with a slight shrink
  const scale = (1 - (1 - R.clickScale) * bounce) * (1 + (cam.s - 1) * R.cursorZoomGrow) * hide;
  const sh = SHAPES[kind];
  const unit = R.cursorHeight / 30;
  // While zoomed, the cursor is clipped to the page; at rest it may sit outside the window (drifting in).
  const zoomed = clamp01((cam.s - 1) / 0.04);
  const pad = (1 - zoomed) * 4000;
  const clip = `inset(${box.top - pad}px ${frameW - box.left - box.width - pad}px ${frameH - box.top - box.height - pad}px ${box.left - pad}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", clipPath: zoomed > 0 ? clip : undefined }}>
      {rings}
      {opacity > 0.001 && (
        <div
          style={{
            position: "absolute",
            left: x - sh.hot[0] * unit,
            top: y - sh.hot[1] * unit,
            opacity,
            transformOrigin: `${sh.hot[0] * unit}px ${sh.hot[1] * unit}px`,
            transform: `scale(${scale})`,
          }}
        >
          <CursorGlyph kind={kind} unit={unit} />
        </div>
      )}
    </AbsoluteFill>
  );
};
