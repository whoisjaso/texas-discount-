// Several desktop captures played back to back in ONE macOS window: the window springs in once and stays. At each
// cut the next capture takes over: a HARD cut by default (the captures are staged pixel-matched: same scroll, same
// cursor, same hover), or a spring crossfade under a short blur when theme.transition.xfadeSec > 0 (for captures
// that do not match). Each capture keeps its own zoom camera and cursor track. Captures are mapped frame by frame
// with <Freeze> (during a crossfade the outgoing capture holds its last frame, the incoming its first).
import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { computeTracks, ShotData, shotFile, toContent, useShotsData, Vec } from "../lib/shot";
import { Backdrop } from "../components/Wallpaper";
import { MacWindow, windowLayout } from "../components/MacWindow";
import { CameraView, cameraAt } from "../components/Camera";
import { Cursor } from "../components/Cursor";
import { Cue, Sfx, shotCues } from "../components/Sfx";
import { Finish } from "../components/Overlays";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * A sound tied to a capture event (e.g. the drawer's open_ui on the first click of the menu shot). `at: "end"` places it
 * on the event's endFrame (a hold's release, a pen's last stroke) or, for a zoom, where the zoom lands (start + in).
 */
export type EventCue = {
  type: "click" | "type" | "scroll" | "touch" | "tap" | "hold" | "draw" | "zoom";
  index: number;
  file: string;
  db: number;
  offsetSec?: number;
  at?: "start" | "end";
};

/** The capture frame an EventCue refers to (null when the shot has no such event). */
export const eventCueFrame = (d: ShotData, ec: EventCue): number | null => {
  if (ec.type === "zoom") {
    const z = d.zooms[ec.index];
    return z ? (ec.at === "end" ? z.startFrame + z.inFrames : z.startFrame) : null;
  }
  const ev = d.events.filter((e) => e.type === ec.type)[ec.index];
  if (!ev) return null;
  return ec.at === "end" && "endFrame" in ev ? ev.endFrame : ev.frame;
};

export type DesktopSegment = {
  shot: string;
  /** seconds of the capture skipped at the start */
  trimSec?: number;
  durationInFrames: number;
  /** the URL pill while this segment plays (default: the scene's url) */
  url?: string;
  /** extra cues, frames relative to the segment start */
  cues?: Cue[];
  eventCues?: EventCue[];
  /**
   * Re-aim a capture's zoom (by index) at a fixed point in viewport CSS px. Composition data only (the capture's
   * pixels do not depend on it), used when the captured focus puts a frame edge through a line of text.
   */
  zoomFocus?: Record<number, { point: Vec; follow?: boolean; depth?: number }>;
  /**
   * Move a capture's zoom (by index) later or earlier, in capture seconds: `startSec` shifts where it starts, `outSec`
   * where it starts to leave. Composition data only, like zoomFocus: used when a segment's head is trimmed, so the
   * camera still holds still on the first frame shown (the cut stays matched) and moves as late after the cut as it did.
   */
  zoomShift?: Record<number, { startSec?: number; outSec?: number }>;
};

/** A solid patch over part of the page (viewport CSS px), drawn until `untilFrame` (scene frames). */
export type Cover = { rect: readonly [number, number, number, number]; color: string; untilFrame: number };

/** A copy of the shot data with the segment's zoom-focus and zoom-timing overrides applied. */
export const withZoomFocus = (d: ShotData, over?: DesktopSegment["zoomFocus"], shift?: DesktopSegment["zoomShift"]): ShotData => {
  if (!over && !shift) return d;
  const f = (sec?: number) => Math.round((sec ?? 0) * d.fps);
  return {
    ...d,
    zooms: d.zooms.map((z, i) => {
      let out = z;
      if (over && over[i]) out = { ...out, follow: over[i].follow ?? false, depth: over[i].depth ?? out.depth, focus: { point: over[i].point } };
      if (shift && shift[i]) out = { ...out, startFrame: out.startFrame + f(shift[i].startSec), outFrame: out.outFrame === null ? null : out.outFrame + f(shift[i].outSec) };
      return out;
    }),
  };
};

export type DesktopSceneProps = {
  segments: DesktopSegment[];
  url: string;
  /** the window springs in at frame 0 */
  enter?: boolean;
  /** no wallpaper / grain (the film draws them once, globally) */
  bare?: boolean;
  autoSfx?: boolean;
  lights?: "mono" | "color";
  cover?: Cover;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const desktopLength = (segments: DesktopSegment[]) => segments.reduce((a, s) => a + s.durationInFrames, 0);

/**
 * The window's pose at a scene frame: spring entrance (scale 0.94 → 1, y 30 → 0, opacity), the lean-in with zoom
 * depth (camScale) and the idle breathing. Exported so a match cut can land exactly on something inside the window.
 */
export const windowPose = (frame: number, fps: number, { enter = false, camScale = 1 }: { enter?: boolean; camScale?: number } = {}) => {
  const e = enter ? spring({ frame, fps, config: theme.spring.window }) : 1;
  const push = 1 + Math.min(1, Math.max(0, (camScale - 1) / (theme.recordly.defaultDepth - 1))) * theme.window.pushScale;
  const B = theme.window.breathe;
  const phase = (2 * Math.PI * frame) / (B.periodSec * fps);
  const floatY = Math.sin(phase) * B.px;
  const breathe = 1 + Math.sin(phase * 0.77 + 1.1) * B.scale;
  return {
    opacity: Math.min(1, e * 1.2),
    scale: interpolate(e, [0, 1], [0.94, 1], CLAMP) * push * breathe,
    ty: interpolate(e, [0, 1], [30, 0], CLAMP) + floatY,
  };
};

/** Where a viewport point (CSS px, camera at rest) appears in the frame under a window pose. */
export const windowPoint = (p: Vec, pose: ReturnType<typeof windowPose>, vw: number, vh: number, frameW: number, frameH: number): Vec => {
  const L = windowLayout(vw, vh, frameW, frameH);
  const ds = L.contentW / vw;
  const o: Vec = [L.left + L.contentW / 2, L.top + (L.contentH + L.T) / 2];
  const q: Vec = [L.contentLeft + p[0] * ds, L.contentTop + p[1] * ds];
  return [o[0] + pose.scale * (q[0] - o[0]), o[1] + pose.scale * (q[1] - o[1]) + pose.ty];
};

export const DesktopScene: React.FC<DesktopSceneProps> = ({ segments, url, enter = false, bare = false, autoSfx = true, lights, cover }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const raw = useShotsData(segments.map((s) => s.shot));
  const data = useMemo(() => (raw ? raw.map((d, i) => withZoomFocus(d, segments[i].zoomFocus, segments[i].zoomShift)) : null), [raw, segments]);
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
    let zoomsSoFar = 0;
    plan.forEach((p, i) => {
      const d: ShotData = data[i];
      const auto = shotCues(d, { trimFrames: p.trim, durationInFrames: p.durationInFrames, zoomIndexOffset: zoomsSoFar });
      if (autoSfx) out.push(...auto.map((c) => ({ ...c, frame: c.frame + p.start })));
      zoomsSoFar += auto.filter((c) => (theme.sfx.zoomIn.files as readonly string[]).includes(c.file)).length;
      for (const c of p.cues ?? []) out.push({ ...c, frame: c.frame + p.start });
      for (const ec of p.eventCues ?? []) {
        const at = eventCueFrame(d, ec);
        if (at === null) continue;
        out.push({ frame: at - p.trim + p.start + Math.round((ec.offsetSec ?? 0) * fps), file: ec.file, db: ec.db });
      }
    });
    return out.sort((a, b) => a.frame - b.frame);
  }, [data, plan, autoSfx, fps]);

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

  // hard cut (X = 0) or a crossfade window of X frames around each internal cut
  const X = Math.max(0, Math.round(theme.transition.xfadeSec * fps));
  const half = X / 2;
  const layers =
    X === 0
      ? [{ i: active, opacity: 1, blur: 0 }]
      : plan
          .map((p, i) => {
            const from = i === 0 ? p.start : p.start - half;
            const to = i === plan.length - 1 ? p.end : p.end + half;
            if (frame < from || frame >= to) return null;
            // incoming opacity: a spring stretched over the crossfade (0 → 1)
            const inP = i === 0 ? 1 : Math.min(1, spring({ frame: frame - (p.start - half), fps, config: theme.spring.smooth, durationInFrames: X }));
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
  const camA = cameraAt(data[active], tracks[active], shotFrameOf(active), L.contentW, L.contentH);
  const pose = windowPose(frame, fps, { enter, camScale: camA.s });

  // a patch over part of the page (e.g. the loader's logo until the intro sting has landed on it)
  let coverNode: React.ReactNode = null;
  if (cover && frame < cover.untilFrame) {
    const [x0, y0] = toContent([cover.rect[0], cover.rect[1]], camA);
    const [x1, y1] = toContent([cover.rect[0] + cover.rect[2], cover.rect[1] + cover.rect[3]], camA);
    coverNode = <div style={{ position: "absolute", left: x0, top: y0, width: x1 - x0, height: y1 - y0, background: cover.color }} />;
  }

  return (
    <AbsoluteFill>
      {!bare && <Backdrop />}
      <AbsoluteFill
        style={{
          opacity: pose.opacity,
          transformOrigin: `${L.left + L.contentW / 2}px ${L.top + (L.contentH + L.T) / 2}px`,
          transform: `translateY(${pose.ty}px) scale(${pose.scale})`,
        }}
      >
        <MacWindow width={L.contentW} height={L.contentH} url={plan[active].url ?? url} lights={lights} style={{ left: L.left, top: L.top }}>
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
          {coverNode}
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

