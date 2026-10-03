#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * capture.cjs — one storyboard shot → deterministic PNG frames, shot.mp4 and
 * cursor.json, for the Recordly-style demo pipeline (see ../SKILL.md).
 *
 * Our own code. Recordly is AGPL-3.0: none of its code is used here, only its
 * published tuning numbers (which live in the Remotion template's theme).
 *
 * How it stays deterministic: Chromium runs on DevTools *virtual time*
 * (Emulation.setVirtualTimePolicy). Time is paused, then advanced by exactly
 * one frame budget (1000/30 ms) with policy `pauseIfNetworkFetchesPending`, so
 * every CSS animation, transition, timer, requestAnimationFrame and Date.now()
 * moves exactly 1/30 s between two screenshots, however slow the screenshot
 * is, and time stops while anything is still downloading (no half-loaded
 * images). Scrolling is eased `window.scrollTo` inside the page; hover, click
 * and typing are real input events (Playwright mouse / keyboard), so :hover
 * styles, focus rings and the menu drawer really happen.
 *
 * The OS cursor is never captured. cursor.json carries the cursor track the
 * Remotion composition draws: per frame {x, y, down} in CSS px of the
 * viewport, plus events (click / type / scroll / touch) by frame.
 *
 * USAGE
 *   node capture.cjs --storyboard storyboard.json --shot 1-hero --out DIR [options]
 *   node capture.cjs --shot-file shot.json --out DIR [options]
 *   node capture.cjs --selftest [--base http://localhost:5183] [--out DIR] [--dsf 1,2] [--clock ISO]
 *
 * OPTIONS
 *   --base URL        site origin (default: storyboard.base or http://localhost:5183)
 *   --dsf N           override the shot's deviceScaleFactor
 *   --publish DIR     copy shot.mp4 + cursor.json to DIR/<shot id>/ when done
 *   --clean           delete <out>/frames after the MP4 is encoded and its frame
 *                     count verified (disk is limited: use it for big shots)
 *   --no-encode       write frames + cursor.json only
 *   --preset P        x264 preset (default medium)
 *   --var NAME=VALUE  fills {NAME} in the shot's url (repeatable), e.g. a deal made by an off-camera set-up script:
 *                     "url": "/admin/sales/{deal}/packet" with --var deal=preview-deals-7 (shot.vars holds defaults)
 *
 * SHOT FORMAT (times in seconds, relative to frame 0)
 *   {
 *     "id": "2-scroll", "url": "/",
 *     "base": "http://localhost:5190",   // optional: this shot's origin, over storyboard.base / --base (a desk shot
 *                                      // in a storyboard whose base is the site)
 *     "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 2 },
 *     "mobile": false,                 // true → isMobile + hasTouch, touch cursor
 *     "presetIntroSeen": true,         // sessionStorage[introKey] = '1' before load
 *     "introKey": "discount.intro.seen", // the site's Loader SEEN_KEY (or storyboard.introKey); required with presetIntroSeen
 *     "clock": "2026-09-30T14:00:00-05:00",  // virtual wall clock at load (or storyboard.clock)
 *     "timezone": "America/Chicago",   // page time zone (or storyboard.timezone; default America/Chicago)
 *     "durationSec": 14,
 *     "prerollSec": 6.5,               // virtual time run (not captured) before frame 0
 *     "readySelector": ".hero__title", // warm-up waits for it (and fonts, load)
 *     "css": "",                       // optional extra CSS injected in the page, after storyboard.captureCss
 *                                      // (captureCss: a string or {css, why}; skipped when this css already contains it)
 *     "cursor": { "kind": "pointer"|"touch"|"none", "start": { "x": 1500, "y": 980 } },
 *                                      // or "start": { "fromShot": "1-hero", "x": 365, "y": 568 } (x/y = fallback)
 *     "actions": [
 *       { "t": 0.4, "type": "scrollTo", "selector": ".band__title", "align": "start", "offset": 140, "durationSec": 1.8 },
 *       { "t": 3.0, "type": "scrollBy", "y": 600, "touch": { "x": 230, "y": 620 }, "dragSec": 0.3, "tauSec": 0.32 },
 *       { "t": 3.6, "type": "hover", "selector": "a.model", "contains": "Trucks", "anchor": [0.55, 0.5], "durationSec": 0.8 },
 *       { "t": 4.0, "type": "moveTo", "x": 900, "y": 600 },
 *       { "t": -3.0, "type": "moveTo", "fromShot": "3-buy", "dx": 6, "dy": 2 },  // a few px from where 3-buy ended
 *       { "t": 11.3, "type": "click", "selector": "#finder-q", "anchor": [0.25, 0.5] },
 *       { "t": 12.4, "type": "type", "text": "F-150", "perCharSec": 0.13 },
 *       { "t": 13.0, "type": "press", "key": "Escape" },
 *       { "t": 9.0, "type": "wait" }
 *     ],
 *     "zooms": [ { "at": 4.0, "until": 6.5, "depth": 1.8, "focus": "a.model[href*=Truck]", "tight": false, "follow": true } ],
 *     "track": { "name": "css selector" },  // extra rects recorded per frame
 *     "cookies": [{ "name": "session", "value": "x" }]  // set for the shot's origin before load (or storyboard.cookies;
 *                                      // a shot's own list, even [], replaces the storyboard's)
 *   }
 *   More actions:
 *     { "t": 2.0, "type": "hold", "selector": "[data-confirm-hold]", "holdSec": 2.4 }
 *         travel like a click, press on arrival, keep the button down holdSec, release (a press-and-hold button).
 *     { "t": 4.0, "type": "draw", "selector": "canvas", "strokes": [[[0.1, 0.6], [0.2, 0.3], …], …], "inkSec": 1.6 }
 *         a pen on a pad: travel (pen up, approachSec) to the first point, then each stroke with the button down,
 *         lifting between strokes (liftSec each). Points are fractions of the selector's box (units "px": CSS px from
 *         its top-left). Each stroke is a centripetal Catmull-Rom spline through its points, traced at handwriting
 *         speed (two-thirds power law: slower in tight turns, eased at each end); the strokes share inkSec in
 *         proportion to their natural time. Mouse moves are sampled subSteps times per frame (default 2 = 60 Hz,
 *         one extra rendered, uncaptured frame each) so a pad that samples pointer moves gets a smooth line.
 *         "timeScale": 3 lets the page live 3 frames of time per film frame while the pen is on the pad, for a pad that
 *         throttles moves to one per 16 ms (signature_pad): it then gets subSteps × timeScale points per film frame
 *         (the ink looks as if drawn at 1/3 speed: a steadier, bolder line). Frames' vt jumps accordingly.
 *     { "t": -1.0, "type": "fill", "selector": "input[name=buyerFirstName]", "value": "James" }
 *         set an input / select / textarea value at once (React-safe), no keystrokes: for off-camera set-up.
 *     { "t": -0.9, "type": "domClick", "selector": "button.ed-pick", "contains": "Camry" }
 *         element.click() without moving the pointer: for off-camera set-up.
 *     { "t": 0.0, "type": "eval", "js": "document.documentElement.classList.add('enter')" }
 *         run a script in the page at that frame (e.g. start a video-only CSS entrance on frame 0).
 *     { "t": -0.2, "type": "moveTo", "to": "start", "durationSec": 0.1 }
 *         travel back to the shot's (resolved) cursor.start, e.g. after a set-up preroll moved the mouse.
 *   A zoom may start before frame 0 ("at": -0.034, "inSec": 0.034) to open a shot already at depth, e.g. on the camera
 *   the previous capture ended on.
 *   Every action starts at `t`. Pointer actions (moveTo / hover / click) travel
 *   from wherever the cursor is along an eased, gently bowed curve for
 *   `durationSec` (default from distance, 0.6–1.3 s); a click presses when the
 *   cursor arrives and releases 100 ms later. Negative `t` = set-up actions that
 *   run during the preroll (e.g. pre-type a field for continuity with the
 *   previous shot). Selectors are CSS; `contains` filters by text, `nth` picks
 *   the n-th match.
 *
 *   Touch scrolls (phone shots, or any scroll with `touch`) are iOS swipes: the finger drags the page 1:1 for
 *   `dragSec`, lets go, and the page coasts to a stop (exponential decay, `tauSec`); the default length is
 *   dragSec + 4.5 tauSec. The finger position in cursor.json rides with the content while it is down.
 *
 * WHAT cursor.json RECORDS besides the track: per frame `c`, the pointer shape the OS would show there ('a' arrow,
 * 'p' pointing hand over links/buttons, 't' I-beam in text fields, from the element's computed `cursor`);
 * `cursor.hiddenAtStart` when the preroll ended with typing (macOS hides the pointer until the mouse moves);
 * for phone shots `screenEdges.top/bottom`, the page's colour along the top and bottom edge per frame (status-bar tint,
 * home-indicator colour). Per frame `down` is true while the button is held (a click's 100 ms, a hold, a pen stroke).
 * Events, besides click / type / key / scroll / touch / tap: `hold` {frame, endFrame, x, y} (press → release) and
 * `draw` {frame, endFrame, strokes: [[downFrame, upFrame], …]} (the pointer IS the pen there: draw it unsmoothed).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync, spawnSync } = require('child_process');

const FPS = 30;
const DEFAULT_BASE = 'http://localhost:5183';
const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_SELFTEST_CLOCK = '2026-09-30T14:00:00-05:00';
const ZOOM_LEVELS = [1.25, 1.5, 1.8, 2.2, 3.5]; // Recordly depth levels 1..5 (default 3 = 1.8)
const ZOOM_IN_SEC = 1.5;
const ZOOM_OUT_SEC = 1.0;
const EASE = {
  scroll: [0.65, 0, 0.35, 1], // ease-in-out, symmetric: a page scroll that starts and lands softly
  touch: [0.25, 0.1, 0.25, 1],
};

// ---------------------------------------------------------------- utilities

function loadPlaywright() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  }
  if (process.env.PWPATH) return require(process.env.PWPATH); // scripts/env.sh writes it (default $(npm root -g)/playwright)
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

/** cubic-bezier(x1, y1, x2, y2) evaluated at x in [0, 1] (Newton + bisection). */
function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}
const ease = Object.fromEntries(Object.entries(EASE).map(([k, v]) => [k, bezier(v)]));
// A hand moving a mouse follows the minimum-jerk profile (bell-shaped speed, peak 1.875× the mean).
ease.pointer = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t));

// iOS-style swipe: the finger drags the page 1:1 (its speed ramps up over the first ~45% of the drag), lets go,
// and the page coasts to a stop with exponential decay (τ ≈ 0.32 s, close to UIScrollView's normal rate).
const SWIPE = { dragSec: 0.3, tauSec: 0.32, tailTau: 4.5 };
/** Cumulative fraction of the scroll distance reached after each of n frames (last = 1). */
function swipeProfile(n, dragFrames, tauFrames) {
  const ramp = Math.max(1, Math.round(dragFrames * 0.45));
  const v = [];
  for (let i = 0; i < n; i++) v.push(i < dragFrames ? ease.pointer(Math.min(1, (i + 1) / ramp)) : Math.exp(-(i - dragFrames + 1) / tauFrames));
  const sum = v.reduce((a, b) => a + b, 0);
  let acc = 0;
  return v.map((x) => (acc += x) / sum);
}

// ----------------------------------------------------------- pen (draw action)

/** Centripetal Catmull-Rom spline through pts ([[x, y], …]), `per` samples per segment, passing through every point. */
function catmullRom(pts, per = 24) {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]]);
  const n = pts.length;
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]]];
  const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    const lerp = (a, b, ta, tb, t) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
    for (let j = i === 1 ? 0 : 1; j <= per; j++) {
      const t = t1 + ((t2 - t1) * j) / per;
      const A1 = lerp(p0, p1, t0, t1, t), A2 = lerp(p1, p2, t1, t2, t), A3 = lerp(p2, p3, t2, t3, t);
      const B1 = lerp(A1, A2, t0, t2, t), B2 = lerp(A2, A3, t1, t3, t);
      out.push(lerp(B1, B2, t1, t2, t));
    }
  }
  return out;
}

/**
 * A pen's schedule for a set of strokes (px, relative to the pad's top-left): each stroke a dense spline traced with the
 * speed of handwriting (two-thirds power law, v ∝ curvature^-1/3, clamped; ramps at the ends), the strokes sharing inkSec
 * in proportion to their natural time; the pen travels up between strokes in liftSec. at(t) → {x, y, down}, t in s from
 * the first pen-down; total = last pen-up.
 */
function penPlan(strokesPx, { inkSec = 1.6, liftSec = 0.14, minStrokeSec = 0.08, curvePow = 1 / 3, kFloor = 1 / 120, kMax = 1 / 3 } = {}) {
  const strokes = strokesPx.map((pts) => {
    const path = catmullRom(pts);
    const n = path.length;
    const seg = [0];
    for (let i = 1; i < n; i++) seg.push(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const len = seg.reduce((a, b) => a + b, 0);
    const kappa = path.map((p, i) => {
      if (i === 0 || i === n - 1) return 0;
      const a1 = Math.atan2(p[1] - path[i - 1][1], p[0] - path[i - 1][0]);
      const a2 = Math.atan2(path[i + 1][1] - p[1], path[i + 1][0] - p[0]);
      let d = Math.abs(a2 - a1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      return d / Math.max(0.5, (seg[i] + seg[i + 1]) / 2);
    });
    let s = 0;
    const ramp = Math.min(len * 0.2, 40);
    let v = path.map((p, i) => {
      s += seg[i];
      const k = Math.min(kMax, kappa[i]); // radius ≥ 1/kMax px
      const base = Math.pow(k + kFloor, -curvePow); // speed ∝ curvature^-curvePow; kFloor caps the speed on straight runs
      const ends = Math.min(1, Math.min(s, len - s) / Math.max(1, ramp));
      return base * (0.35 + 0.65 * ease.pointer(ends));
    });
    v = v.map((_, i) => { // smooth the speed (a hand has inertia)
      let acc = 0, c = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) { acc += v[j]; c++; }
      return acc / c;
    });
    const time = [0];
    for (let i = 1; i < n; i++) time.push(time[i - 1] + seg[i] / ((v[i] + v[i - 1]) / 2));
    return { path, time, natural: time[n - 1] };
  });
  const natural = strokes.reduce((a, st) => a + st.natural, 0);
  const k = inkSec / Math.max(1e-6, natural);
  const spans = [];
  let at = 0;
  strokes.forEach((st, i) => {
    // a dot or a tick still takes a hand ~80 ms (and must outlast the 60 Hz sampling, or it is never drawn)
    const kk = Math.max(k, minStrokeSec / Math.max(1e-6, st.natural));
    st.time = st.time.map((x) => x * kk);
    spans.push({ start: at, end: at + st.time[st.time.length - 1] });
    at = spans[i].end + (i < strokes.length - 1 ? liftSec : 0);
  });
  const total = at;
  const posOn = (st, t) => {
    const T = st.time;
    if (t <= 0) return st.path[0];
    if (t >= T[T.length - 1]) return st.path[st.path.length - 1];
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - T[lo]) / Math.max(1e-9, T[hi] - T[lo]);
    return [st.path[lo][0] + (st.path[hi][0] - st.path[lo][0]) * f, st.path[lo][1] + (st.path[hi][1] - st.path[lo][1]) * f];
  };
  const at_ = (t) => {
    for (let i = 0; i < strokes.length; i++) {
      const sp = spans[i];
      if (t <= sp.end || i === strokes.length - 1) {
        if (t >= sp.start) { const p = posOn(strokes[i], t - sp.start); return { x: p[0], y: p[1], down: t <= sp.end }; }
        // lifted, travelling from the end of stroke i-1 to the start of stroke i (eased, a slight hop)
        const a = strokes[i - 1].path[strokes[i - 1].path.length - 1], b = strokes[i].path[0];
        const u = ease.pointer((t - spans[i - 1].end) / Math.max(1e-6, sp.start - spans[i - 1].end));
        return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u - Math.sin(Math.PI * u) * 6, down: false };
      }
    }
    return { x: 0, y: 0, down: false };
  };
  return { at: at_, total, spans, strokes: strokes.map((st) => st.path) };
}

/** The draw action's strokes in px relative to its box (fractions of the box unless units "px"). */
function drawStrokesPx(a, rect) {
  const px = a.units === 'px';
  return (a.strokes || []).map((st) => st.map(([x, y]) => (px ? [x, y] : [x * rect[2], y * rect[3]])));
}

/** Runs in the page: set an input / select / textarea value the way React listens for it (native setter + events). */
function fillValue(arg) {
  const { q, value } = arg;
  let list = Array.from(document.querySelectorAll(q.selector));
  if (q.contains) list = list.filter((el) => (el.textContent || '').toLowerCase().includes(String(q.contains).toLowerCase()));
  const el = list[q.nth || 0];
  if (!el) return false;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Runs in the page: element.click() (no pointer movement). */
function domClick(q) {
  let list = Array.from(document.querySelectorAll(q.selector));
  if (q.contains) list = list.filter((el) => (el.textContent || '').toLowerCase().includes(String(q.contains).toLowerCase()));
  const el = list[q.nth || 0];
  if (!el) return false;
  el.click();
  return true;
}

/** Runs in the page: the cursor the OS would show at a point ('p' hand over links/buttons, 't' I-beam in fields, 'a' arrow). */
function cursorKind(pt) {
  const el = document.elementFromPoint(pt.x, pt.y);
  if (!el) return 'a';
  const c = getComputedStyle(el).cursor;
  if (c === 'pointer') return 'p';
  if (c === 'text' || c === 'vertical-text') return 't';
  if (c === 'auto' && (el.isContentEditable || el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && /^(text|search|email|tel|url|password|number)$/.test(el.type || 'text')))) return 't';
  return 'a';
}

/** Small deterministic PRNG (mulberry32) so typing rhythm is identical every run. */
function prng(seedStr) {
  let a = parseInt(crypto.createHash('md5').update(seedStr).digest('hex').slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (k === 'var' && next !== undefined) {
        // --var NAME=VALUE (repeatable) → out.vars
        const eq = next.indexOf('=');
        if (eq <= 0) throw new Error(`--var expects NAME=VALUE, got "${next}"`);
        out.vars = Object.assign(out.vars || {}, { [next.slice(0, eq)]: next.slice(eq + 1) });
        i++;
      } else if (next === undefined || next.startsWith('--')) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function ffprobeFrames(file) {
  const r = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=nb_read_frames,width,height,r_frame_rate,pix_fmt,codec_name', '-of', 'json', file]).toString();
  const s = JSON.parse(r).streams[0];
  return { frames: Number(s.nb_read_frames), width: s.width, height: s.height, rate: s.r_frame_rate, pixFmt: s.pix_fmt, codec: s.codec_name };
}

/** Mean sRGB colour of the top or bottom 2 CSS px of every frame: [[r, g, b], …]. */
function edgeColours(mp4, edge, dsf = 1) {
  const rows = Math.max(2, Math.round(2 * dsf));
  const crop = edge === 'top' ? `crop=iw:${rows}:0:0` : `crop=iw:${rows}:0:ih-${rows}`;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', `${crop},scale=1:1:flags=area:in_color_matrix=bt709:in_range=tv,format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const out = [];
  for (let i = 0; i + 2 < raw.length; i += 3) out.push([raw[i], raw[i + 1], raw[i + 2]]);
  return out;
}

function encode(framesDir, outFile, { preset = 'medium' } = {}) {
  const args = ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, '%05d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', preset, '-crf', '12', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(FPS), '-movflags', '+faststart', outFile];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}

// ------------------------------------------------------------- page helpers

/**
 * Runs inside the page once per frame: applies this frame's scroll position,
 * then measures everything the cursor planner and the camera need.
 */
function pageFrame(arg) {
  const { scrollY, queries } = arg;
  if (scrollY !== null && scrollY !== undefined) window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
  const find = (q) => {
    let list = Array.from(document.querySelectorAll(q.selector));
    if (q.contains) {
      const needle = String(q.contains).toLowerCase();
      list = list.filter((el) => (el.textContent || '').toLowerCase().includes(needle));
    }
    return list[q.nth || 0] || null;
  };
  const rectOf = (q) => {
    const el = find(q);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (q.tight) {
      // Tight = the union of the glyph boxes of the element's text (block children otherwise span the full width).
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        range.selectNodeContents(n);
        for (const c of range.getClientRects()) {
          if (!c.width || !c.height) continue;
          l = Math.min(l, c.left); t = Math.min(t, c.top); rr = Math.max(rr, c.right); b = Math.max(b, c.bottom);
        }
      }
      if (l < rr && t < b) return [l, t, rr - l, b - t];
    }
    return [r.left, r.top, r.width, r.height];
  };
  const rects = {};
  for (const [k, q] of Object.entries(queries || {})) rects[k] = rectOf(q);
  return {
    scrollY: window.scrollY,
    maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    pageHeight: document.documentElement.scrollHeight,
    vt: performance.now(),
    rects,
  };
}

function pageReady(arg) {
  const { readySelector } = arg;
  if (location.protocol === 'about:') return false;
  if (document.readyState !== 'complete') return false;
  if (document.fonts && document.fonts.status !== 'loaded') return false;
  if (readySelector && !document.querySelector(readySelector)) return false;
  const imgs = Array.from(document.images).filter((im) => {
    const r = im.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0 && im.loading !== 'lazy';
  });
  return imgs.every((im) => im.complete);
}

// --------------------------------------------------------------- the capture

function normalizeShot(shot, sb = {}) {
  const s = JSON.parse(JSON.stringify(shot));
  s.viewport = Object.assign({ width: 1440, height: 900, deviceScaleFactor: 1 }, s.viewport || {});
  s.mobile = !!s.mobile;
  // No default key: a missing key would silently replay the site's intro loader mid-film on a new client.
  s.introKey = s.introKey || sb.introKey || null;
  s.clock = s.clock || sb.clock || null;
  s.timezone = s.timezone || sb.timezone || DEFAULT_TIMEZONE;
  // storyboard.captureCss (video-only brand fixes) goes into every shot, before the shot's own css. A storyboard that
  // already pasted it into the shot (the Discount example) is left exactly as it was.
  const shared = typeof sb.captureCss === 'string' ? sb.captureCss : (sb.captureCss && sb.captureCss.css) || '';
  const own = s.css || '';
  s.css = shared && !own.includes(shared) ? [shared, own].filter(Boolean).join(' ') : own;
  s.durationSec = Number(s.durationSec || 4);
  s.actions = (s.actions || []).map((a) => Object.assign({}, a)).sort((a, b) => a.t - b.t);
  const minT = Math.min(0, ...s.actions.map((a) => a.t));
  s.prerollSec = Math.max(Number(s.prerollSec || 0), -minT);
  const kind = (s.cursor && s.cursor.kind) || (s.mobile ? 'touch' : 'pointer');
  const start = (s.cursor && s.cursor.start) || (kind === 'pointer'
    ? { x: s.viewport.width + 80, y: s.viewport.height + 60 }
    : { x: s.viewport.width / 2, y: s.viewport.height * 0.7 });
  s.cursor = { kind, start };
  s.zooms = (s.zooms || []).map((z) => Object.assign({}, z));
  s.track = s.track || {};
  s.cookies = (s.cookies !== undefined ? s.cookies : sb.cookies || []).map((c) => Object.assign({}, c));
  s.vars = Object.assign({}, s.vars || {});
  return s;
}

/** Fills {NAME} in a shot url from vars; an unfilled name is an error (never capture the wrong page). */
function fillUrl(u, vars) {
  return String(u || '/').replace(/\{(\w+)\}/g, (m, name) => {
    if (vars[name] === undefined) throw new Error(`url needs --var ${name}=…: ${u}`);
    return encodeURI(String(vars[name]));
  });
}

/** The cursor.json an earlier capture wrote: the sibling folder of --out first, then the --publish folder. */
function previousCapture(id, opts) {
  const candidates = [path.resolve(opts.out, '..', id, 'cursor.json')];
  if (opts.publish) candidates.push(path.resolve(opts.publish, id, 'cursor.json'));
  const found = candidates.find((c) => fs.existsSync(c));
  return found ? JSON.parse(fs.readFileSync(found, 'utf8')) : null;
}

/**
 * Values that come from where an earlier capture's cursor ended (continuity across a cut):
 *   cursor.start.fromShot           start there (x/y = fallback when that capture does not exist yet)
 *   moveTo { fromShot, dx, dy }      go a few px from there, rounded (shot 4's set-up jiggle: { fromShot: "3-buy", dx: 6, dy: 2 })
 * The moveTo has no fallback: capture the shots in order. Mutates the normalized shot.
 */
function resolveFromShot(shot, opts) {
  const vw = shot.viewport.width, vh = shot.viewport.height;
  if (shot.cursor.start && shot.cursor.start.fromShot) {
    const id = shot.cursor.start.fromShot;
    const prev = previousCapture(id, opts);
    if (prev) {
      const last = prev.frames[prev.frames.length - 1];
      shot.cursor.start = { x: last.x, y: last.y };
    } else {
      console.warn(`[${shot.id}] cursor.start.fromShot: no capture of "${id}" found yet; using the fallback x/y`);
      shot.cursor.start = { x: shot.cursor.start.x ?? vw / 2, y: shot.cursor.start.y ?? vh / 2 };
    }
  }
  for (const a of shot.actions) {
    if (!a.fromShot || a.selector) continue;
    const prev = previousCapture(a.fromShot, opts);
    if (!prev) throw new Error(`[${shot.id}] the ${a.type} at t=${a.t} starts from where "${a.fromShot}" ended: capture "${a.fromShot}" first (shots go in order)`);
    const last = prev.frames[prev.frames.length - 1];
    a.x = Math.round(last.x + Number(a.dx || 0));
    a.y = Math.round(last.y + Number(a.dy || 0));
  }
  return shot;
}

/** Paths in a normalized shot that still hold a {{PLACEHOLDER}} or a non-number where a number belongs. */
function unfilled(node, at = '', out = []) {
  const DOC = new Set(['why', 'adapt', 'describe', 'notes', 'scene', 'frame', 'rest', 'override', 'cssWhy']);
  if (typeof node === 'string') { if (/\{\{[^{}]*\}\}/.test(node)) out.push(`${at || '(shot)'} "${node.slice(0, 60)}"`); }
  else if (typeof node === 'number') { if (!Number.isFinite(node)) out.push(`${at} ${node}`); }
  else if (Array.isArray(node)) node.forEach((x, i) => unfilled(x, `${at}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!DOC.has(k)) unfilled(v, at ? `${at}.${k}` : k, out);
  return out;
}

function queryOf(a) {
  return { selector: a.selector, contains: a.contains, nth: a.nth, tight: !!a.tight };
}

async function captureShot(rawShot, opts) {
  const pw = loadPlaywright();
  const shot = normalizeShot(rawShot, opts.storyboard || {});
  if (shot.presetIntroSeen && !shot.introKey) {
    throw new Error(`[${shot.id}] presetIntroSeen needs introKey (storyboard.introKey = the SEEN_KEY in the site's Loader.tsx)`);
  }
  if (opts.dsf) shot.viewport.deviceScaleFactor = Number(opts.dsf);
  // a shot may name its own origin (part B's desk on :5190 in a storyboard whose base is the site on :5183)
  const base = (shot.base || opts.base || DEFAULT_BASE).replace(/\/+$/, '');
  const shotUrl = fillUrl(shot.url, Object.assign({}, shot.vars, opts.vars || {}));
  const url = /^https?:/.test(shotUrl) ? shotUrl : base + shotUrl;
  const outDir = path.resolve(opts.out);
  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const vw = shot.viewport.width, vh = shot.viewport.height;
  resolveFromShot(shot, opts);
  const holes = unfilled(shot);
  if (holes.length) {
    throw new Error(`[${shot.id}] the storyboard still has unfilled placeholders: ${holes.join('; ')}. Fill them in client-inputs.json, or let measure-site.cjs --storyboard … --into client-inputs.json measure them, then refill the storyboard (fill-client.cjs storyboard).`);
  }
  const total = Math.round(shot.durationSec * FPS);
  const preroll = Math.round(shot.prerollSec * FPS);
  const rand = prng(shot.id || 'shot');
  const log = (...m) => opts.quiet || console.log(`[${shot.id}]`, ...m);

  // ---- plan: convert actions to frame-indexed work (frame index k is relative to frame 0; preroll frames are negative)
  const fr = (t) => Math.round(t * FPS);
  const plan = shot.actions.map((a, i) => Object.assign({ i, startFrame: fr(a.t) }, a));

  // Zoom regions + extra tracks → per-frame rect queries.
  const tracks = {};
  const zoomsOut = [];
  shot.zooms.forEach((z, i) => {
    const name = `zoom${i}`;
    let focus;
    if (typeof z.focus === 'string' && z.focus !== 'cursor') {
      tracks[name] = { selector: z.focus, contains: z.contains, nth: z.nth, tight: !!z.tight };
      focus = { track: name, anchor: z.anchor || [0.5, 0.5] };
    } else if (z.focus && typeof z.focus === 'object') focus = { point: [z.focus.x, z.focus.y] };
    else focus = { cursor: true };
    const depth = z.depth || ZOOM_LEVELS[(z.level || 3) - 1];
    const startFrame = fr(z.at);
    const inFrames = Math.round((z.inSec || ZOOM_IN_SEC) * FPS);
    const outFrames = Math.round((z.outSec || ZOOM_OUT_SEC) * FPS);
    const outFrame = z.until === null || z.until === undefined ? null : fr(z.until);
    zoomsOut.push({ startFrame, inFrames, outFrame, outFrames, depth, follow: z.follow !== undefined ? !!z.follow : !!focus.cursor, focus, sfx: z.sfx });
  });
  for (const [name, sel] of Object.entries(shot.track)) {
    tracks[name] = typeof sel === 'string' ? { selector: sel } : sel;
  }

  // ---- browser: headless shell in deterministic mode; the page target is created with BeginFrameControl, so a frame
  //      is rendered only when we ask for one (HeadlessExperimental.beginFrame) at an exact virtual frame time.
  //      (Plain Page.captureScreenshot under paused virtual time deadlocks intermittently: drawers, async image
  //      decodes, mouse input. BeginFrameControl is Chromium's own mechanism for deterministic rendering.)
  const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'capture-'));
  const errors = [];
  const context = await pw.chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: vw, height: vh },
    deviceScaleFactor: shot.viewport.deviceScaleFactor,
    isMobile: shot.mobile,
    hasTouch: shot.mobile,
    locale: 'en-US',
    timezoneId: shot.timezone,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    args: ['--deterministic-mode', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text',
      '--font-render-hinting=none', '--mute-audio', '--disable-background-timer-throttling',
      // Under BeginFrameControl the emulated DSF sets devicePixelRatio but not the size of the rendered surface;
      // this switch makes the surface (and so the PNG) DSF times larger. Both together = a true 2x render.
      `--force-device-scale-factor=${shot.viewport.deviceScaleFactor}`]
      .concat(process.env.CAPTURE_FLAGS ? process.env.CAPTURE_FLAGS.split(' ') : []),
  });
  try {
    if (shot.cookies.length) {
      // per-shot cookies (e.g. a session), set for the shot's origin before the page loads
      await context.addCookies(shot.cookies.map(({ name, value, domain, path: p, ...rest }) =>
        (domain ? { name, value, domain, path: p || '/', ...rest } : { name, value, url: new URL(url).origin + (p || '/'), ...rest })));
    }
    if (shot.presetIntroSeen) {
      await context.addInitScript((key) => {
        try { sessionStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
      }, shot.introKey);
    }
    if (shot.css) {
      await context.addInitScript((css) => {
        const add = () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); };
        if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
      }, shot.css);
    }
    const first = context.pages()[0] || (await context.newPage());
    const s0 = await context.newCDPSession(first);
    const pageEvent = context.waitForEvent('page');
    await s0.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true });
    const page = await pageEvent;
    await s0.detach().catch(() => {});
    await first.close().catch(() => {});
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const cdp = await context.newCDPSession(page);
    const dbg = process.env.CAPTURE_DEBUG ? (...a) => console.log('[debug]', ...a) : () => {};
    if (process.env.CAPTURE_DEBUG) {
      page.on('request', (r) => dbg('request', r.method(), r.url().slice(0, 140)));
      page.on('requestfinished', (r) => dbg('finished', r.url().slice(0, 140)));
      page.on('requestfailed', (r) => dbg('failed', r.url().slice(0, 140)));
    }

    // Virtual time: paused from the start, wall clock pinned to shot.clock.
    const policy = { policy: 'pause' };
    if (shot.clock) policy.initialVirtualTime = Date.parse(shot.clock) / 1000;
    const { virtualTimeTicksBase } = await cdp.send('Emulation.setVirtualTimePolicy', policy);
    let elapsedMs = 0; // virtual ms since virtual time started
    let budgetWaiter = null;
    cdp.on('Emulation.virtualTimeBudgetExpired', () => { if (budgetWaiter) { const f = budgetWaiter; budgetWaiter = null; f(); } });
    // Network watchdog. Time normally stops while anything is downloading (no half-loaded images). A response the page
    // holds open (a Next.js server action's streamed redirect, read by code that waits on timers) would then freeze
    // virtual time for good: when a budget has not expired after NET_STALL_MS of real time, time runs on regardless
    // ('advance') until the requests in flight have drained. Recorded in cursor.json `stalls` (why "network: …").
    const NET_STALL_MS = 4000;
    const pendingReq = new Map();
    page.on('request', (r) => pendingReq.set(r, Date.now()));
    page.on('requestfinished', (r) => pendingReq.delete(r));
    page.on('requestfailed', (r) => pendingReq.delete(r));
    let netStall = false;
    let loopFrame = null;
    const advance = (ms) => new Promise((resolve, reject) => {
      let timer = null;
      budgetWaiter = () => { if (timer) clearTimeout(timer); resolve(); };
      elapsedMs += ms;
      if (netStall && pendingReq.size === 0) netStall = false;
      cdp.send('Emulation.setVirtualTimePolicy', { policy: netStall ? 'advance' : 'pauseIfNetworkFetchesPending', budget: ms }).catch(reject);
      if (!netStall) {
        timer = setTimeout(() => {
          if (!budgetWaiter) return;
          netStall = true;
          stalls.push({ frame: loopFrame, why: `network: ${[...pendingReq.keys()].map((r) => `${r.method()} ${r.url().slice(0, 100)}`).join(', ') || 'none in flight'}` });
          cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms }).catch(reject);
        }, NET_STALL_MS);
      }
    });
    // Render one frame at the current virtual time; with `png` the frame comes back as a screenshot.
    let lastFrameTicks = 0;
    const beginFrame = (png) => {
      const frameTimeTicks = Math.max(virtualTimeTicksBase + elapsedMs, lastFrameTicks + 0.001);
      lastFrameTicks = frameTimeTicks;
      const args = { frameTimeTicks, interval: 1000 / FPS, noDisplayUpdates: false };
      if (png) args.screenshot = { format: 'png', optimizeForSpeed: true };
      return cdp.send('HeadlessExperimental.beginFrame', args);
    };
    // Nudge: 1 ms of virtual time and a frame, for the rare case where the page waits on time (a navigation) or on a
    // frame (an input ack). Frames sit on a fixed grid (see frameBudget), so nudges never shift the frame times.
    const stalls = [];
    const nudge = async (why, frame) => {
      stalls.push({ frame, why });
      await advance(1);
      await beginFrame(false);
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitOrNudge = async (promise, why, frame, waitMs = 1500, tries = 400) => {
      for (let i = 0; i < tries; i++) {
        const r = await Promise.race([promise.then((v) => ({ v }), (e) => ({ e })), sleep(waitMs).then(() => null)]);
        if (r && 'e' in r) throw r.e;
        if (r) return r.v;
        if (i === 3 || i % 50 === 49) dbg(`waiting on ${why} at frame ${frame} (${i + 1} nudges)`);
        await nudge(why, frame);
      }
      throw new Error(`${why} never returned`);
    };
    const evalSafe = (fn, arg, frame = null, waitMs = 1500) => waitOrNudge(page.evaluate(fn, arg), 'evaluate', frame, waitMs);

    cdp.send('Page.navigate', { url }).catch((e) => errors.push('navigate: ' + e.message));

    // ---- warm-up: run virtual time in small steps until the page has loaded, fonts are in and the ready selector exists.
    for (let i = 0; i < 600; i++) {
      await advance(5);
      await beginFrame(false);
      let ok = false;
      try {
        ok = await evalSafe(pageReady, { readySelector: shot.readySelector || null }, 'warmup', 200);
      } catch (e) { dbg('ready eval error', e.message); ok = false; }
      if (ok) break;
    }
    const warmMs = elapsedMs;
    stalls.length = 0;
    log(`page ready after ${warmMs.toFixed(0)} ms of virtual time`);
    // Frame k (k = -preroll … total-1) shows virtual time gridBase + (k + preroll + 1) / FPS exactly.
    let gridBase = elapsedMs; // moved on only by a draw's timeScale (page time running faster than the film)
    const frameBudget = (k) => {
      const end = gridBase + Math.round(((k + preroll + 1) * 1e6) / FPS) / 1000;
      return Math.max(0.001, Math.round((end - elapsedMs) * 1000) / 1000);
    };

    // ---- per-frame state
    let cur = { x: shot.cursor.start.x, y: shot.cursor.start.y };
    let move = null; // active pointer travel
    let scroll = null; // active eased scroll
    let touch = null; // active finger
    let pressUntil = -Infinity;
    const keyQueue = []; // [{frame, char|key}]
    const frames = [];
    const events = [];
    const trackRects = Object.fromEntries(Object.keys(tracks).map((k) => [k, []]));
    let lastMouse = null;
    let pageHeight = 0;
    let maxScroll = 0;
    let lastScrollY = 0;
    let lastRects = {};
    const pendingWrites = new Set();
    const t0 = Date.now();
    const inflight = [];
    let buttons = 0;
    // Typing hides the macOS pointer until the mouse moves again; remember whether the preroll ended that way.
    let typedSinceMove = false;
    const mouse = (type, pos) => {
      if (type === 'mouseMoved') typedSinceMove = false;
      if (type === 'mousePressed') buttons = 1;
      const p = { type, x: pos.x, y: pos.y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 };
      if (type === 'mouseReleased') buttons = 0;
      inflight.push(cdp.send('Input.dispatchMouseEvent', p));
    };
    const KEYS = { Enter: [13, '\r'], Escape: [27, ''], Tab: [9, ''], Backspace: [8, ''], ArrowDown: [40, ''], ArrowUp: [38, ''] };
    // Characters whose virtual key is not their char code ('.' would be 46 = VK_DELETE); [vk, code, shift]
    const CHAR_KEYS = { '.': [190, 'Period'], ',': [188, 'Comma'], '/': [191, 'Slash'], '@': [50, 'Digit2', true], '_': [189, 'Minus', true], "'": [222, 'Quote'] };
    const key = (k, isChar) => {
      if (isChar && CHAR_KEYS[k]) {
        const [vk, code, shift] = CHAR_KEYS[k];
        const modifiers = shift ? 8 : 0;
        inflight.push(cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, unmodifiedText: k, windowsVirtualKeyCode: vk, modifiers }));
        inflight.push(cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }));
      } else if (isChar) {
        const code = k >= '0' && k <= '9' ? `Digit${k}` : /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : k === '-' ? 'Minus' : k === ' ' ? 'Space' : '';
        const vk = /[a-z]/i.test(k) ? k.toUpperCase().charCodeAt(0) : k === '-' ? 189 : k.charCodeAt(0);
        inflight.push(cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, unmodifiedText: k, windowsVirtualKeyCode: vk }));
        inflight.push(cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }));
      } else {
        const [vk, text] = KEYS[k] || [0, ''];
        inflight.push(cdp.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code: k, text: text || undefined, windowsVirtualKeyCode: vk }));
        inflight.push(cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk }));
      }
    };
    const settleInput = async (frame) => {
      if (!inflight.length) return;
      await waitOrNudge(Promise.all(inflight.splice(0)), 'input', frame);
    };
    let lastPng = null;
    let hiddenAtStart = false;

    const inViewport = (p) => p.x >= 0 && p.y >= 0 && p.x < vw && p.y < vh;
    const targetPoint = (a, rects) => {
      if (a.to === 'start') return { x: shot.cursor.start.x, y: shot.cursor.start.y };
      if (a.selector) {
        const r = rects[`a${a.i}`];
        if (!r) throw new Error(`selector not found at t=${a.t}: ${a.selector}${a.contains ? ` (contains "${a.contains}")` : ''}`);
        const [fx, fy] = a.anchor || [0.5, 0.5];
        return { x: r[0] + r[2] * fx, y: r[1] + r[3] * fy };
      }
      return { x: a.x, y: a.y };
    };

    // ---- pen (draw action): the pointer follows penPlan, sampled subSteps times per frame
    let pen = null;
    const penSample = (tau) => {
      const r = pen.rect;
      const first = pen.plan.strokes[0][0];
      if (tau < pen.approach) {
        const T = { x: r[0] + first[0], y: r[1] + first[1] };
        const u = ease.pointer(clamp(tau / pen.approach, 0, 1));
        return { x: pen.from.x + (T.x - pen.from.x) * u, y: pen.from.y + (T.y - pen.from.y) * u, down: false };
      }
      const t = tau - pen.approach;
      const s = pen.plan.at(Math.min(t, pen.plan.total));
      return { x: r[0] + s.x, y: r[1] + s.y, down: s.down && t <= pen.plan.total };
    };
    const penInput = (s, k) => {
      const pos = { x: round1(s.x), y: round1(s.y) };
      const moved = !lastMouse || lastMouse.x !== pos.x || lastMouse.y !== pos.y;
      if (s.down && !pen.isDown) {
        if (moved) mouse('mouseMoved', pos);
        mouse('mousePressed', pos);
        pen.isDown = true;
        pen.marks.push([k, null]);
      } else if (!s.down && pen.isDown) {
        if (moved) mouse('mouseMoved', pos);
        mouse('mouseReleased', pos);
        pen.isDown = false;
        pen.marks[pen.marks.length - 1][1] = k;
      } else if (moved) mouse('mouseMoved', pos);
      lastMouse = pos;
    };

    for (let k = -preroll; k < total; k++) {
      const capturing = k >= 0;
      loopFrame = k;
      // 1. Start actions due at this frame (set-up actions run at -preroll + their offset).
      const due = plan.filter((a) => a.startFrame === k || (k === -preroll && a.startFrame < -preroll));
      // Queries this frame needs: active pointer target, new scroll target, tracks.
      const queries = {};
      for (const [name, q] of Object.entries(tracks)) queries[name] = q;
      const pointerTypes = new Set(['moveTo', 'hover', 'click', 'hold']);
      for (const a of due) if (a.selector && (pointerTypes.has(a.type) || a.type === 'scrollTo' || a.type === 'draw')) queries[`a${a.i}`] = queryOf(a);
      if (move && move.a.selector) queries[`a${move.a.i}`] = queryOf(move.a);
      if (pen && pen.a.selector) queries[`a${pen.a.i}`] = queryOf(pen.a);

      // Measure first (scroll targets need the current layout), then apply this frame's scroll.
      let m = await evalSafe(pageFrame, { scrollY: null, queries }, k);
      pageHeight = m.pageHeight;
      maxScroll = m.maxScroll;

      for (const a of due) {
        if (a.type === 'scrollTo' || a.type === 'scrollBy') {
          let to;
          if (a.type === 'scrollBy') to = m.scrollY + Number(a.y || 0);
          else if (a.selector) {
            const r = m.rects[`a${a.i}`];
            if (!r) throw new Error(`scroll target not found: ${a.selector}`);
            const top = r[1] + m.scrollY;
            const align = a.align || 'start';
            if (align === 'center') to = top + r[3] / 2 - vh / 2;
            else if (align === 'end') to = top + r[3] - vh;
            else to = top;
            to -= Number(a.offset || 0);
          } else to = Number(a.y || 0);
          to = clamp(Math.round(to), 0, m.maxScroll);
          const dist = Math.abs(to - m.scrollY);
          const swipe = shot.cursor.kind === 'touch' || !!a.touch;
          if (swipe) {
            // finger drags the page 1:1, releases, the page coasts (swipeProfile)
            const dragFrames = Math.max(3, Math.round((a.dragSec || SWIPE.dragSec) * FPS));
            const tauFrames = (a.tauSec || SWIPE.tauSec) * FPS;
            const n = a.durationSec !== undefined ? Math.max(dragFrames + 2, Math.round(a.durationSec * FPS)) : dragFrames + Math.round(SWIPE.tailTau * tauFrames);
            const tp = a.touch || { x: vw * 0.6, y: vh * 0.72 };
            scroll = { from: m.scrollY, to, start: k, end: k + n, profile: swipeProfile(n, dragFrames, tauFrames) };
            touch = { from: { x: tp.x, y: tp.y }, scrollFrom: m.scrollY, start: k, end: k + dragFrames };
            if (capturing) events.push({ frame: k, endFrame: scroll.end, type: 'scroll', fromY: Math.round(m.scrollY), toY: to, cursor: a.cursor || 'hide' });
            if (capturing) events.push({ frame: k, endFrame: touch.end, type: 'touch', x: tp.x, y: tp.y });
          } else {
            const dur = a.durationSec !== undefined ? a.durationSec : clamp(0.8 + dist / 2600, 0.8, 2.4);
            scroll = { from: m.scrollY, to, start: k, end: k + Math.max(1, Math.round(dur * FPS)) };
            if (capturing) events.push({ frame: k, endFrame: scroll.end, type: 'scroll', fromY: Math.round(m.scrollY), toY: to, cursor: a.cursor || 'hide' });
          }
        } else if (pointerTypes.has(a.type)) {
          const T = targetPoint(a, m.rects);
          const dist = Math.hypot(T.x - cur.x, T.y - cur.y);
          const dur = a.durationSec !== undefined ? a.durationSec : clamp(0.55 + dist / 1600, 0.6, 1.3);
          const frames_ = Math.max(1, Math.round(dur * FPS));
          const side = (T.x - cur.x) * (T.y - cur.y) >= 0 ? 1 : -1;
          move = { a, from: { ...cur }, start: k, end: k + frames_, side, bow: a.bow !== undefined ? a.bow : 0.12 };
          if (shot.cursor.kind === 'touch' && a.type === 'click') move.end = k; // a finger does not travel
        } else if (a.type === 'type') {
          const text = String(a.text || '');
          const per = a.durationSec ? a.durationSec / Math.max(1, text.length) : a.perCharSec || 0.12;
          let f = k;
          for (let i = 0; i < text.length; i++) {
            keyQueue.push({ frame: f, char: text[i] });
            const jitter = a.durationSec ? 0 : (rand() - 0.5) * 0.5 * per;
            f += Math.max(1, Math.round((per + jitter) * FPS));
          }
        } else if (a.type === 'press') {
          keyQueue.push({ frame: k, key: a.key });
        } else if (a.type === 'draw') {
          const rect = a.selector ? m.rects[`a${a.i}`] : [Number(a.x || 0), Number(a.y || 0), 1, 1];
          if (!rect) throw new Error(`draw target not found at t=${a.t}: ${a.selector}`);
          if (shot.cursor.kind !== 'pointer') throw new Error('draw needs a pointer cursor');
          const plan_ = penPlan(drawStrokesPx(a, rect), { inkSec: a.inkSec ?? a.durationSec ?? 1.6, liftSec: a.liftSec ?? 0.14 });
          move = null;
          pen = { a, start: k, from: { ...cur }, approach: a.approachSec ?? 0.5, plan: plan_, rect, isDown: false, marks: [], sub: Math.max(1, Math.round(a.subSteps || 2)), timeScale: Math.max(1, Math.round(a.timeScale || 1)) };
        } else if (a.type === 'fill') {
          if (!(await evalSafe(fillValue, { q: queryOf(a), value: a.value }, k))) throw new Error(`fill target not found at t=${a.t}: ${a.selector}`);
        } else if (a.type === 'domClick') {
          if (!(await evalSafe(domClick, queryOf(a), k))) throw new Error(`domClick target not found at t=${a.t}: ${a.selector}${a.contains ? ` (contains "${a.contains}")` : ''}`);
        } else if (a.type === 'eval') {
          await waitOrNudge(page.evaluate(String(a.js)), 'evaluate', k);
        }
      }

      // 2. Apply eased scroll for this frame.
      let wantScroll = null;
      if (scroll) {
        const p = clamp((k - scroll.start) / (scroll.end - scroll.start), 0, 1);
        const frac = scroll.profile ? (k <= scroll.start ? 0 : scroll.profile[Math.min(scroll.profile.length - 1, k - scroll.start - 1)]) : ease.scroll(p);
        wantScroll = scroll.from + (scroll.to - scroll.from) * frac;
        if (p >= 1) scroll = null;
      }
      if (wantScroll !== null || (move && move.a.selector) || pen) {
        m = await evalSafe(pageFrame, { scrollY: wantScroll, queries }, k);
      }
      if (pen && pen.a.selector && m.rects[`a${pen.a.i}`]) pen.rect = m.rects[`a${pen.a.i}`];
      lastScrollY = m.scrollY;
      lastRects = m.rects;

      // 3. Cursor position for this frame (eased, bowed curve toward a target that may move with the page).
      let arrived = null;
      if (move) {
        const T = targetPoint(move.a, m.rects);
        const span = Math.max(1, move.end - move.start);
        const p = clamp((k - move.start) / span, 0, 1);
        const u = ease.pointer(p);
        const dx = T.x - move.from.x, dy = T.y - move.from.y;
        const dist = Math.hypot(dx, dy);
        const bow = Math.min(dist * move.bow, 90) * move.side;
        const nx = dist ? -dy / dist : 0, ny = dist ? dx / dist : 0;
        const C = { x: (move.from.x + T.x) / 2 + nx * bow, y: (move.from.y + T.y) / 2 + ny * bow };
        cur = {
          x: (1 - u) * (1 - u) * move.from.x + 2 * (1 - u) * u * C.x + u * u * T.x,
          y: (1 - u) * (1 - u) * move.from.y + 2 * (1 - u) * u * C.y + u * u * T.y,
        };
        if (p >= 1) {
          cur = { x: T.x, y: T.y };
          arrived = move.a;
          move = null;
        }
      }
      let penNow = null;
      if (pen) {
        penNow = penSample((k - pen.start) / FPS);
        cur = { x: penNow.x, y: penNow.y };
      }
      let down = false;
      if (touch) {
        // the finger stays on the content it grabbed: it moves exactly as far as the page has scrolled
        const p = clamp((k - touch.start) / Math.max(1, touch.end - touch.start), 0, 1);
        cur = { x: touch.from.x + 6 * ease.touch(p), y: touch.from.y - (lastScrollY - touch.scrollFrom) };
        down = p < 1;
        if (p >= 1) touch = null;
      }

      // The pointer's shape (hand over links, I-beam in fields), as the OS would draw it at this position. Measured
      // before this frame's input is queued (an evaluate never waits on a frame, input acks do).
      const kind = capturing && shot.cursor.kind === 'pointer' && inViewport(cur) ? await evalSafe(cursorKind, { x: cur.x, y: cur.y }, k) : 'a';

      // 4. Real input: move the mouse, press, type. Mouse moves are rAF-aligned in Chromium (delivered in the next
      //    rendered frame), so input is queued now and its acks collected after this frame is rendered; CDP keeps
      //    message order. Discrete events (press, keys) are handled at once and their effects land in this frame.
      let subAdvanced = 0;
      if (pen) {
        // Sub-frame pen samples: each one is dispatched and rendered (uncaptured) at its own virtual time, so the pad
        // sees pointer moves at subSteps × 30 Hz (moves are coalesced per rendered frame).
        if (k > pen.start) {
          // timeScale > 1: the page lives timeScale frames of time per film frame while the pen moves (a pad that
          // throttles pointer moves to one per 16 ms then still gets subSteps × timeScale points per film frame)
          const n = pen.sub * pen.timeScale;
          if (pen.timeScale > 1) gridBase += ((pen.timeScale - 1) * 1000) / FPS;
          const subMs = Math.round((1e6 / FPS) / pen.sub) / 1000;
          for (let j = 1; j < n; j++) {
            penInput(penSample((k - 1 - pen.start + j / n) / FPS), k);
            await advance(subMs);
            subAdvanced += subMs;
            await waitOrNudge(beginFrame(false), 'frame', k, 20000);
            await settleInput(k);
          }
        }
        penInput(penNow, k);
        down = pen.isDown;
      } else if (shot.cursor.kind === 'pointer' && inViewport(cur)) {
        const pos = { x: round1(cur.x), y: round1(cur.y) };
        if (!lastMouse || lastMouse.x !== pos.x || lastMouse.y !== pos.y) {
          mouse('mouseMoved', pos);
          lastMouse = pos;
        }
      }
      if (pen && (k - pen.start) / FPS > pen.approach + pen.plan.total) {
        // the last stroke has lifted: the draw is over
        if (k >= 0) events.push({ frame: Math.max(0, pen.start), endFrame: k, type: 'draw', strokes: pen.marks.map(([a, b]) => [a, b === null ? k : b]) });
        pen = null;
      }
      if (arrived && arrived.type === 'hold') {
        if (shot.cursor.kind !== 'pointer') throw new Error('hold needs a pointer cursor');
        const pos = { x: round1(cur.x), y: round1(cur.y) };
        if (!lastMouse || lastMouse.x !== pos.x || lastMouse.y !== pos.y) mouse('mouseMoved', pos);
        mouse('mousePressed', pos);
        lastMouse = pos;
        pressUntil = k + Math.max(1, Math.round(Number(arrived.holdSec ?? 2.4) * FPS));
        if (capturing) events.push({ frame: k, endFrame: pressUntil, type: 'hold', x: pos.x, y: pos.y });
      }
      if (arrived && arrived.type === 'click') {
        if (shot.cursor.kind === 'touch') {
          const tp = { x: round1(cur.x), y: round1(cur.y) };
          inflight.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] }));
          inflight.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
          if (capturing) events.push({ frame: k, type: 'tap', x: tp.x, y: tp.y });
          pressUntil = k + 4;
        } else {
          const pos = { x: round1(cur.x), y: round1(cur.y) };
          if (!lastMouse || lastMouse.x !== pos.x || lastMouse.y !== pos.y) mouse('mouseMoved', pos);
          mouse('mousePressed', pos);
          lastMouse = pos;
          pressUntil = k + 3;
          if (capturing) events.push({ frame: k, type: 'click', x: pos.x, y: pos.y });
        }
      }
      if (k === pressUntil && shot.cursor.kind === 'pointer') mouse('mouseReleased', lastMouse || { x: round1(cur.x), y: round1(cur.y) });
      if (k < pressUntil || (k === pressUntil && shot.cursor.kind === 'touch')) down = true;
      for (const kq of keyQueue.filter((q) => q.frame === k)) {
        typedSinceMove = true;
        if (kq.char !== undefined) {
          key(kq.char, true);
          if (capturing) events.push({ frame: k, type: 'type', char: kq.char });
        } else {
          key(kq.key, false);
          if (capturing) events.push({ frame: k, type: 'key', key: kq.key });
        }
      }

      // 5. Advance virtual time to this frame's slot on the 1/30 s grid, render it, then collect input acks.
      if (k === 0) hiddenAtStart = typedSinceMove;
      const budget = frameBudget(k);
      const vtFrame = m.vt + subAdvanced + budget; // performance.now() at the moment this frame renders
      await advance(budget);
      const r = await waitOrNudge(beginFrame(capturing), 'frame', k, 20000);
      await settleInput(k);
      if (!capturing) continue;
      let png = r.screenshotData ? Buffer.from(r.screenshotData, 'base64') : lastPng; // no damage → same picture
      if (!png) {
        // Nothing drawn yet: render one more frame at the same slot (cannot happen after a normal warm-up).
        const again = await beginFrame(true);
        if (!again.screenshotData) throw new Error(`frame ${k}: Chromium returned no picture`);
        png = Buffer.from(again.screenshotData, 'base64');
      }
      lastPng = png;
      const file = path.join(framesDir, String(k).padStart(5, '0') + '.png');
      const w = fs.promises.writeFile(file, png);
      pendingWrites.add(w);
      w.finally(() => pendingWrites.delete(w));
      if (pendingWrites.size > 6) await Promise.race(pendingWrites);

      frames.push({ x: round1(cur.x), y: round1(cur.y), down, scrollY: round1(lastScrollY), vt: Math.round(vtFrame * 1000) / 1000, c: kind });
      for (const name of Object.keys(tracks)) {
        const r = lastRects[name];
        trackRects[name].push(r ? r.map(round1) : null);
      }
      if (k % 30 === 29 || k === total - 1) {
        const el = (Date.now() - t0) / 1000;
        log(`frame ${k + 1}/${total}  (${(el / (k + 1 + preroll * 0.1)).toFixed(2)} s/frame)`);
      }
    }
    await Promise.all(pendingWrites);

    // Zoom focus tracks → per-frame focus points (viewport CSS px).
    for (const z of zoomsOut) {
      if (z.focus.track) {
        const rects = trackRects[z.focus.track];
        const [fx, fy] = z.focus.anchor;
        z.focus.points = rects.map((r) => (r ? [round1(r[0] + r[2] * fx), round1(r[1] + r[3] * fy)] : null));
      }
    }

    const data = {
      version: 1,
      id: shot.id,
      url,
      fps: FPS,
      frameCount: total,
      viewport: shot.viewport,
      mobile: shot.mobile,
      pageHeight,
      maxScroll,
      warmupMs: Math.round(warmMs),
      stalls,
      prerollSec: shot.prerollSec,
      clock: shot.clock,
      // hiddenAtStart: the preroll ended with typing, so the OS pointer is hidden until the mouse next moves
      cursor: { kind: shot.cursor.kind, hiddenAtStart },
      frames,
      events,
      zooms: zoomsOut,
      tracks: Object.fromEntries(Object.keys(shot.track).map((k) => [k, trackRects[k]])),
      errors,
    };
    fs.writeFileSync(path.join(outDir, 'cursor.json'), JSON.stringify(data));
    log(`captured ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s` + (errors.length ? `; page errors: ${errors.length}` : ''));
    return data;
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function runShot(shot, opts) {
  const data = await captureShot(shot, opts);
  const outDir = path.resolve(opts.out);
  const mp4 = path.join(outDir, 'shot.mp4');
  if (opts['no-encode']) return { data };
  encode(path.join(outDir, 'frames'), mp4, { preset: opts.preset });
  const probe = ffprobeFrames(mp4);
  if (probe.frames !== data.frameCount) throw new Error(`encoded ${probe.frames} frames, expected ${data.frameCount}`);
  data.video = { file: 'shot.mp4', width: probe.width, height: probe.height };
  // Phone shots: the page's colour along the top and bottom edge per frame, so the composition can tint the iOS status
  // bar like Safari does and pick black or white for the home indicator.
  if (data.mobile) data.screenEdges = { top: edgeColours(mp4, 'top', data.viewport.deviceScaleFactor), bottom: edgeColours(mp4, 'bottom', data.viewport.deviceScaleFactor) };
  fs.writeFileSync(path.join(outDir, 'cursor.json'), JSON.stringify(data));
  console.log(`[${data.id}] shot.mp4 ${probe.width}x${probe.height} ${probe.frames} frames @ ${probe.rate} ${probe.pixFmt}`);
  if (opts.clean) fs.rmSync(path.join(outDir, 'frames'), { recursive: true, force: true });
  if (opts.publish) {
    const dest = path.resolve(opts.publish, data.id);
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(mp4, path.join(dest, 'shot.mp4'));
    fs.copyFileSync(path.join(outDir, 'cursor.json'), path.join(dest, 'cursor.json'));
    console.log(`[${data.id}] published to ${dest}`);
  }
  return { data, probe, mp4 };
}

// ---------------------------------------------------------------- self-test

/** Per-frame luma range from the encoded MP4: a blank (flat) frame has YMAX ≈ YMIN. */
function lumaRanges(mp4) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const txt = r.stdout.toString();
  const out = [];
  let cur = {};
  for (const line of txt.split('\n')) {
    const mm = line.match(/lavfi\.signalstats\.(YMIN|YMAX|YAVG)=([\d.]+)/);
    if (mm) cur[mm[1]] = Number(mm[2]);
    if (line.startsWith('frame:')) {
      if (cur.YMAX !== undefined) out.push(cur);
      cur = {};
    }
  }
  if (cur.YMAX !== undefined) out.push(cur);
  return out;
}

/** Per-frame PSNR (dB) between two PNG sequences; Infinity = identical. */
function framePsnr(dirA, dirB) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-framerate', String(FPS), '-i', path.join(dirA, '%05d.png'), '-framerate', String(FPS), '-i', path.join(dirB, '%05d.png'),
    '-lavfi', 'psnr=stats_file=-', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 });
  return r.stdout.toString().split('\n').filter((l) => l.includes('psnr_avg')).map((l) => {
    const m = l.match(/psnr_avg:(\S+)/);
    return m[1] === 'inf' ? Infinity : Number(m[1]);
  });
}

function hashFrames(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
    .map((f) => crypto.createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex'));
}

async function selftest(opts) {
  const base = opts.base || DEFAULT_BASE;
  const outRoot = path.resolve(opts.out || path.join(process.cwd(), 'capture-selftest'));
  const dsfs = String(opts.dsf || '1,2').split(',').map(Number);
  const shot = {
    id: 'selftest-hero',
    url: '/',
    durationSec: 4,
    presetIntroSeen: false,
    clock: typeof opts.clock === 'string' ? opts.clock : DEFAULT_SELFTEST_CLOCK,
    readySelector: '.loader',
    cursor: { kind: 'pointer', start: { x: 1520, y: 980 } },
    actions: [
      { t: 0.6, type: 'moveTo', x: 1010, y: 640, durationSec: 1.4 },
      { t: 2.3, type: 'hover', selector: '.hero__title', tight: true, anchor: [0.5, 0.8], durationSec: 1.0 },
    ],
    zooms: [{ at: 2.4, until: 3.6, depth: 1.5, focus: '.hero__title', tight: true }],
  };
  const report = { base, runs: [] };
  let pass = true;
  const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) pass = false; };

  for (const dsf of dsfs) {
    const out = path.join(outRoot, `dsf${dsf}`);
    const t0 = Date.now();
    const { data, probe, mp4 } = await runShot(Object.assign({}, shot, { viewport: { width: 1440, height: 900, deviceScaleFactor: dsf } }), { base, out, preset: 'fast', quiet: true });
    const secs = (Date.now() - t0) / 1000;
    const expected = 4 * FPS;
    check(probe.frames === expected, `DSF ${dsf}: ffprobe counted ${probe.frames} frames (expected exactly ${expected}), ${probe.width}x${probe.height}, ${probe.rate} fps`);
    const dts = data.frames.slice(1).map((f, i) => f.vt - data.frames[i].vt);
    const maxDt = Math.max(...dts.map((d) => Math.abs(d - 1000 / FPS)));
    const span = data.frames[data.frames.length - 1].vt - data.frames[0].vt;
    // performance.now() is coarsened to 100 µs in pages, so single deltas wobble by ≤ 0.1 ms; the span must be exact.
    check(maxDt < 0.25 && Math.abs(span - ((expected - 1) * 1000) / FPS) < 0.25,
      `DSF ${dsf}: page clock advances 33.333 ms per frame (each delta within ${maxDt.toFixed(3)} ms of 1000/30, 119 frames span ${span.toFixed(2)} ms vs ${(((expected - 1) * 1000) / FPS).toFixed(2)})`);
    // Smooth = the per-frame speed never spikes against its neighbours (a teleport is a spike) and never exceeds
    // what a hand does (≤ 2.2× the mean speed of that move, i.e. a bell-shaped profile).
    const jumps = data.frames.slice(1).map((f, i) => Math.hypot(f.x - data.frames[i].x, f.y - data.frames[i].y));
    const spikes = jumps.map((j, i) => (i === 0 || i === jumps.length - 1 ? 0 : j - Math.max(jumps[i - 1], jumps[i + 1])));
    const worstSpike = Math.max(...spikes);
    const moves = shot.actions.map((a) => {
      const s0 = Math.round(a.t * FPS), n = Math.round(a.durationSec * FPS);
      const seg = jumps.slice(s0, s0 + n + 1);
      const dist = Math.hypot(data.frames[s0 + n].x - data.frames[s0].x, data.frames[s0 + n].y - data.frames[s0].y);
      return { peak: Math.max(...seg), mean: dist / n, dist };
    });
    const ratio = Math.max(...moves.map((m) => m.peak / m.mean));
    check(worstSpike <= 1 && ratio <= 2.2 && Math.max(...jumps) < 120,
      `DSF ${dsf}: cursor path is a smooth eased curve, no teleports (moves ${moves.map((m) => `${m.dist.toFixed(0)} px`).join(' + ')}, peak speed ${ratio.toFixed(2)}× mean, max ${Math.max(...jumps).toFixed(1)} px/frame, speed never spikes above its neighbours: ${worstSpike.toFixed(2)} px)`);
    const ranges = lumaRanges(mp4);
    const flat = ranges.map((r, i) => [i, r.YMAX - r.YMIN]).filter(([, d]) => d < 12);
    check(ranges.length === expected && flat.length === 0, `DSF ${dsf}: no blank frames (${ranges.length} frames measured, min luma range ${Math.min(...ranges.map((r) => r.YMAX - r.YMIN))})`);
    const checks = [0.4, 1.4, 2.9, 3.9].map((t) => {
      const png = path.join(out, `check_${t.toFixed(1)}s.png`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', png]);
      return png;
    });
    const loaderFrames = ranges.slice(0, 60).filter((r) => r.YAVG < 40).length;
    const heroFrames = ranges.slice(105).filter((r) => r.YAVG >= 40).length;
    check(loaderFrames >= 45, `DSF ${dsf}: loader (dark frame) visible early: ${loaderFrames}/60 of the first 2 s`);
    check(heroFrames === ranges.slice(105).length, `DSF ${dsf}: hero photo visible at the end: ${heroFrames}/${ranges.slice(105).length} of the last 0.5 s`);
    report.runs.push({ dsf, seconds: secs, secPerFrame: secs / expected, probe, mp4, checks, mp4Bytes: fs.statSync(mp4).size });

    if (dsf === dsfs[0]) {
      // Determinism: capture the same shot again and compare every frame byte for byte.
      const out2 = path.join(outRoot, `dsf${dsf}-repeat`);
      await captureShot(Object.assign({}, shot, { viewport: { width: 1440, height: 900, deviceScaleFactor: dsf } }), { base, out: out2, quiet: true });
      const h1 = hashFrames(path.join(out, 'frames'));
      const h2 = hashFrames(path.join(out2, 'frames'));
      const same = h1.filter((h, i) => h === h2[i]).length;
      const psnr = framePsnr(path.join(out, 'frames'), path.join(out2, 'frames'));
      const minPsnr = Math.min(...psnr);
      const c1 = JSON.parse(fs.readFileSync(path.join(out, 'cursor.json')));
      const c2 = JSON.parse(fs.readFileSync(path.join(out2, 'cursor.json')));
      const cursorDev = Math.max(...c1.frames.map((f, i) => Math.hypot(f.x - c2.frames[i].x, f.y - c2.frames[i].y)));
      check(h1.length === h2.length && minPsnr >= 50,
        `DSF ${dsf}: repeat capture matches: ${same}/${h1.length} frames byte-identical, the rest within raster noise (min PSNR ${minPsnr === Infinity ? 'inf' : minPsnr.toFixed(1)} dB)`);
      check(cursorDev <= 0.5, `DSF ${dsf}: repeat cursor track matches (max deviation ${cursorDev.toFixed(2)} px)`);
      report.determinism = { dsf, identicalFrames: same, of: h1.length, minPsnrDb: minPsnr, cursorMaxDeviationPx: cursorDev, warmupMs: [c1.warmupMs, c2.warmupMs] };
      fs.rmSync(out2, { recursive: true, force: true });
    }
    fs.rmSync(path.join(out, 'frames'), { recursive: true, force: true });
  }
  // DSF comparison: what a 1.8x zoom shows in the 1920x1080 film (page drawn ~1490 px wide → 1440 CSS px × 1.035 × 1.8),
  // cropped on the headline. Top = DSF 1 (upscaled), bottom = DSF 2 (downscaled).
  if (report.runs.length > 1) {
    const z = (1490 / 1440) * 1.8;
    const W = Math.round(1440 * z), cw = Math.round(560 * z), ch = Math.round(200 * z), cx = Math.round(60 * z), cy = Math.round(425 * z);
    const parts = report.runs.map((r) => {
      const png = path.join(outRoot, `zoom-dsf${r.dsf}.png`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '3.9', '-i', r.mp4, '-frames:v', '1', '-vf', `scale=${W}:-1:flags=bicubic,crop=${cw}:${ch}:${cx}:${cy}`, png]);
      return png;
    });
    const cmp = path.join(outRoot, 'dsf-compare-at-1.8x.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...parts.flatMap((p) => ['-i', p]), '-filter_complex', `vstack=inputs=${parts.length}`, cmp]);
    report.dsfCompare = cmp;
    console.log(`DSF comparison at 1.8x zoom → ${cmp}`);
  }
  report.pass = pass;
  fs.writeFileSync(path.join(outRoot, 'selftest.json'), JSON.stringify(report, null, 2));
  console.log(pass ? 'SELFTEST PASS' : 'SELFTEST FAIL', '→', path.join(outRoot, 'selftest.json'));
  return pass;
}

// --------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selftest) {
    const ok = await selftest(args);
    process.exit(ok ? 0 : 1);
  }
  let shot;
  let storyboard = {};
  if (args.storyboard) {
    storyboard = JSON.parse(fs.readFileSync(args.storyboard, 'utf8'));
    const all = storyboard.shots || [];
    shot = all.find((s) => s.id === args.shot);
    if (!shot) throw new Error(`shot "${args.shot}" not in storyboard (has: ${all.filter((s) => s.url).map((s) => s.id).join(', ')})`);
    if (!shot.url) throw new Error(`shot "${args.shot}" has no url: it is drawn in Remotion, not captured`);
  } else if (args['shot-file']) {
    shot = JSON.parse(fs.readFileSync(args['shot-file'], 'utf8'));
  } else {
    console.error('usage: capture.cjs --storyboard sb.json --shot ID --out DIR | --shot-file shot.json --out DIR | --selftest');
    process.exit(2);
  }
  if (!args.out) throw new Error('--out DIR is required');
  const opts = Object.assign({}, args, { base: args.base || storyboard.base || DEFAULT_BASE, storyboard });
  await runShot(shot, opts);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

module.exports = { captureShot, runShot, normalizeShot, resolveFromShot, unfilled, bezier, cursorKind, penPlan, catmullRom };
