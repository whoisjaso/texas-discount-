// Several desktop captures played back to back in ONE macOS window: the window springs in once and stays. At each
// cut the next capture takes over: a HARD cut by default (the captures are staged pixel-matched: same scroll, same
// cursor, same hover), or a spring crossfade under a short blur when theme.transition.xfadeSec > 0 (for captures
// that do not match). Each capture keeps its own zoom camera and cursor track. Captures are mapped frame by frame
// with <Freeze> (during a crossfade the outgoing capture holds its last frame, the incoming its first).
import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { computeTracks, ShotData, ShotEvent, ShotZoom, shotFile, toContent, useShotsData, Vec } from "../lib/shot";
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
  /** a draw event: one cue per pen stroke, cut (with a short fade) to the stroke's length */
  perStroke?: boolean;
  /** cut the cue after this long (with fadeSec) */
  maxSec?: number;
  fadeSec?: number;
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
  zoomShift?: Record<number, { startSec?: number; outSec?: number; /** absolute capture seconds the zoom starts to leave; null holds it to the end */ outAtSec?: number | null }>;
  /** Composition-only edits of the capture's events and pointer (see SegmentEdit). */
  edit?: SegmentEdit;
  /**
   * A still: the capture frame at trimSec is held for durationInFrames (camera, pointer and page as they were on that
   * frame; the window keeps breathing). Plays no capture sounds. Used by the narrated cut to let a line finish on a
   * picture, and under a document or the phone laid over the desk.
   */
  hold?: boolean;
};

/**
 * Composition-only edits of a capture's events and pointer path (capture frames). The recording's pixels do not depend
 * on any of them: the pointer and its click rings are drawn by Remotion.
 * - addClicks: a click drawn (ring, bounce, tink) where the capture has none, e.g. the press on the menu's Admin row
 *   a few frames before the cut to the desk, so the click reads on the page it was made on.
 * - moveEvents: re-time an event (by type and index), e.g. the desk capture's own copy of that click moved so its ring
 *   and bounce continue across the cut, or a hold's release moved earlier when the segment ends inside the hold.
 * - nudge: offset the pointer by (dx, dy) CSS px, eased in over `in` and out over `out` (frames), e.g. so the hand
 *   does not cover a button's label during a press-and-hold. Events between the two ramps move with it.
 */
export type SegmentEdit = {
  addClicks?: { frame: number }[];
  moveEvents?: { type: ShotEvent["type"]; index: number; frame?: number; endFrame?: number }[];
  nudge?: { dx: number; dy: number; in: [number, number]; out?: [number, number] };
  /** events the capture lacks (e.g. a hide-the-pointer scroll span across a cut that skips a stretch of the capture) */
  addEvents?: ShotEvent[];
  /** zooms the capture lacks, appended after its own (e.g. a camera that opens at a depth and pulls back from the cut) */
  addZooms?: ShotZoom[];
};

/** A copy of the shot data with a segment's edits applied. */
export const withEdits = (d: ShotData, edit?: SegmentEdit): ShotData => {
  if (!edit) return d;
  let frames = d.frames;
  let events: ShotEvent[] = d.events.map((e) => ({ ...e }) as ShotEvent);
  if (edit.nudge) {
    const { dx, dy, in: [a, b], out } = edit.nudge;
    const w = (i: number) => {
      if (i <= a) return 0;
      if (i < b) return theme.ease.inOut((i - a) / Math.max(1, b - a));
      if (!out || i <= out[0]) return 1;
      if (i < out[1]) return 1 - theme.ease.inOut((i - out[0]) / Math.max(1, out[1] - out[0]));
      return 0;
    };
    frames = frames.map((f, i) => (w(i) ? { ...f, x: f.x + dx * w(i), y: f.y + dy * w(i) } : f));
    events = events.map((e) => ("x" in e && w(e.frame) === 1 ? ({ ...e, x: e.x + dx, y: e.y + dy } as ShotEvent) : e));
  }
  for (const m of edit.moveEvents ?? []) {
    const hits = events.filter((e) => e.type === m.type);
    const e = hits[m.index] as ShotEvent & { endFrame?: number };
    if (!e) continue;
    if (m.frame !== undefined) e.frame = m.frame;
    if (m.endFrame !== undefined && "endFrame" in e) e.endFrame = m.endFrame;
  }
  for (const c of edit.addClicks ?? []) {
    const f = frames[Math.max(0, Math.min(frames.length - 1, c.frame))];
    events.push({ frame: c.frame, type: "click", x: f.x, y: f.y });
  }
  for (const e of edit.addEvents ?? []) events.push({ ...e } as ShotEvent);
  events.sort((p, q) => p.frame - q.frame);
  return { ...d, frames, events, zooms: edit.addZooms ? [...d.zooms, ...edit.addZooms] : d.zooms };
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
      if (shift && shift[i]) {
        const sh = shift[i];
        const outFrame = sh.outAtSec !== undefined ? (sh.outAtSec === null ? null : f(sh.outAtSec)) : out.outFrame === null ? null : out.outFrame + f(sh.outSec);
        out = { ...out, startFrame: out.startFrame + f(sh.startSec), outFrame };
      }
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
  /** zoom whooshes after the captures (scene frames), e.g. the 130-U push; their variants continue the rotation */
  whooshAfter?: { frame: number }[];
  /** dB added to the sound cue starting at this scene frame (the narrated cut ducks effects under the voice) */
  duckDb?: (sceneFrame: number) => number;
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

/**
 * Every sound a DesktopScene plays, in scene frames: each capture's own cues (clicks, keys, zoom whooshes, from its
 * edited data), the segments' cues and event cues, and whooshAfter. Pure, so verify-film.cjs plans the same list.
 * `data` is each segment's shot data with its edits and camera overrides applied (prepareData).
 */
export const desktopCues = (segments: DesktopSegment[], data: ShotData[], fps: number, { autoSfx = true, whooshAfter }: { autoSfx?: boolean; whooshAfter?: { frame: number }[] } = {}): Cue[] => {
  const out: Cue[] = [];
  let zoomsSoFar = 0;
  let start = 0;
  segments.forEach((seg, i) => {
    const d = data[i];
    const trim = Math.round((seg.trimSec ?? 0) * fps);
    if (seg.hold) {
      for (const c of seg.cues ?? []) out.push({ ...c, frame: c.frame + start });
      start += seg.durationInFrames;
      return;
    }
    const auto = shotCues(d, { trimFrames: trim, durationInFrames: seg.durationInFrames, zoomIndexOffset: zoomsSoFar });
    if (autoSfx) out.push(...auto.map((c) => ({ ...c, frame: c.frame + start })));
    zoomsSoFar += auto.filter((c) => (theme.sfx.zoomIn.files as readonly string[]).includes(c.file)).length;
    for (const c of seg.cues ?? []) out.push({ ...c, frame: c.frame + start });
    for (const ec of seg.eventCues ?? []) {
      const off = Math.round((ec.offsetSec ?? 0) * fps);
      if (ec.perStroke) {
        const ev = d.events.filter((e) => e.type === ec.type)[ec.index];
        if (!ev || ev.type !== "draw") continue;
        for (const [a, b] of ev.strokes) out.push({ frame: a - trim + start + off, file: ec.file, db: ec.db, maxSec: (b - a) / fps, fadeSec: ec.fadeSec });
        continue;
      }
      const at = eventCueFrame(d, ec);
      if (at === null) continue;
      out.push({ frame: at - trim + start + off, file: ec.file, db: ec.db, maxSec: ec.maxSec, fadeSec: ec.fadeSec });
    }
    start += seg.durationInFrames;
  });
  // whooshes placed after the captures (the 130-U push) continue the rotation over the whooshes heard so far
  (whooshAfter ?? []).forEach((w, k) => {
    const files = theme.sfx.zoomIn.files;
    out.push({ frame: w.frame, file: files[(zoomsSoFar + k) % files.length], db: theme.sfx.zoomIn.db, maxSec: theme.sfx.zoomIn.maxSec });
  });
  return out.sort((a, b) => a.frame - b.frame);
};

/** Each segment's shot data with its edits, zoom re-aims and zoom re-timings applied. */
export const prepareData = (raw: ShotData[], segments: DesktopSegment[]): ShotData[] =>
  raw.map((d, i) => withZoomFocus(withEdits(d, segments[i].edit), segments[i].zoomFocus, segments[i].zoomShift));

export const DesktopScene: React.FC<DesktopSceneProps> = ({ segments, url, enter = false, bare = false, autoSfx = true, lights, cover, whooshAfter, duckDb }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const raw = useShotsData(segments.map((s) => s.shot));
  const data = useMemo(() => (raw ? prepareData(raw, segments) : null), [raw, segments]);
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
    const list = data ? desktopCues(segments, data, fps, { autoSfx, whooshAfter }) : [];
    return duckDb ? list.map((c) => ({ ...c, db: c.db + duckDb(c.frame) })) : list;
  }, [data, segments, autoSfx, fps, whooshAfter, duckDb]);

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
    if (p.hold) return p.trim;
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
              key={`${plan[l.i].shot}-${l.i}`}
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

