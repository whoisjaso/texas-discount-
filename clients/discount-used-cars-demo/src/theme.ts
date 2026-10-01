// theme.ts — the single source of truth: brand, motion, Recordly tuning, sound map.
// Components never inline a colour, easing or spring; they read it from here.
// Per project, change `colors`, `fonts`, `brand` and `site`; leave `recordly` alone unless the user asks.
import { Easing } from "remotion";

export const theme = {
  colors: {
    // Brand: black and white; the logo's red is the ONE colour (max one red element per frame).
    bg: "#0A0A0B",
    bgAlt: "#141417",
    meshA: "#26262B", // charcoal mesh blobs
    meshB: "#1B1B1F",
    meshC: "#33333A",
    primary: "#9A1414",
    text: "#F5F5F4",
    textDim: "#A6A6AA",
    ink: "#0A0A0B",
    // macOS window chrome (dark appearance)
    chrome: "#1F1F22",
    chromeTop: "#2A2A2E",
    chromeBorder: "rgba(255,255,255,0.10)",
    chromeHairline: "rgba(0,0,0,0.55)",
    urlPill: "rgba(255,255,255,0.075)",
    urlText: "#D4D4D8",
    lightsMono: "#4B4B50", // traffic lights in brand-safe grey (an unfocused macOS window)
    lightsMonoEdge: "rgba(0,0,0,0.35)",
    lightsColor: ["#FF5F57", "#FEBC2E", "#28C840"], // only when lights="color"
    shadow: "rgba(0,0,0,0.55)",
    // cursor + touch
    cursorFill: "#000000",
    cursorStroke: "#FFFFFF",
    cursorShadow: "rgba(0,0,0,0.35)",
    clickRing: "rgba(255,255,255,0.85)",
    // touch indicator: neutral grey disc, white inner ring, faint dark edge, so it reads on white and on black
    touch: "rgba(128,128,134,0.45)",
    touchRing: "rgba(255,255,255,0.85)",
    touchEdge: "rgba(0,0,0,0.22)",
    // iPhone
    phoneEdge: "#3A3A3F",
    phoneEdgeHi: "#8A8A90",
    phoneBezel: "#050505",
    phoneButton: "#2E2E33",
    statusText: "#FFFFFF",
    statusBar: "#000000",
  },
  fonts: {
    // Loaded from public/fonts by src/lib/fonts.ts (the site's own face).
    display: "Barlow Semi Condensed",
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
    cursorLeadFrames: 2, // compensates the spring lag so clicks land on time
    cursorHeight: 42, // px at 1080p ≈ 2.5× the OS arrow
    cursorZoomGrow: 0.35, // the cursor grows 35% as much as the page when zoomed
    clickScale: 0.82,
    clickMs: 350,
    ringMs: 450,
    ringRadius: [10, 34],
    motionBlur: 0.35, // light
    maxBlurPx: 2,
    cursorHideFadeFrames: 5,
  },
  window: {
    titleBar: 38,
    radius: 12,
    marginY: 56, // the window's content height = 1080 - 2 * marginY - titleBar
    lights: "mono" as "mono" | "color",
    pushScale: 0.035, // the whole window leans in this much at full zoom (depth)
    // idle breathing while the window holds the screen (sin-wave micro-motion, kept tiny: it is a recording)
    breathe: { px: 2, periodSec: 6.5, scale: 0.0015 },
  },
  // Cut between two captures inside the same window: the window stays, the content crossfades under a short
  // blur (spring-driven, frames derived from fps). The cursor is never blurred.
  transition: {
    xfadeSec: 0.2, // 6 frames at 30 fps
    blurPx: 6,
  },
  // Colour grade (layer 4 of 5): luminance only, so the site's own colours stay true.
  grade: { top: 0.06, bottom: 0.12 },
  phone: {
    screen: { width: 390, height: 844 }, // iPhone 14 points; the capture is 390 × (844 − statusBar)
    statusBar: 47,
    bezel: 13,
    radius: 55,
    screenRadius: 47,
    island: { width: 124, height: 36, top: 11 },
    time: "9:41",
  },
  grain: { opacity: 0.07 },
  vignette: { strength: 0.32 },
  // Sound map (recordly-demo SKILL.md). Files live in public/sfx/. Gains in dB.
  sfx: {
    click: { file: "sfx/ios_tink.wav", db: -12 },
    // one real keystroke per character: single hits sliced from the kit's macbook_keyboard.wav (scripts/prepare-sfx.sh)
    type: { files: ["sfx/key_1.wav", "sfx/key_2.wav", "sfx/key_3.wav", "sfx/key_4.wav", "sfx/key_5.wav", "sfx/key_6.wav", "sfx/key_7.wav"], db: -18, jitterDb: 1.5 },
    open: { file: "sfx/open_ui.wav", db: -14 },
    zoomIn: { file: "sfx/whoosh_short.wav", db: -20, maxSec: 0.45 }, // the kit's whoosh.wav, cut to 0.45 s with a fade
    success: { file: "sfx/ios_success.wav", db: -10 },
    intro: { file: "sfx/ios_note.wav", db: -8 },
    outro: { file: "sfx/ios_received.wav", db: -4 },
    tap: { file: "sfx/ios_tink.wav", db: -16 },
  },
  fps: 30,
  width: 1920,
  height: 1080,
} as const;

export type Theme = typeof theme;
export const dbToGain = (db: number) => Math.pow(10, db / 20);
