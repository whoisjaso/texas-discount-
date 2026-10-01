// Several desktop captures played back to back in ONE macOS window: the window springs in once and stays;
// at each cut the content crossfades under a short spring-driven blur (theme.transition) while the cursor stays
// sharp. Each capture keeps its own zoom camera and cursor track. Captures are mapped frame by frame with
// <Freeze> (the outgoing capture holds its last frame, the incoming its first, for the few frames they overlap).
import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { computeTracks, ShotData, shotFile, useShotsData, Vec } from "../lib/shot";
import { Wallpaper } from "../components/Wallpaper";
import { MacWindow, windowLayout } from "../components/MacWindow";
import { CameraView, cameraAt } from "../components/Camera";
import { Cursor } from "../components/Cursor";
import { Cue, Sfx, shotCues } from "../components/Sfx";
import { Finish } from "../components/Overlays";

/** A sound tied to a capture event (e.g. the drawer's open_ui on the first click of the menu shot). */
export type EventCue = { type: "click" | "type" | "scroll" | "touch" | "tap"; index: number; file: string; db: number; offsetFrames?: number };

export type DesktopSegment = {
  shot: string;
  /** seconds of the capture skipped at the start */
  trimSec?: number;
  durationInFrames: number;
  /** extra cues, frames relative to the segment start */
  cues?: Cue[];
  eventCues?: EventCue[];
  /**
   * Re-aim a capture's zoom (by index) at a fixed point in viewport CSS px. Composition data only (the capture's
   * pixels do not depend on it), used when the captured focus puts a frame edge through a line of text.
   */
  zoomFocus?: Record<number, { point: Vec; follow?: boolean; depth?: number }>;
};

/** A copy of the shot data with the segment's zoom-focus overrides applied. */
const withZoomFocus = (d: ShotData, over?: DesktopSegment["zoomFocus"]): ShotData =>
  over
    ? {
        ...d,
        zooms: d.zooms.map((z, i) => (over[i] ? { ...z, follow: over[i].follow ?? false, depth: over[i].depth ?? z.depth, focus: { point: over[i].point } } : z)),
      }
    : d;

export type DesktopSceneProps = {
  segments: DesktopSegment[];
  url: string;
  /** the window springs in at frame 0 */
  enter?: boolean;
  /** no wallpaper / grain (the film draws them once, globally) */
  bare?: boolean;
  autoSfx?: boolean;
  lights?: "mono" | "color";
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const desktopLength = (segments: DesktopSegment[]) => segments.reduce((a, s) => a + s.durationInFrames, 0);

export const DesktopScene: React.FC<DesktopSceneProps> = ({ segments, url, enter = false, bare = false, autoSfx = true, lights }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const raw = useShotsData(segments.map((s) => s.shot));
  const data = useMemo(() => (raw ? raw.map((d, i) => withZoomFocus(d, segments[i].zoomFocus)) : null), [raw, segments]);
  const tracks = useMemo(() => (data ? data.map(computeTracks) : null), [data]);

  const plan = useMemo(() => {
    let at = 0;
    return segments.map((s) => {
      const start = at;
      at += s.durationInFrames;
      return { ...s, start, end: at, trim: Math.round((s.trimSec ?? 0) * fps) };
    });
  }, [segments, fps]);

  const cues = useMemo(() => {
    if (!data) return [];
    const out: Cue[] = [];
    plan.forEach((p, i) => {
      const d: ShotData = data[i];
      if (autoSfx) out.push(...shotCues(d, { trimFrames: p.trim, durationInFrames: p.durationInFrames }).map((c) => ({ ...c, frame: c.frame + p.start })));
      for (const c of p.cues ?? []) out.push({ ...c, frame: c.frame + p.start });
      for (const ec of p.eventCues ?? []) {
        const ev = d.events.filter((e) => e.type === ec.type)[ec.index];
        if (!ev) continue;
        out.push({ frame: ev.frame - p.trim + p.start + (ec.offsetFrames ?? 0), file: ec.file, db: ec.db });
      }
    });
    return out.sort((a, b) => a.frame - b.frame);
  }, [data, plan, autoSfx]);

  if (!data || !tracks) return bare ? null : <AbsoluteFill style={{ background: theme.colors.bg }} />;

  const vp = data[0].viewport;
  const L = windowLayout(vp.width, vp.height, width, height);
  const box = { left: L.contentLeft, top: L.contentTop, width: L.contentW, height: L.contentH };

  // which capture is live, and the capture frame any segment shows at this scene frame (clamped = held)
  let active = 0;
  plan.forEach((p, i) => {
    if (frame >= p.start) active = i;
  });
  const shotFrameOf = (i: number) => {
    const p = plan[i];
    return Math.max(0, Math.min(p.durationInFrames - 1, frame - p.start)) + p.trim;
  };

  // crossfade windows around each internal cut
  const X = Math.max(2, Math.round(theme.transition.xfadeSec * fps));
  const half = X / 2;
  const layers = plan
    .map((p, i) => {
      const from = i === 0 ? p.start : p.start - half;
      const to = i === plan.length - 1 ? p.end : p.end + half;
      if (frame < from || frame >= to) return null;
      // incoming opacity: a spring stretched over the crossfade (0 → 1)
      const inP = i === 0 ? 1 : spring({ frame: frame - (p.start - half), fps, config: theme.spring.smooth, durationInFrames: X });
      // blur bell around the nearest cut this layer takes part in
      const cuts = [i > 0 ? p.start : null, i < plan.length - 1 ? p.end : null].filter((c): c is number => c !== null);
      let blur = 0;
      for (const c of cuts) {
        const u = clamp01((frame - (c - half) + 0.5) / X);
        blur = Math.max(blur, theme.transition.blurPx * Math.sin(Math.PI * theme.ease.soft(u)));
      }
      return { i, opacity: inP, blur };
    })
    .filter((l): l is { i: number; opacity: number; blur: number } => l !== null);

  // window: spring entrance, depth push while zoomed, idle breathing
  const e = enter ? spring({ frame, fps, config: theme.spring.window }) : 1;
  const camA = cameraAt(data[active], tracks[active], shotFrameOf(active), L.contentW, L.contentH);
  const push = 1 + Math.min(1, (camA.s - 1) / (theme.recordly.defaultDepth - 1)) * theme.window.pushScale;
  const B = theme.window.breathe;
  const phase = (2 * Math.PI * frame) / (B.periodSec * fps);
  const floatY = Math.sin(phase) * B.px;
  const breathe = 1 + Math.sin(phase * 0.77 + 1.1) * B.scale;
  const scale = interpolate(e, [0, 1], [0.94, 1]) * push * breathe;

  return (
    <AbsoluteFill>
      {!bare && <Wallpaper />}
      <AbsoluteFill
        style={{
          opacity: Math.min(1, e * 1.2),
          transformOrigin: `${L.left + L.contentW / 2}px ${L.top + (L.contentH + L.T) / 2}px`,
          transform: `translateY(${interpolate(e, [0, 1], [30, 0]) + floatY}px) scale(${scale})`,
        }}
      >
        <MacWindow width={L.contentW} height={L.contentH} url={url} lights={lights} style={{ left: L.left, top: L.top }}>
          {layers.map((l) => (
            <div
              key={plan[l.i].shot}
              style={{ position: "absolute", inset: 0, opacity: l.opacity, filter: l.blur > 0.05 ? `blur(${l.blur.toFixed(2)}px)` : undefined }}
            >
              <Freeze frame={shotFrameOf(l.i)}>
                <CameraView data={data[l.i]} tracks={tracks[l.i]} src={shotFile(plan[l.i].shot)} trimFrames={0} width={L.contentW} height={L.contentH} />
              </Freeze>
            </div>
          ))}
        </MacWindow>
        <Freeze frame={shotFrameOf(active)}>
          <Cursor data={data[active]} tracks={tracks[active]} trimFrames={0} box={box} />
        </Freeze>
      </AbsoluteFill>
      <Sfx cues={cues} />
      {!bare && <Finish />}
    </AbsoluteFill>
  );
};
