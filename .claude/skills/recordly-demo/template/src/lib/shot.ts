// Shot data (written by scripts/capture.cjs) and the derived tracks the scenes draw from:
// a spring-smoothed cursor and a zoom camera, both precomputed once per shot so every frame is a pure lookup.
import { useEffect, useMemo, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { theme } from "../theme";

export type Vec = [number, number];
export type ShotFrame = { x: number; y: number; down: boolean; scrollY: number; vt: number };
export type ShotEvent =
  | { frame: number; type: "click" | "tap"; x: number; y: number }
  | { frame: number; type: "type"; char: string }
  | { frame: number; type: "key"; key: string }
  | { frame: number; endFrame: number; type: "scroll"; fromY: number; toY: number; cursor: "hide" | "keep" }
  | { frame: number; endFrame: number; type: "touch"; x: number; y: number };
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
  cursor: { kind: "pointer" | "touch" | "none" };
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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
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

export type CursorTrack = { pos: Vec[]; opacity: number[]; down: boolean[] };

/** Spring-smoothed cursor (Recordly smoothing), lag-compensated, pinned to the raw point around clicks. */
export const computeCursorTrack = (data: ShotData): CursorTrack => {
  const R = theme.recordly;
  const n = data.frames.length;
  const raw: Vec[] = data.frames.map((f) => [f.x, f.y]);
  const lead: Vec[] = raw.map((_, i) => raw[Math.min(n - 1, i + R.cursorLeadFrames)]);
  const pos = springFollow(lead, R.cursorSpring.omega, data.fps);
  for (const e of data.events) {
    if (e.type !== "click" && e.type !== "tap") continue;
    for (let i = Math.max(0, e.frame - 6); i <= Math.min(n - 1, e.frame + 6); i++) {
      const w = 1 - Math.abs(i - e.frame) / 7;
      pos[i] = [mix(pos[i][0], raw[i][0], w), mix(pos[i][1], raw[i][1], w)];
    }
  }
  const opacity = new Array(n).fill(data.cursor.kind === "pointer" ? 1 : 0);
  if (data.cursor.kind === "pointer") {
    const F = R.cursorHideFadeFrames;
    for (const e of data.events) {
      if (e.type !== "scroll" || e.cursor !== "hide") continue;
      for (let i = Math.max(0, e.frame); i < Math.min(n, e.endFrame + F); i++) {
        const out = theme.ease.inOut(clamp01((i - e.frame) / F));
        const back = theme.ease.inOut(clamp01((i - e.endFrame) / F));
        opacity[i] = Math.min(opacity[i], 1 - out + back);
      }
    }
  }
  return { pos, opacity, down: data.frames.map((f) => f.down) };
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

export const useTracks = (data: ShotData | null) =>
  useMemo(() => {
    if (!data) return null;
    const cursor = computeCursorTrack(data);
    const camera = computeCameraTrack(data, cursor);
    return { cursor, camera };
  }, [data]);

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
