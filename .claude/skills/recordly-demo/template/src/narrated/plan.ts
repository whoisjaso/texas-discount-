// The narrated long cut ("Narrated"): the client's running order, laid out against the voice. TEMPLATE COPY: empty, so
// part A and B projects typecheck and Root.tsx registers no Narrated composition (narratedPlan.total is 0).
//
// How to fill it (references/narration.md §5-7; runbook N10). examples/discount-used-cars/plan.ts is the worked one
// (24 lines, 3:50): read it first, then write THIS client's lists from THIS client's captures. Never copy its frame
// numbers: every capture frame below is read off this run's cursor.json events and narrated-check's table.
//   SEGMENTS  desktop segments in one window: part A's (partASegments), part B's sign-in (partBSegments), then this
//             client's narrated captures (20-27) cut with cap(key, shot, from, to) and held with hold(key, shot, frame, 0)
//             under each overlay (the overlay sets the hold's length).
//   LINES     one per voice line: its key word (word(id, "county")) lands on the picture that shows it: {seg, capture}
//             (a capture frame), {overlay, at} (seconds into an overlay), {gap} (seconds after the previous line ends)
//             or {outro} (seconds into the outro). client-inputs.json → narration.anchors says which event each line's
//             word names; narrated-plan.cjs prints the lip-to-picture table from it and gates it (0-0.5 s).
//   OVERLAYS  documents (the deal's own PDF pages, rasterised with raster-docs.sh --find) and the phone, each over a
//             hold, with its length in seconds; DocSpec keys / spots in the page PNG's px (find them with
//             pdftotext -bbox on the anchor text, not by eye).
// Then: node $S/scripts/narrated-check.cjs --project $P (PLAN OK) and narrated-plan.cjs (the table and its gate).
import { theme } from "../theme";
import { project } from "../project";
import { DesktopSegment } from "../scenes/DesktopScene";
import { VO_LINES, VoLine } from "./vo-lines";

const fps = theme.fps;
const sec = (s: number) => Math.round(s * fps);
const DESK = project.partBDomain ?? project.domain;

export type Seg = DesktopSegment & { key: string };

/** capture frames [a, b) of a desk capture */
export const cap = (key: string, shot: string, a: number, b: number, more: Partial<DesktopSegment> = {}): Seg => ({
  key,
  shot,
  url: DESK,
  trimSec: a / fps,
  durationInFrames: b - a,
  ...more,
});
/** capture frame f held as a still for n frames (n = 0 under an overlay: the overlay sets it) */
export const hold = (key: string, shot: string, f: number, n: number, url: string = DESK): Seg => ({ key, shot, url, trimSec: f / fps, durationInFrames: n, hold: true });
/**
 * The click (by index among the capture's clicks) whose ring was running when the previous segment ended (on capture
 * frame `lastShown`), moved so that it runs on across the cut from `start`, the next segment's first frame.
 */
export const ringOn = (index: number, clickFrame: number, lastShown: number, start: number) => ({
  type: "click" as const,
  index,
  frame: start - (lastShown - clickFrame) - 1,
});

// ---- the voice: each line's anchor word on its picture
export type Anchor =
  | { seg: string; capture: number } // a capture frame of a desktop segment
  | { overlay: string; at: number } // seconds into an overlay
  | { outro: number } // seconds into the outro
  | { gap: number }; // after the previous line, this many seconds of silence
export type LinePlan = { id: string; word: number; anchor: Anchor; why: string };

/** the index of a line's word (case and punctuation ignored); nth for a repeated word */
export const word = (id: string, w: string, nth = 0): number => {
  const line = VO_LINES.find((l) => l.id === id);
  if (!line) throw new Error(`no voice line ${id} in vo-lines.ts (run prepare-vo.py)`);
  const hits = line.words.map((x, i) => [x[0].toLowerCase().replace(/[^a-z0-9'-]/g, ""), i] as const).filter(([x]) => x === w.toLowerCase());
  if (!hits[nth]) throw new Error(`no word "${w}" in ${id}`);
  return hits[nth][1];
};
const vo = (id: string) => VO_LINES.find((l) => l.id === id) as VoLine;
/** seconds from a line's start to its word */
export const w = (id: string, name: string, nth = 0) => vo(id).words[word(id, name, nth)][1];

// ---- overlays over held desk frames
export type DocKey = { at: number; x: number; y: number; ds: number; dur?: number; landY?: number };
export type DocSpot = { from: number; to: number; box: [number, number, number, number] };
export type DocSpec = {
  src: string;
  size: [number, number];
  fileName: string;
  page: number;
  pages: number;
  privacy: [number, number, number, number][];
  keys: DocKey[];
  spots: DocSpot[];
  caption?: { text: string; at: number; exitAt: number };
  /** seconds into the overlay when this window starts to open and to close */
  openAt: number;
  closeAt: number;
  offset?: [number, number];
};
export type PhoneSpec = {
  /** [shot, first, last exclusive] capture ranges played in order */
  parts: [string, number, number][];
  /** a finger flick drawn where the capture scrolled an inner sheet by script: [shot, frame, frames, x, y0, y1] */
  flicks: [string, number, number, number, number, number][];
  /** frames the last capture frame is held, under the exit */
  tail: number;
};
export type Overlay = { key: string; hold: string; from: number; durationInFrames: number; docs?: DocSpec[]; phone?: PhoneSpec };
/** an overlay as planned: its hold segment, its length (seconds; a phone's is its parts + tail + exit) and what it shows */
export type OverlayPlan = { key: string; hold: string; seconds: number; docs?: (len: number) => DocSpec[]; phone?: PhoneSpec };

// =====================================================================================================================
// THE CLIENT'S PLAN (empty in the template)
// =====================================================================================================================
export const HOLDS: Record<string, number> = {};
const SEGMENTS: Seg[] = [];
export const LINES: LinePlan[] = [];
const OVERLAYS: OverlayPlan[] = [];
/** the outro runs this long after the last line's last word: the lines, a breath, the fade (house: 3.9 s) */
const OUTRO_TAIL_SEC = 3.9;

// ---- build (house: the same for every client)
export const buildNarrated = () => {
  const handoffAt = sec(theme.sting.handoffAtSec);
  const landAt = handoffAt + sec(theme.sting.handoffSec);
  const intro = { from: 0, handoffAt, landAt, fadeFrames: sec(theme.sting.fadeSec), durationInFrames: landAt + sec(theme.sting.fadeSec) + 1 };
  const deskFrom = handoffAt;
  const segs = SEGMENTS.map((s) => ({ ...s }));
  const byKey = (k: string) => {
    const s = segs.find((x) => x.key === k);
    if (!s) throw new Error(`plan: no segment "${k}"`);
    return s;
  };
  // overlay lengths set their holds
  const lens: Record<string, number> = {};
  for (const o of OVERLAYS) {
    if (o.phone) {
      const parts = o.phone.parts.reduce((a, p) => a + (p[2] - p[1]), 0);
      byKey(o.hold).durationInFrames = parts + o.phone.tail;
      lens[o.key] = parts + o.phone.tail + sec(theme.phone.exitSec);
    } else {
      byKey(o.hold).durationInFrames = sec(o.seconds);
      lens[o.key] = sec(o.seconds);
    }
  }
  const m: Record<string, number> = {};
  let at = deskFrom;
  for (const s of segs) {
    m[s.key] = at;
    at += s.durationInFrames;
  }
  const deskEnd = at;
  const overlays: Overlay[] = OVERLAYS.map((o) => ({
    key: o.key,
    hold: o.hold,
    from: m[o.hold],
    durationInFrames: lens[o.key],
    ...(o.docs ? { docs: o.docs(o.seconds) } : {}),
    ...(o.phone ? { phone: o.phone } : {}),
  }));
  const last = LINES.length ? vo(LINES[LINES.length - 1].id) : null;
  const outro = { from: deskEnd - sec(0.5), durationInFrames: sec((last ? last.sec : 0) + OUTRO_TAIL_SEC) };
  const total = segs.length ? outro.from + outro.durationInFrames : 0;
  const trimOf = (s: Seg) => Math.round((s.trimSec ?? 0) * fps);
  const placed: { id: string; from: number; durationInFrames: number; sec: number; anchorFilm: number; why: string }[] = [];
  for (const lp of LINES) {
    const line = vo(lp.id);
    const wordT = line.words[lp.word][1];
    const a = lp.anchor;
    let anchorFilm: number;
    if ("gap" in a) {
      const prev = placed[placed.length - 1];
      anchorFilm = prev.from + sec(prev.sec + a.gap) + sec(wordT);
    } else if ("seg" in a) {
      const s = byKey(a.seg);
      anchorFilm = m[a.seg] + (s.hold ? a.capture : a.capture - trimOf(s));
    } else if ("outro" in a) anchorFilm = outro.from + sec(a.outro) + sec(wordT);
    else {
      const o = overlays.find((x) => x.key === a.overlay);
      if (!o) throw new Error(`plan: line ${lp.id} is anchored on a missing overlay "${a.overlay}"`);
      anchorFilm = o.from + sec(a.at);
    }
    placed.push({ id: lp.id, from: anchorFilm - sec(wordT), durationInFrames: Math.ceil(line.sec * fps), sec: line.sec, anchorFilm, why: lp.why });
  }
  return { intro, deskFrom, segments: segs as DesktopSegment[], segKeys: segs.map((s) => s.key), segStarts: m, deskEnd, overlays, outro, total, lines: placed, pad: 0.25 };
};

export type NarratedPlan = ReturnType<typeof buildNarrated>;
export const narratedPlan = buildNarrated();
