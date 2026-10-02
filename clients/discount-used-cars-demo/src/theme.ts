// theme.ts — the single source of truth: brand, motion, Recordly tuning, sound map.
// Components never inline a colour, easing, spring or timing; they read it from here. Timings are in SECONDS and
// converted with Math.round(x * fps) where they are used, so the film keeps its pace at any frame rate.
// Per project, change `colors`, `fonts`, `brand` and `site`; leave `recordly` alone unless the user asks.
import { Easing } from "remotion";

export const theme = {
  colors: {
    // Brand: black and white; the logo's red is the ONE colour (max one red element per frame).
    // Wallpaper: neutral charcoal (no blue cast), lifted enough that the window's edge and shadow read.
    bg: "#171717",
    bgAlt: "#242424",
    meshA: "#444444", // charcoal mesh blobs
    meshB: "#333333",
    meshC: "#5A5A5A",
    sheen: "rgba(255,255,255,0.035)", // soft diagonal light across the wallpaper
    primary: "#9A1414",
    text: "#F5F5F4",
    textDim: "#A6A6AA",
    textSoft: "rgba(245,245,244,0.82)", // secondary lines that must still read on a phone (≥ 75% white)
    ink: "#0A0A0B",
    black: "#000000",
    shadeRgb: "0,0,0", // for rgba() shades: grade, vignette, dither base
    // macOS window chrome (dark appearance)
    chrome: "#1F1F22",
    chromeTop: "#2A2A2E",
    chromeBorder: "rgba(255,255,255,0.12)", // 1 px inner highlight along the top edge
    chromeHairline: "rgba(0,0,0,0.55)",
    urlPill: "rgba(255,255,255,0.075)",
    urlText: "#D4D4D8",
    lightsMono: "#4B4B50", // traffic lights in brand-safe grey (an unfocused macOS window)
    lightsMonoEdge: "rgba(0,0,0,0.35)",
    lightsColor: ["#FF5F57", "#FEBC2E", "#28C840"], // only when lights="color"
    shadow: "rgba(0,0,0,0.55)",
    shadowDeep: "rgba(0,0,0,0.72)",
    // cursor + touch
    cursorFill: "#000000",
    cursorStroke: "#FFFFFF",
    cursorShadow: "rgba(0,0,0,0.35)",
    handFill: "#FFFFFF", // macOS pointing hand: white with a black outline
    handStroke: "#000000",
    // click ring: white with a faint dark edge inside and out, so it reads on white pages and on black bands
    clickRing: "rgba(255,255,255,0.9)",
    clickRingEdge: "rgba(0,0,0,0.3)",
    // touch indicator: neutral grey disc, white inner ring, faint dark edge, so it reads on white and on black
    touch: "rgba(128,128,134,0.45)",
    touchRing: "rgba(255,255,255,0.85)",
    touchEdge: "rgba(0,0,0,0.22)",
    // iPhone
    phoneEdge: "#3A3A3F",
    phoneEdgeHi: "#8A8A90",
    phoneBezel: "#050505",
    phoneButton: "#2E2E33",
    glass: "rgba(255,255,255,0.07)",
    statusLight: "#FFFFFF", // status-bar glyphs on a dark page top
    statusDark: "#000000", // … on a light page top
    statusBar: "#000000", // fallback when the capture has no edge colours
    // B6 · the 130-U in a macOS Preview window (dark appearance)
    docCanvas: "#2A2A2D", // Preview's canvas around the page
    docPage: "#FFFFFF",
    docPageShadow: "rgba(0,0,0,0.45)",
    docIcon: "#B9B9BE", // toolbar glyphs
    docTitleSub: "#8E8E93", // "Page 1 of 2"
    privacyTint: "rgba(255,255,255,0.32)", // the frosted wash over a privacy blur
    privacyEdge: "rgba(0,0,0,0.10)",
    captionPill: "rgba(10,10,11,0.86)",
    captionEdge: "rgba(255,255,255,0.12)",
  },
  fonts: {
    // Loaded from public/fonts by src/lib/fonts.ts (the site's own face). `stack` is what components use: a missing
    // face falls back to a condensed sans, never the browser's serif (and fonts.ts cancels the render anyway).
    display: "Barlow Semi Condensed",
    stack: '"Barlow Semi Condensed", "Arial Narrow", sans-serif',
    files: [
      { weight: 400, file: "fonts/barlow-semi-condensed-latin-400-normal.woff2" },
      { weight: 500, file: "fonts/barlow-semi-condensed-latin-500-normal.woff2" },
      { weight: 600, file: "fonts/barlow-semi-condensed-latin-600-normal.woff2" },
      { weight: 700, file: "fonts/barlow-semi-condensed-latin-700-normal.woff2" },
    ],
  },
  // Linear is forbidden. Entrances: out. Moves: inOut. Exits: in.
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
    soft: Easing.bezier(0.45, 0, 0.2, 1),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
    window: { damping: 18, stiffness: 120, mass: 0.9 },
  },
  // Recordly defaults (tuning numbers only; Recordly's code is AGPL and not used).
  recordly: {
    zoomLevels: [1.25, 1.5, 1.8, 2.2, 3.5], // depth 1..5, default 3
    defaultDepth: 1.8,
    zoomInSec: 1.5,
    zoomOutSec: 1.0,
    zoomInEase: Easing.bezier(0.65, 0, 0.2, 1), // cubic ease-in-out: slow start, long settle
    zoomOutEase: Easing.bezier(0.55, 0, 0.25, 1),
    followWeight: 0.35, // while zoomed, how far the focus leans toward the cursor
    cameraSpring: { omega: 6.5 }, // rad/s, critically damped: the camera trails the target softly
    cursorSpring: { omega: 19 }, // ≈ smoothing 0.67 at 30 fps
    cursorLeadSec: 0.067, // compensates the spring lag so clicks land on time
    cursorHeight: 42, // px at 1080p ≈ 2.5× the OS arrow
    cursorZoomGrow: 0.35, // the cursor grows 35% as much as the page when zoomed
    clickScale: 0.82,
    clickMs: 350,
    ringMs: 450,
    ringRadius: [10, 34],
    clickPinSec: 0.2, // around a click the smoothed cursor is pinned to the real point (± this long)
    motionBlur: 0.35, // light
    maxBlurPx: 2,
    cursorHideFadeSec: 0.17, // the cursor fades (and shrinks a little) out/in around self-scrolls and typing
    cursorHideScale: 0.85,
    scrollMergeSec: 0.67, // two self-scrolls closer than this keep the cursor hidden between them (no blink)
    // a pen on a pad (capture 'draw'): the pointer is drawn unsmoothed, this many frames back along its path, where the
    // pad's ink ends (measured on B2: the ink trails the pointer by 0.2–0.3 of a frame's travel)
    penLagFrames: 0.25,
  },
  window: {
    titleBar: 38,
    radius: 12,
    marginY: 56, // the window's content height = 1080 - 2 * marginY - titleBar
    lights: "mono" as "mono" | "color",
    // the whole window leans in this much at full zoom depth, so a zoom reads as a camera move, not a page zoom
    pushScale: 0.1,
    // idle breathing while the window holds the screen (sin-wave micro-motion, kept tiny: it is a recording)
    breathe: { px: 2, periodSec: 6.5, scale: 0.0015 },
  },
  // A cut between two captures inside the same window. The captures are staged pixel-matched (same scroll, same
  // cursor, same hover), so the cut is HARD: any dissolve or blur on identical content only reads as a hiccup.
  // Set xfadeSec > 0 (and blurPx) only for captures that do not match (e.g. a different app or page).
  transition: {
    xfadeSec: 0,
    blurPx: 0,
  },
  // Intro sting → window: a match cut onto the site's own loader (same mark, same word, same spot).
  sting: {
    wipeSec: 0.73, // the mark's left-to-right wipe
    wordDelaySec: 0.27,
    letterStaggerSec: 0.1, // 3 frames at 30 fps
    breathePeriodSec: 4.6,
    breatheAmp: 0.006,
    handoffAtSec: 1.4, // the window starts here and the sting begins to shrink onto the loader
    handoffSec: 0.47, // ... and lands on it this much later
    fadeSec: 0.13, // then the sting dissolves into the identical loader beneath it
    exitSec: 0.3, // a plain (non-match) sting leaves this fast
  },
  outro: {
    logoWidth: 760,
    lineSizes: [42, 30, 30], // URL, then the contact and hours lines: readable on a phone
    linesDelaySec: 0.6,
    lineStaggerSec: 0.2,
    wordStaggerSec: 0.1,
    gap: 18,
    pushTo: 1.03, // slow push across the whole outro
    exitSec: 0.3, // the logo leaves (blur + fade) ...
    fadeSec: 0.4, // ... while the frame fades to black
  },
  // Backdrop finish (behind the window and the phone only): a screen recording is never graded or vignetted.
  grade: { top: 0.06, bottom: 0.12 },
  vignette: { strength: 0.32, start: 0.58 },
  grain: { opacity: 0.07, overUi: 0.025 }, // overlay grain: heavier on the wallpaper, a whisper over the UI
  dither: { opacity: 0.04 }, // static fine noise on the wallpaper gradient, so h264 does not band it
  // B6 · the deal's real 130-U (page 1, 300 dpi) in a Preview window over the held desk; the camera pushes in on the
  // seller band (printed name + Maria's signature). Seconds from the scene's first frame.
  doc: {
    durationSec: 3.7,
    // the Preview window at rest: height in frame px, toolbar, canvas margin around the page, a small cascade offset
    window: { height: 920, toolbar: 52, pageMargin: 18, sideMargin: 70, offsetX: 24 },
    // the desk behind: dims, settles back and softens as the Preview window opens
    behind: { dim: 0.5, scale: 0.975, blurPx: 2.5, pushParallax: 0.06 },
    // the push: Recordly's zoom-in time and ease (recordly.zoomInSec / zoomInEase), log-space so it reads as one move.
    // displayScale = frame px per page px at full push (the 2000 px band → 1530 px). The band's centre row lands at
    // landY on the form's centre column (focusX, page px): the form and its footer (x 81–2475) fill the width with
    // about 40 px of page each side, and the frame's top edge falls in the gap between two tax rows (page y 2382–2396)
    push: { atSec: 0.4, displayScale: 0.765, focusX: 1278, landY: 411 },
    // a privacy blur over money on the page (Screen Studio style): blur radius and padding in page px
    privacy: { blurPx: 26, padPx: 10, radiusPx: 14 },
    caption: { atSec: 1.75, wordStaggerSec: 0.1, exitAtSec: 3.38, exitSec: 0.25, size: 38, centerY: 930 },
  },
  phone: {
    screen: { width: 390, height: 844 }, // iPhone 14 points; the capture is 390 × (844 − statusBar)
    statusBar: 47,
    bezel: 13,
    radius: 55,
    screenRadius: 47,
    island: { width: 124, height: 36, top: 11 },
    homeIndicator: { width: 134, height: 5, bottom: 8 },
    time: "9:41",
    floatPx: 4,
    floatPeriodSec: 6.3,
    enterOpaqueSec: 0.067, // fully opaque within 2 frames: the desktop never shows through the phone
    exitSec: 0.4, // the phone drops out of frame
    maxMotionBlurPx: 5,
  },
  touch: {
    rippleSec: 0.53,
    fingerFadeSec: 0.1,
  },
  // Sound map (recordly-demo SKILL.md). Files live in public/sfx/. Gains in dB, before masterDb.
  sfx: {
    // Without music the kit's levels are very quiet (−27 LUFS); +10 dB keeps true peak around −4 dBTP.
    masterDb: 10,
    click: { file: "sfx/ios_tink.wav", db: -12, leadSec: 0.067 },
    // one real keystroke per character: single hits sliced from the kit's macbook_keyboard.wav (scripts/prepare-sfx.sh)
    type: { files: ["sfx/key_1.wav", "sfx/key_2.wav", "sfx/key_3.wav", "sfx/key_4.wav", "sfx/key_5.wav", "sfx/key_6.wav", "sfx/key_7.wav"], db: -18, jitterDb: 1.5, leadSec: 0.033 },
    open: { file: "sfx/open_ui.wav", db: -14, leadSec: 0.067 }, // trimmed to 0.6 s (the kit's file ends in a stray tick)
    // the kit's whoosh.wav cut to 0.45 s, plus two pitch variants so six zooms do not repeat one sample;
    // the cue is placed so the whoosh's peak (0.3 s in) lands just before the camera's fastest frame
    zoomIn: { files: ["sfx/whoosh_short.wav", "sfx/whoosh_short_lo.wav", "sfx/whoosh_short_hi.wav"], db: -20, maxSec: 0.45, peakSec: 0.3, leadSec: 0.033 },
    success: { file: "sfx/ios_success.wav", db: -10 },
    intro: { file: "sfx/ios_note.wav", db: -8 },
    outro: { file: "sfx/ios_received.wav", db: -4 },
    tap: { file: "sfx/ios_tink.wav", db: -16, leadSec: 0.067 },
  },
  fps: 30,
  width: 1920,
  height: 1080,
} as const;

export type Theme = typeof theme;
export const dbToGain = (db: number) => Math.pow(10, db / 20);
/** seconds → frames at the composition's fps */
export const toFrames = (sec: number, fps: number) => Math.round(sec * fps);
/** rgba() from theme.colors.shadeRgb (or another "r,g,b" triplet) */
export const shade = (alpha: number, rgb: string = theme.colors.shadeRgb) => `rgba(${rgb},${alpha})`;
