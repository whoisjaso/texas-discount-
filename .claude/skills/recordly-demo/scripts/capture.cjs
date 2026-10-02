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
 *
 * SHOT FORMAT (times in seconds, relative to frame 0)
 *   {
 *     "id": "2-scroll", "url": "/",
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
 *       { "t": 11.3, "type": "click", "selector": "#finder-q", "anchor": [0.25, 0.5] },
 *       { "t": 12.4, "type": "type", "text": "F-150", "perCharSec": 0.13 },
 *       { "t": 13.0, "type": "press", "key": "Escape" },
 *       { "t": 9.0, "type": "wait" }
 *     ],
 *     "zooms": [ { "at": 4.0, "until": 6.5, "depth": 1.8, "focus": "a.model[href*=Truck]", "tight": false, "follow": true } ],
 *     "track": { "name": "css selector" }   // extra rects recorded per frame
 *   }
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
 * home-indicator colour).
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
      if (next === undefined || next.startsWith('--')) out[k] = true;
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
  return s;
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
  const base = (opts.base || DEFAULT_BASE).replace(/\/+$/, '');
  const url = /^https?:/.test(shot.url || '') ? shot.url : base + (shot.url || '/');
  const outDir = path.resolve(opts.out);
  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const vw = shot.viewport.width, vh = shot.viewport.height;
  // cursor.start.fromShot: begin where an earlier capture's cursor ended (continuity across a cut).
  if (shot.cursor.start && shot.cursor.start.fromShot) {
    const id = shot.cursor.start.fromShot;
    const candidates = [path.resolve(opts.out, '..', id, 'cursor.json')];
    if (opts.publish) candidates.push(path.resolve(opts.publish, id, 'cursor.json'));
    const found = candidates.find((c) => fs.existsSync(c));
    if (found) {
      const prev = JSON.parse(fs.readFileSync(found, 'utf8'));
      const last = prev.frames[prev.frames.length - 1];
      shot.cursor.start = { x: last.x, y: last.y };
    } else {
      console.warn(`[${shot.id}] cursor.start.fromShot: no capture of "${id}" found yet; using the fallback x/y`);
      shot.cursor.start = { x: shot.cursor.start.x ?? vw / 2, y: shot.cursor.start.y ?? vh / 2 };
    }
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

    // Virtual time: paused from the start, wall clock pinned to shot.clock.
    const policy = { policy: 'pause' };
    if (shot.clock) policy.initialVirtualTime = Date.parse(shot.clock) / 1000;
    const { virtualTimeTicksBase } = await cdp.send('Emulation.setVirtualTimePolicy', policy);
    let elapsedMs = 0; // virtual ms since virtual time started
    let budgetWaiter = null;
    cdp.on('Emulation.virtualTimeBudgetExpired', () => { if (budgetWaiter) { const f = budgetWaiter; budgetWaiter = null; f(); } });
    const advance = (ms) => new Promise((resolve, reject) => {
      budgetWaiter = resolve;
      elapsedMs += ms;
      cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: ms }).catch(reject);
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
    const gridBase = elapsedMs;
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
    const key = (k, isChar) => {
      if (isChar) {
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
      if (a.selector) {
        const r = rects[`a${a.i}`];
        if (!r) throw new Error(`selector not found at t=${a.t}: ${a.selector}${a.contains ? ` (contains "${a.contains}")` : ''}`);
        const [fx, fy] = a.anchor || [0.5, 0.5];
        return { x: r[0] + r[2] * fx, y: r[1] + r[3] * fy };
      }
      return { x: a.x, y: a.y };
    };

    for (let k = -preroll; k < total; k++) {
      const capturing = k >= 0;
      // 1. Start actions due at this frame (set-up actions run at -preroll + their offset).
      const due = plan.filter((a) => a.startFrame === k || (k === -preroll && a.startFrame < -preroll));
      // Queries this frame needs: active pointer target, new scroll target, tracks.
      const queries = {};
      for (const [name, q] of Object.entries(tracks)) queries[name] = q;
      const pointerTypes = new Set(['moveTo', 'hover', 'click']);
      for (const a of due) if (a.selector && (pointerTypes.has(a.type) || a.type === 'scrollTo')) queries[`a${a.i}`] = queryOf(a);
      if (move && move.a.selector) queries[`a${move.a.i}`] = queryOf(move.a);

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
      if (wantScroll !== null || (move && move.a.selector)) {
        m = await evalSafe(pageFrame, { scrollY: wantScroll, queries }, k);
      }
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
      if (shot.cursor.kind === 'pointer' && inViewport(cur)) {
        const pos = { x: round1(cur.x), y: round1(cur.y) };
        if (!lastMouse || lastMouse.x !== pos.x || lastMouse.y !== pos.y) {
          mouse('mouseMoved', pos);
          lastMouse = pos;
        }
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
      const vtFrame = m.vt + budget; // performance.now() at the moment this frame renders
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

module.exports = { captureShot, runShot, normalizeShot, bezier };
