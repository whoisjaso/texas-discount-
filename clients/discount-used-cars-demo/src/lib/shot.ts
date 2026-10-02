// Shot data (written by scripts/capture.cjs) and the derived tracks the scenes draw from:
// a spring-smoothed cursor and a zoom camera, both precomputed once per shot so every frame is a pure lookup.
import { useEffect, useMemo, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { theme } from "../theme";

export type Vec = [number, number];
/** c: the pointer shape the OS shows there ('a' arrow, 'p' pointing hand over links, 't' I-beam in text fields) */
export type ShotFrame = { x: number; y: number; down: boolean; scrollY: number; vt: number; c?: "a" | "p" | "t" };
export type Rgb = [number, number, number];
export type ShotEvent =
  | { frame: number; type: "click" | "tap"; x: number; y: number }
  | { frame: number; type: "type"; char: string }
  | { frame: number; type: "key"; key: string }
  | { frame: number; endFrame: number; type: "scroll"; fromY: number; toY: number; cursor: "hide" | "keep" }
  | { frame: number; endFrame: number; type: "touch"; x: number; y: number }
  /** a press-and-hold button: pressed at `frame`, released at `endFrame` */
  | { frame: number; endFrame: number; type: "hold"; x: number; y: number }
  /** a pen on a pad: travel from `frame`, then each stroke [downFrame, upFrame]; the pointer IS the pen (unsmoothed) */
  | { frame: number; endFrame: number; type: "draw"; strokes: [number, number][] };
export type ShotZoom = {
  startFrame: number;
  inFrames: number;
  outFrame: number | null;
  outFrames: number;
  depth: number;
  follow: boolean;
  focus: { track?: string; anchor?: Vec; points?: (Vec | null)[]; point?: Vec; cursor?: boolean };
  sfx?: boolean;
};
export type ShotData = {
  version: number;
  id: string;
  url: string;
  fps: number;
  frameCount: number;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  mobile: boolean;
  pageHeight: number;
  maxScroll: number;
  /** hiddenAtStart: the capture's preroll ended with typing, so the pointer is hidden until the mouse moves */
  cursor: { kind: "pointer" | "touch" | "none"; hiddenAtStart?: boolean };
  /** phone captures: the page's colour along the top and bottom edge, per frame */
  screenEdges?: { top: Rgb[]; bottom: Rgb[] };
  frames: ShotFrame[];
  events: ShotEvent[];
  zooms: ShotZoom[];
  tracks: Record<string, (number[] | null)[]>;
  video?: { file: string; width: number; height: number };
};

export const shotFile = (id: string, file = "shot.mp4") => staticFile(`shots/${id}/${file}`);

/** For calculateMetadata (no hooks). */
export const loadShot = async (id: string): Promise<ShotData> => {
  const res = await fetch(shotFile(id, "cursor.json"));
  if (!res.ok) throw new Error(`shots/${id}/cursor.json: HTTP ${res.status}`);
  return res.json();
};

/** Loads public/shots/<id>/cursor.json, holding the render until it has arrived. */
export const useShotData = (id: string): ShotData | null => {
  const [data, setData] = useState<ShotData | null>(null);
  const [handle] = useState(() => delayRender(`shot ${id}`));
  useEffect(() => {
    loadShot(id)
      .then((d) => {
        setData(d);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [id, handle]);
  return data;
};

/** Loads several shots at once (one delayRender), in the order given. */
export const useShotsData = (ids: string[]): ShotData[] | null => {
  const key = ids.join("|");
  const [data, setData] = useState<ShotData[] | null>(null);
  const [handle] = useState(() => delayRender(`shots ${key}`));
  useEffect(() => {
    Promise.all(key.split("|").map((id) => loadShot(id)))
      .then((d) => {
        setData(d);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [key, handle]);
  return data;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const toF = (sec: number, fps: number) => Math.round(sec * fps);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Critically damped spring follower, simulated frame by frame (4 substeps). */
const springFollow = (targets: Vec[], omega: number, fps: number, snap?: (i: number) => boolean): Vec[] => {
  const out: Vec[] = [];
  if (!targets.length) return out;
  let [x, y] = targets[0];
  let vx = 0;
  let vy = 0;
  const sub = 4;
  const dt = 1 / fps / sub;
  targets.forEach(([tx, ty], i) => {
    if (snap && snap(i)) {
      x = tx;
      y = ty;
      vx = 0;
      vy = 0;
    } else {
      for (let k = 0; k < sub; k++) {
        vx += (omega * omega * (tx - x) - 2 * omega * vx) * dt;
        vy += (omega * omega * (ty - y) - 2 * omega * vy) * dt;
        x += vx * dt;
        y += vy * dt;
      }
    }
    out.push([x, y]);
  });
  return out;
};

/** press: 0–1, how far the pointer is pressed for a hold or a pen stroke (clicks keep their own bounce) */
export type CursorTrack = { pos: Vec[]; opacity: number[]; down: boolean[]; press: number[]; kind: ("a" | "p" | "t")[] };

/**
 * Frames where the pointer is hidden, as macOS / Screen Studio would: while the page scrolls by itself (two scrolls
 * closer than scrollMergeSec stay one hidden stretch, so the pointer does not blink in between), and from a keystroke
 * until the mouse next moves (also from frame 0 when the capture's preroll ended with typing).
 */
const hiddenFrames = (data: ShotData): boolean[] => {
  const R = theme.recordly;
  const n = data.frames.length;
  const hidden = new Array(n).fill(false);
  if (data.cursor.kind !== "pointer") return hidden;
  const merge = toF(R.scrollMergeSec, data.fps);
  const scrolls = data.events
    .filter((e): e is Extract<ShotEvent, { type: "scroll" }> => e.type === "scroll" && e.cursor === "hide")
    .map((e) => [e.frame, e.endFrame] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  for (const r of scrolls) {
    const last = runs[runs.length - 1];
    if (last && r[0] - last[1] <= merge) last[1] = Math.max(last[1], r[1]);
    else runs.push([...r]);
  }
  const movedAfter = (f: number) => {
    const [x0, y0] = [data.frames[f].x, data.frames[f].y];
    for (let g = f + 1; g < n; g++) if (data.frames[g].x !== x0 || data.frames[g].y !== y0) return g;
    return n;
  };
  if (data.cursor.hiddenAtStart) runs.push([0, movedAfter(0)]);
  for (const e of data.events) if (e.type === "type" || e.type === "key") runs.push([e.frame, movedAfter(e.frame)]);
  for (const [a, b] of runs) for (let i = Math.max(0, a); i < Math.min(n, b); i++) hidden[i] = true;
  return hidden;
};

/** Spring-smoothed cursor (Recordly smoothing), lag-compensated, pinned to the raw point around clicks. */
export const computeCursorTrack = (data: ShotData): CursorTrack => {
  const R = theme.recordly;
  const n = data.frames.length;
  const raw: Vec[] = data.frames.map((f) => [f.x, f.y]);
  const leadF = toF(R.cursorLeadSec, data.fps);
  const lead: Vec[] = raw.map((_, i) => raw[Math.min(n - 1, i + leadF)]);
  const pos = springFollow(lead, R.cursorSpring.omega, data.fps);
  const pin = Math.max(1, toF(R.clickPinSec, data.fps));
  // pinned to the raw point over [a, b], blended in and out over `pin` frames on either side
  const pinSpan = (a: number, b: number) => {
    for (let i = Math.max(0, a - pin); i <= Math.min(n - 1, b + pin); i++) {
      const w = i < a ? 1 - (a - i) / (pin + 1) : i > b ? 1 - (i - b) / (pin + 1) : 1;
      pos[i] = [mix(pos[i][0], raw[i][0], w), mix(pos[i][1], raw[i][1], w)];
    }
  };
  for (const e of data.events) {
    if (e.type === "click" || e.type === "tap") pinSpan(e.frame, e.frame);
    // a hold: pinned at the press and at the release; a pen: the ink is in the capture, so the pointer stays on its tip
    if (e.type === "hold") {
      pinSpan(e.frame, e.frame);
      pinSpan(e.endFrame, e.endFrame);
    }
    if (e.type === "draw") pinSpan(e.frame, e.endFrame);
  }
  // While the pen is down the pad draws its ink a little behind the pointer (signature_pad smooths its last points):
  // sit the tip on the ink, penLagFrames back along the path.
  for (const e of data.events) {
    if (e.type !== "draw") continue;
    for (const [a, b] of e.strokes) {
      for (let i = Math.max(1, a + 1); i <= Math.min(n - 1, b); i++) {
        pos[i] = [mix(raw[i][0], raw[i - 1][0], R.penLagFrames), mix(raw[i][1], raw[i - 1][1], R.penLagFrames)];
      }
    }
  }
  // A capture cut on its click's navigation (part B) ends on the raw point, where the next capture's cursor starts.
  const endsOnClick = data.events.some((e) => (e.type === "click" || e.type === "tap" || e.type === "hold") && n - 1 - ("endFrame" in e ? e.endFrame : e.frame) <= pin);
  if (endsOnClick) pinSpan(n - 1, n - 1);
  // press level for holds and pen strokes: eased in over 30% of a click, out over 70% (the click bounce's shape)
  const clickF = (R.clickMs / 1000) * data.fps;
  const pressedAt = new Array(n).fill(false);
  for (const e of data.events) {
    if (e.type === "hold") for (let i = e.frame; i < Math.min(n, e.endFrame); i++) pressedAt[i] = true;
    if (e.type === "draw") for (const [a, b] of e.strokes) for (let i = a; i < Math.min(n, b); i++) pressedAt[i] = true;
  }
  const press = new Array(n).fill(0);
  let lvl = 0;
  for (let i = 0; i < n; i++) {
    lvl = pressedAt[i] ? Math.min(1, lvl + 1 / Math.max(1, 0.3 * clickF)) : Math.max(0, lvl - 1 / Math.max(1, 0.7 * clickF));
    press[i] = theme.ease.inOut(lvl);
  }
  // opacity eases toward the hidden/visible state; the Cursor pairs it with a slight scale (never a lone fade)
  const hidden = hiddenFrames(data);
  const F = Math.max(1, toF(R.cursorHideFadeSec, data.fps));
  const opacity = new Array(n).fill(data.cursor.kind === "pointer" ? 1 : 0);
  if (data.cursor.kind === "pointer") {
    let level = hidden[0] ? 0 : 1;
    for (let i = 0; i < n; i++) {
      const target = hidden[i] ? 0 : 1;
      level = target > level ? Math.min(1, level + 1 / F) : Math.max(0, level - 1 / F);
      opacity[i] = theme.ease.inOut(level);
    }
  }
  return { pos, opacity, down: data.frames.map((f) => f.down), press, kind: data.frames.map((f) => f.c ?? "a") };
};

export const zoomScaleAt = (z: ShotZoom, f: number): number => {
  const R = theme.recordly;
  if (f < z.startFrame) return 1;
  const inAt = (g: number) => 1 + (z.depth - 1) * R.zoomInEase(clamp01((g - z.startFrame) / z.inFrames));
  if (z.outFrame === null || f < z.outFrame) return inAt(f);
  const atOut = inAt(z.outFrame);
  return 1 + (atOut - 1) * (1 - R.zoomOutEase(clamp01((f - z.outFrame) / z.outFrames)));
};

export type CameraTrack = { scale: number[]; focus: Vec[]; activeZoom: (number | null)[] };

/** Zoom depth per frame and a softly trailing focus point (viewport CSS px). */
export const computeCameraTrack = (data: ShotData, cursor: CursorTrack): CameraTrack => {
  const R = theme.recordly;
  const n = data.frames.length;
  const scale: number[] = [];
  const activeZoom: (number | null)[] = [];
  const targets: Vec[] = [];
  let last: Vec = [data.viewport.width / 2, data.viewport.height / 2];
  for (let f = 0; f < n; f++) {
    let best: number | null = null;
    let s = 1;
    data.zooms.forEach((z, i) => {
      const v = zoomScaleAt(z, f);
      if (v > s + 1e-6) {
        s = v;
        best = i;
      }
    });
    scale.push(s);
    activeZoom.push(best);
    if (best !== null) {
      const z = data.zooms[best];
      let t: Vec = last;
      if (z.focus.points && z.focus.points[f]) t = z.focus.points[f] as Vec;
      else if (z.focus.point) t = z.focus.point;
      else if (z.focus.cursor) t = cursor.pos[f];
      if (z.follow && !z.focus.cursor) t = [mix(t[0], cursor.pos[f][0], R.followWeight), mix(t[1], cursor.pos[f][1], R.followWeight)];
      last = t;
    }
    targets.push(last);
  }
  // Snap while the camera is at rest (scale 1), so a zoom always starts from its own focus.
  const focus = springFollow(targets, R.cameraSpring.omega, data.fps, (i) => scale[i] <= 1.0005);
  return { scale, focus, activeZoom };
};

export const computeTracks = (data: ShotData) => {
  const cursor = computeCursorTrack(data);
  const camera = computeCameraTrack(data, cursor);
  return { cursor, camera };
};

export const useTracks = (data: ShotData | null) => useMemo(() => (data ? computeTracks(data) : null), [data]);

/** The camera transform for a content box of W × H display px showing a viewport of vw × vh CSS px. */
export const cameraTransform = (s: number, focus: Vec, vw: number, vh: number, W: number, H: number) => {
  const ds = W / vw;
  const tx = Math.max(W - W * s, Math.min(0, W / 2 - focus[0] * ds * s));
  const ty = Math.max(H - H * s, Math.min(0, H / 2 - focus[1] * ds * s));
  void vh;
  return { s, tx, ty, ds };
};

/** Viewport CSS px → content-box display px under a camera transform. */
export const toContent = (p: Vec, t: { s: number; tx: number; ty: number; ds: number }): Vec => [t.tx + p[0] * t.ds * t.s, t.ty + p[1] * t.ds * t.s];
