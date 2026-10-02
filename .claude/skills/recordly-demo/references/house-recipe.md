# The house recipe

The approved film, Discount Used Cars part A (`clients/discount-used-cars-demo/out/demo-v1.mp4`), measures as follows:

| Property | Value |
|---|---|
| Size and rate | 1920×1080, 30 fps |
| Length | 1477 frames, 49.237 s |
| Master size | 41.9 MB |
| Video | h264 High CRF 16, `yuvj420p` (Remotion's default from JPEG frames), about 6.5 Mb/s |
| Audio | AAC-LC 48 kHz stereo, about 317 kb/s |

The user approved it with "exactly this way". This file records every number in that film and the reason for it. All
the values live in the template's code: `src/theme.ts`, `src/demo/timeline.ts`, `src/Demo.tsx`, the components, and
`scripts/capture.cjs` for the capture side. So a project made with `scripts/new-project.sh` reproduces them without
anyone re-typing them.

**Changing a value needs a reason and a re-verify.** Most of these numbers were fixed by a reviewer finding (F-numbers,
see `lessons.md`). Changing one to taste reopens that defect. If a client genuinely needs a change, say why in the
project README, change it in one place, and run the full gates (`verification.md`) again. The only per-client theme
value is `outro.logoWidth`, which `new-project.sh` derives from the logo's shape (§9).

All timings are seconds in `theme.ts`, converted with `toFrames(s, fps) = Math.round(s * fps)`. Frame numbers below
are at 30 fps with part B empty.

## Contents

1. [Running order](#1-running-order)
2. [Intro sting and the match cut](#2-intro-sting-and-the-match-cut)
3. [Backdrop: wallpaper, dither, grade, grain, vignette](#3-backdrop)
4. [macOS window](#4-macos-window)
5. [Camera (zoom)](#5-camera-zoom)
6. [Cursor](#6-cursor)
7. [Hard cuts and pixel-matched staging](#7-hard-cuts-and-pixel-matched-staging)
8. [iPhone cut](#8-iphone-cut)
9. [Outro](#9-outro)
10. [Motion vocabulary and fonts](#10-motion-vocabulary-and-fonts)
11. [Sound](#11-sound)
12. [Capture settings](#12-capture-settings)
13. [Render settings](#13-render-settings)
14. [Content rules](#14-content-rules)
15. [Part B slot](#15-part-b-slot)
16. [Known open items](#16-known-open-items)

## 1. Running order

From `src/demo/timeline.ts` (`buildTimeline`). Run `scripts/verify-film.cjs --project <dir> --plan` to print it for any
project.

| Film frames | Seconds | What |
|---|---|---|
| 0–60 | 0–2.03 | **Intro.** Match-cut sting. The hand-off starts at f42, the sting lands at f56 and dissolves over f56–60. |
| 42–238 | 1.40–7.93 | **1-hero.** Capture frames 32–227 (trim 32, 196 frames shown). |
| 238–748 | 7.93–24.93 | **2-scroll.** 510 frames. |
| 748–919 | 24.93–30.63 | **3-buy.** 171 frames. |
| 919–1099 | 30.63–36.63 | **4-menu.** 180 frames. It ends held at 1.8× on the Admin row. |
| 1099 | 36.63 | **CUT POINT** (`demoTimeline.cutPoint`). Part B goes here (0 frames in part A). |
| 1099–1369 | 36.63–45.63 | **5-phone.** 270 frames. The desktop's last frame is held behind the phone. |
| 1363–1477 | 45.43–49.23 | **Outro.** 114 frames. It starts 0.2 s (6 frames) before the phone ends and is drawn UNDER the phone. |

How each value is derived. Every hand-off comes from the element before it, never from a hand-typed offset.

| Quantity | Formula |
|---|---|
| shot-1 trim | `sec(loader.wordDoneSec 1.5) − sec(sting.handoffSec 0.47) + 1` = 45 − 14 + 1 = **32**. The sting lands one frame after the loader's word is at rest; a match cut only works on a loader at rest. |
| `handoffAt` | `sec(sting.handoffAtSec 1.4)` = 42 |
| `landAt` | `handoffAt + sec(0.47)` = 56 |
| intro length | `landAt + sec(fadeSec 0.13) + 1` = 61 |
| `desktopA.from` | `handoffAt`: the window springs in with the hand-off |
| `cutPoint` | `desktopA.from + Σ segment lengths` |
| desktop B | from `cutPoint`, length of `partBSegments` |
| phone | `sec(9)` |
| outro | from `phone end − sec(0.2)`, length `sec(3.8)` |

Segment lengths come from the storyboard `durationSec`:

- 1-hero: `sec(7.6) − 32`
- 2-scroll: `sec(17)`
- 3-buy: `sec(5.7)`
- 4-menu: `sec(6)`, plus the `eventCue` that plays `open_ui` on click #0 one frame late (the drawer opening)

**Layer order** (`Demo.tsx`, bottom to top):

1. `Backdrop`, drawn once at the root.
2. Desktop A `Sequence`, inside `HoldUnderPhone`.
3. Part B `Sequence`, only when it has segments.
4. Outro `Sequence`.
5. Phone `Sequence`.
6. Intro sting `Sequence`.
7. `Sfx`.
8. `Finish` (grain 0.025).
9. `FinalFade`.

Why this order:

- The outro sits under the phone. Drawn above it, its logo double-exposed over the exiting phone (F3, F21).
- The intro sits above the window it lands on.
- `HoldUnderPhone` keeps the last desktop instance mounted. From `holdAt` it is frozen on frame `holdAt − 1` and styled
  by `phoneBehindStyle`. A fresh desktop copy mounted on the cut frame rendered one black frame in a full render; the
  stills were fine (found in polish verification).

**Pacing rules:**

- Each zoom-out lands and holds at least 0.3 s at 1× before the next scroll. For example, zoom out 6.0 + 1.0 s, then
  the next scroll at 7.3 s (F19).
- Nothing on screen is still for more than about 4 s.
- The product is visible within about 3 s.
- The story runs 45–75 s.

## 2. Intro sting and the match cut

Every premium-dealer-build site plays an intro loader once per session: the mark, then the word in wide capitals, then
a hairline, then the curtain lifts. Shot 1 records that loader. The sting is drawn in the loader's exact layout, scaled
up, and shrinks onto it. This was chosen because v0 showed the logo twice and the product only at 4.3 s. The match cut
brought the hero to about 3.0 s and the film from 53.4 s to 49.2 s (F4).

**Loader geometry** (`project.loader`). It is measured at 1440×900 by `scripts/measure-site.cjs`:
getBoundingClientRect of `.loader__stage`, `.loader__emblem img` and `.loader__word`, with the CSS animations finished.
Discount's values:

| Field | Value |
|---|---|
| stage | `[540, 378.53, 360, 142.94]` |
| mark | `[540, 378.53, 360, 48.94]` |
| word | `[607.5, 451.47, 240, 45]` |
| wordFont | 30 px / line-height 45, weight 600, tracking 0.5 em, `#FFFFFF` |
| cover | `[520, 366, 400, 136]` in `#000000`. This is the mark+word union padded 20 px left and right, 12 above and 5 below. The loader's hairline stays visible. The cover hides the loader's own logo in the window until the sting lands (`untilFrame = landAt − desktopA.from` = 14 scene frames). |
| wordDoneSec | 1.5 (word rise 0.5 s + 1.0 s; the emblem ends at 1.3 s; the curtain lifts at 2.2 s) |

**Sting scale:** `stingMarkWidth / loader.mark[2]` = 600/360 = **1.667**. For a new client, `fill-client.cjs` keeps
that ratio (`mark width × 600/360`), so the hand-off shrink is the same move. The sting is centred on the stage centre
at the frame centre.

**Draw-in** (`theme.sting`, `MatchSting.tsx`):

- **Mark:** a left-to-right `clip-path` wipe over `wipeSec` 0.73 (22 frames) with `ease.out`. At the same time it
  slides translateX −60 → 0 on spring `smooth`, scales 0.92 → 1 (clamped), blurs `(1−p)·8` px, and fades in with
  opacity `min(1, 1.4p)`.
- **Word letters:** start at `wordDelaySec` 0.27 (8 frames) and are staggered `letterStaggerSec` 0.1 (3 frames), on
  spring `snappy`. Each letter rises `0.45·size·k` with blur `(1−s)·size·k·0.08`.
- **Breathing:** period 4.6 s, amplitude 0.006, multiplied by `(1 − handoff)` so it is gone before landing.

**Hand-off** (`Demo.tsx` `IntroSting`):

- From f42 the progress is `w = ease.inOut` over `handoffSec` 0.47 (14 frames).
- Scale is interpolated in log space to `landScale = (contentW/1440 · windowPose.scale)/k`, about 0.62, so the shrink
  reads as one even move.
- The translation targets `windowPoint(stage centre)` under the springing `windowPose({enter:true})`.
- At f56 the sting dissolves over `fadeSec` 0.13 (4 frames, `ease.inOut`) into the identical loader underneath. One
  logo is on screen at every frame.

## 3. Backdrop

The recording is never graded. Grade, vignette, dither and the heavy grain sit on the backdrop only, under the window
and the phone. Only grain at 0.025 goes over the UI, and its overlay blend leaves pure white and black untouched. This
was chosen because v0 drew those layers on top, and the site's whites fell from 255 to 187–228 (F1). It deliberately
overrides the remotion-motion-graphics "vignette on top" rule (F23 rejected).

**Wallpaper colours** (`theme.colors`): bg `#171717`, bgAlt `#242424`, meshA `#444444`, meshB `#333333`, meshC
`#5A5A5A`, sheen `rgba(255,255,255,0.035)`. They are neutral grey (R=G=B, no blue cast) with a mean of about 40/255,
so the window's edge and shadow read. v0 was near black (mean 20) with a violet cast and banding (F7).

**Wallpaper geometry** (`Wallpaper.tsx`):

- Base: `linear-gradient(160deg, bgAlt 0%, bg 55%, bg 100%)`.
- Three blobs, each `radial-gradient(color 0%, transparent 66%)`:

  | Colour | Size | Position | Blur | Opacity |
  |---|---|---|---|---|
  | meshC | 1500 | (0.18W + d1, 0.05H + 0.5·d2) | 60 | 0.85 |
  | meshA | 1300 | (0.92W − d2, 0.95H + d3) | 70 | 0.9 |
  | meshB | 900 | (0.62W + d3, 0.30H − 0.4·d1) | 80 | 1 |

- Drift: d1 = sin(t/1.9)·70, d2 = cos(t/2.4)·60, d3 = sin(t/3.1 + 1.3)·50 (t in seconds).
- Sheen: `linear-gradient(115deg, transparent 30%, sheen 48%, transparent 62%)`, translateX sin(t/4)·80.
- Brand glow: 0. There is one logo-colour element per frame at most, and the site supplies it. `theme.colors.primary`
  (Discount's red, `#9A1414`) feeds only this glow, so it stays as it is for every client, whatever the logo's colour.

**Finish layers** (`Overlays.tsx`, on the backdrop, in order):

| Layer | Setting | Why |
|---|---|---|
| Dither | opacity 0.04. Static grey fractal noise: baseFrequency 1.6, 1 octave, saturate 0, 160 px tile | About ±1.5 levels, so h264 does not band the dark gradient (F7) |
| Grade | top 0.06 / bottom 0.12, with stops 0% / 26% transparent / 70% transparent / 100% | A gentle top and bottom fall-off |
| Grain | opacity 0.07. fractalNoise 0.85, 2 octaves, 240 px tile, overlay blend. Offset each frame by (f·37 mod 240, f·61 mod 240) | Texture on the wallpaper only |
| Vignette | strength 0.32 from 58%, black radial ellipse | Focus on the centre |

On top of everything, `Finish` adds grain 0.025. `FinalFade` fades to black with `ease.in` over the last
`outro.fadeSec` 0.4 s (12 frames).

## 4. macOS window

**Layout** (`windowLayout`):

| Value | How it is set |
|---|---|
| contentH | `1080 − 2·marginY 56 − titleBar 38` = **930** |
| contentW | `round(930·1440/900)` = **1488** |
| left / top / content top | 216 / 56 / 94 |

The 1440 px page therefore shows about 1490 px wide (×1.0333).

**Chrome** (`theme.window`, `MacWindow.tsx`):

| Element | Value |
|---|---|
| Corner radius | 12 |
| Title bar | 38 px, `linear-gradient(180deg, #2A2A2E, #1F1F22)`, 1 px bottom hairline `rgba(0,0,0,.55)` |
| Traffic lights | 12 px dots, gap 8, margin-left 16. Mono `#4B4B50` with a 0.5 px inset edge (an unfocused window). `lights: "color"` exists only if the user asks: the brand allows one colour. |
| URL pill | height 24, minWidth min(520, 0.36·W), padding 0 18, radius 7, bg `rgba(255,255,255,.075)`, text `#D4D4D8` 500 14.5 px, tracking 0.2, 12 px lock glyph. It shows the real domain (`project.domain`). |
| Shadow | `0 0 0 1px rgba(0,0,0,.55), 0 70px 150px -20px rgba(0,0,0,.72), 0 30px 60px -28px rgba(0,0,0,.55)` |
| Top highlight | inset 1 px `rgba(255,255,255,.12)`, so the edge reads on the dark wallpaper (F7) |
| Content background | `#0A0A0B` |

**Pose** (`windowPose`):

- **Entrance:** spring `window` {damping 18, stiffness 120, mass 0.9}. Opacity `min(1, 1.2e)`, scale 0.94 → 1
  (clamped), y 30 → 0.
- **Lean-in:** `push = 1 + clamp((camScale − 1)/(1.8 − 1))·pushScale 0.10`. At 1.8× and deeper the window grows to
  1.10× and fills the frame top to bottom. This makes a zoom read as a camera move, not a page zoom (F8; 0.035 was
  invisible).
- **Breathing:** `{px 2, periodSec 6.5, scale 0.0015}`. floatY = sin(phase)·2, and scale ×(1 + sin(0.77·phase + 1.1)·0.0015).
- **Transform origin:** the window centre.

**One window** holds every desktop capture (`DesktopScene`). It springs in once, and its `open_ui` sound plays 2
frames before. Per-shot scenes would re-spring the window and restart the wallpaper drift at every cut.

## 5. Camera (zoom)

These are Recordly's published defaults, used as tuning numbers only. Recordly's code is AGPL-3.0 and none of it is
used.

| Setting | Value | Notes |
|---|---|---|
| Zoom levels | [1.25, 1.5, 1.8, 2.2, 3.5]; default 1.8 | Recordly depth 1–5, default 3 |
| Zoom in | 1.5 s (45 frames), `bezier(0.65, 0, 0.2, 1)` | Slow start, long settle |
| Zoom out | 1.0 s (30 frames), `bezier(0.55, 0, 0.25, 1)` | Starts from the scale reached at `outFrame` |
| Follow | lean 0.35 toward the cursor (`followWeight`), when `follow` is set | |
| Focus spring | critically damped, ω 6.5 rad/s, 4 substeps | Snaps while scale ≤ 1.0005, so each zoom starts on its own focus |
| Overlapping zooms | the highest scale wins | |
| Clamp | tx ∈ [W − W·s, 0], ty likewise | Never shows past the page |
| Motion blur | speed = hypot(Δtx, Δty) + abs(Δs)·W/2; blur 0 under 1.5 px/frame, else min(2, speed·0.35·0.1) | Applied as blur/s inside the scaled layer |
| Video element | `<OffthreadVideo>` only | |

**Zoom choreography as shipped** (storyboard zooms; film frames):

| Shot | Depth | Focus | Capture window | Film | Framing |
|---|---|---|---|---|---|
| 1-hero | 1.5 | `.hero__title` tight, centre, no follow | 3.8–6.4 | f124–232 | The headline |
| 2-scroll | 2.0 | point (375, 385) | 3.6–6.0 | from f346 | A 720×450 view, x 15–735, y 160–610. Right edge in the gutter before the next card (Discount's red Coupe); bottom above the chip (F14) |
| 2-scroll | 1.8 | point (400, 422) | 8.7–10.9 | from f499 | The visit card centred, 33 px of page above and below (F15) |
| 2-scroll | 1.5 | `#finder-q` anchor (0.35, 0.5), follow | 13.3–16.0 | from f637 | The zoom-out lands exactly on the cut at f748 |
| 3-buy | 2.0 | point (740, 623) | 2.3–4.5 | from f817 | All band and tiles. "We Buy Cars" fully out, "We Buy SUVs" fully in (F13) |
| 4-menu | 1.8 | `.drawer__link--admin`, follow, `until: null` | from 2.2 | f985 to the cut | Held into part B |

**Framing rules.** A zoom is the film's close-up, so any slice or stray element is magnified.

- No frame edge may run through text or a pill.
- A neighbour's label is either fully in or fully out.
- At most one logo-colour element per frame (Discount's is red; a client's is whatever its logo is).
- Go to 2.0 when 1.5 or 1.8 cannot frame cleanly, rather than recapturing.
- `zoom.at` sits within ±0.3 s of the pointer action it accompanies.
- Holds last 2.2–2.7 s.
- `scripts/measure-site.cjs --storyboard` checks every fixed-focus zoom for edge cuts and against its storyboard
  `frame` rules (`in` wholly inside, `out` wholly outside), and prints the nearest passing focus when one fails. Follow
  zooms are checked on their stills.

`DesktopSegment.zoomFocus` can re-aim a captured zoom at composition time. It is not used in the approved film; the
focus points live in the storyboard.

## 6. Cursor

From `theme.recordly`, `lib/shot.ts` and `Cursor.tsx`.

| Setting | Value | Why |
|---|---|---|
| Size | 42 px per 30 units at 1080p | About 2.5× the OS arrow (Recordly) |
| Growth with zoom | ×(1 + (s−1)·0.35) | Stays readable without dominating |
| Smoothing | spring ω 19, critically damped, 4 substeps | ≈ Recordly smoothing 0.67 at 30 fps |
| Lead | `cursorLeadSec` 0.067: the spring follows a target 2 frames ahead | Clicks land on time |
| Click pin | within ±0.2 s of a click or tap, blended to the raw point with a triangular weight | The ring is exactly on the target |
| Click bounce | 350 ms: 30% `ease.out` to full, then `ease.inOut` back; scale to 0.82 | Recordly |
| Click ring | radius 10 → 34 with `ease.out` over 450 ms; 2.5 px `rgba(255,255,255,.9)` with a 1 px `rgba(0,0,0,.3)` edge inside and out; opacity 0.9·(1 − ease.in p); scale 0.9 → 1 | A white-only ring was invisible on white UI (F22) |
| Shapes | arrow (20×30 view, hotspot 2,1.5; black fill, white 1.7 stroke); pointing hand (24×27, hotspot 9.6,1.2; white fill, black 1.3 stroke); I-beam (14×24, hotspot 7,12; white 3.4 stroke under a black 1.4 stroke); drop-shadow 0 1.5u 2.4u `rgba(0,0,0,.35)` | The macOS shapes |
| Shape source | recorded per frame (`c`) from the computed CSS cursor: pointer → hand; text, or auto on an editable input/textarea → I-beam; anything else → arrow | Static text keeps the arrow (F12, half rejected) |
| Hide / show | over `cursorHideFadeSec` 0.17 (5 frames) with `ease.inOut`, always paired with a shrink to 0.85 | A lone opacity fade is forbidden (F30) |
| When hidden | During self-scrolls (`cursor: "hide"`, the default). Scrolls less than `scrollMergeSec` 0.67 s apart merge into one hidden stretch. From any keystroke until the mouse next moves. From frame 0 when `cursor.hiddenAtStart` | A real user's pointer does not wander during a scripted scroll; it blinked in the gutter before (F10) |
| Clipping | clipped to the page while zoomed (`clamp((s−1)/0.04)`); at rest it may sit outside the window | Shot 1 drifts in from (1560, 1010) |

**Capture-side motion** (`capture.cjs`):

- Pointer moves follow a minimum-jerk profile (peak speed 1.875× the mean) along a quadratic bow of 0.12·distance,
  capped at 90 px.
- The default move duration is clamp(0.55 + dist/1600, 0.6, 1.3) s.
- A click presses on arrival and releases 3 frames later. A tap lasts 4 frames.

## 7. Hard cuts and pixel-matched staging

`theme.transition` is {xfadeSec 0, blurPx 0}, so cuts inside the window are HARD. v0's 6-frame crossfade, with a 6 px
blur bell on identical content, read as a focus hiccup or a dropped frame (F2). The crossfade code remains only for
captures that genuinely differ.

**Staging:** frame 0 of shot N+1 equals the last frame of shot N. That means the same scroll, the same cursor point and
shape, the same hover state, and the caret in the same blink phase.

| Technique | How |
|---|---|
| Cursor continuity | `cursor.start.fromShot` reads the previous capture's last cursor.json frame. Capture in storyboard order. |
| Set-up actions | Negative `t` runs in the preroll; `prerollSec` ≥ −min(t). |
| Reveals | Shot 2's preroll is 6.6 s so the hero entrances have settled. Shot 3 clicks the finder after its 0.9 s reveal (at −1.2 s; mid-reveal put the cursor 4.7 px low). |
| Caret phase | Shot 3 re-types the query over 0.25 s from −1.0 s, so its last key is 22 frames before frame 0. In shot 2 the last key is 56 frames before the end. The caret blink (it restarts on every key) is in the same phase on both sides of the cut, which measures 55.4 dB. |
| Hover | Shot 4 repeats shot 3's last scroll (−5.0 s), jiggles the mouse (−3.0 s) so the tile takes hover, then hovers the same tile point (−2.0 s). Chromium re-evaluates `:hover` only on mouse moves. |
| Gutter park | Shot 2 parks the real mouse at (64, 560) while the drawn cursor is hidden, so no card is hovered early. |
| Clean hand-off sections | Shots 3 and 4 hand off on the service band, so the Discover tiles and the review quote never enter the frame. Re-stage rather than blur (F5). |

**Measured on the approved film** (`verify-film.cjs`):

| Cut | PSNR, last vs first frame | Note |
|---|---|---|
| 1 | 45.1 dB | Only the site's own bobbing scroll arrow differs: changed region [712, 850.5, 16, 10] CSS px. `.hero__down` bobs on a 2.4 s loop whose phase depends on page time, so it cannot be staged. A new site under 45 dB here may pass only with `--allow-cut` (verification.md §6) |
| 2 | 55.4 dB | |
| 3 | 51.1 dB | |

Recorded cursor at each cut:

| Cut | Point | Shape | Scroll |
|---|---|---|---|
| 1→2 | (399, 564.7) | arrow | 0 |
| 2→3 | (267, 482.1) | I-beam | 3659 |
| 3→4 | (720, 619.7) | hand | 4424 |
| 4 ends | (344.8, 542.1) | hand | |

## 8. iPhone cut

From `theme.phone`, `IPhone.tsx`, `PhoneScene.tsx` and `TapRipple.tsx`.

**Geometry.**

- iPhone 14, 390×844 pt: status bar 47, bezel 13, radius 55 pt (about 61 px at k 1.103), screen radius 47, Dynamic
  Island 124×36 at top 11, home indicator 134×5 at bottom 8. The clock reads "9:41".
- The phone is 960 px tall, so k = 960/870 = 1.103. It is centred at x 0.5, and y = (1080 − 960)/2 + float.
- The capture is **390×797**, so page + 47 pt status bar = 390×844 exactly. Capturing 844 tall would stretch the phone
  or put the header under the island.

**Frame.**

- Edge gradient `#8A8A90 / #3A3A3F / #3A3A3F / #8A8A90` at 0 / 0.35 / 0.7 / 1, with an inner bezel `#050505` inset
  2.4 pt.
- Side buttons `#2E2E33`: left at y 118 (h 30), 176 (h 58) and 248 (h 58); right at y 196 (h 92).
- Drop shadow `0 40k 60k rgba(0,0,0,.55)`. Glass: a 125° gradient of `rgba(255,255,255,.07)` fading to transparent
  at 30%.

**Status bar and home indicator.**

- The status bar is filled every frame with the capture's top-edge colour (`screenEdges.top`). Glyphs are black when
  the luminance is above 0.4, otherwise white, in Barlow 600 at 17 pt.
- The home indicator takes its colour from the bottom edge.
- Without this, a black strip sat over the site's white header (F17).

**Entrance.**

- Spring `window`. tx 0.45·W → 0, unclamped, so it may overshoot. Rotation 7° → 0, scale 0.92 → 1 (clamped).
- Opacity reaches 1 within `enterOpaqueSec` 0.067 (2 frames).
- Motion blur = min(5, speed·0.06).
- Before this, the phone was see-through and moved 113–133 px/frame with no blur (F16).

**Behind the phone** (`phoneBehindStyle`): scale (1 − 0.1e)(1 − 0.03x), blur 10e + 6x, opacity (1 − 0.5e)(1 − x).

**Exit.** Over the last `exitSec` 0.4 s (12 frames), with `ease.in`:

- ty = x·(0.5H + phone height): an accelerating drop out of frame
- rotation −5x
- scale ×(1 − 0.04x)
- speed blur

**Idle float:** sin(2πf/(6.3 s·fps))·4 px.

**Swipes.** iOS swipes:

- The finger drags the page 1:1 for `dragSec`. The default is 0.3 s; the first swipe uses 0.25. Its speed ramps up
  over the first 45% with minimum jerk.
- Then the page coasts with exponential decay, `tauSec` 0.32. The default length is drag + 4.5τ.
- The finger rides with the content and drifts 6 px in x with `bezier(0.25, 0.1, 0.25, 1)` (`EASE.touch` in
  `capture.cjs`).

**Touch indicator.**

- Ripple: r = (12 + 30·ease.out p)·k over 0.53 s (16 frames), with a 2k `rgba(255,255,255,.85)` ring, a 1k
  `rgba(0,0,0,.22)` edge and a `rgba(128,128,134,.45)` fill; opacity 0.85·(1 − ease.in p).
- Finger disc: r = 19k(0.8 + 0.2t). It fades over 0.1 s and grows with it; a fade is never used alone.
- A white disc vanished on white sections, which is why the disc is grey with edges.

**Shot 5:**

- Capture: 390×797, DSF 2, mobile, preroll 0.6 s.
- Swipes:
  - 2.0 s: to the lineup band title, offset 90; touch at (250, 690); drag 0.25 s
  - 3.9 s: scrollBy 430; touch at (240, 620)
  - 5.8 s: scrollBy 450; touch at (255, 610)
- It rests on the Trucks card (third in the stacked lineup), whatever the featured desktop card is: card top 60.8 px
  under the 64 px header. One more swipe would show the finance fine print. `measure-site.cjs` checks this (the
  shot's `rest` rule: 55–70 px, fine print below the screen).
- In the film, the swipes start at f1159, f1216 and f1273.

## 9. Outro

From `theme.outro`, `LogoSting.tsx` and `Title.tsx`.

- **Logo:** `project.logoReverse` (full colour on dark: the logo the site itself shows on its black bands or footer;
  never recoloured or inverted). Width `theme.outro.logoWidth` = min(760, round(300 × width / height)): 760 for
  Discount's 1402×540 logo (2.6:1), 384 for a 1.28:1 logo. `new-project.sh` computes it when `logoWidth` is null and
  writes it into the project's inputs. Spring `smooth`; translateY 36 → 0, scale 0.9 → 1, blur (1−p)·10, opacity p.
- **Spacing:** a column gap of 30 between the logo and the lines; 18 between lines.
- **Lines** (`project.outroLines`): URL, then "phone · street, city", then short hours.
  - Sizes 42 / 30 / 30.
  - The first line is weight 600 in `#F5F5F4`. The others are weight 500 in `rgba(245,245,244,.82)`. Tracking 0.01 em.
  - These sizes are readable on a phone; v0 was 28/23 px in dim grey (F18).
- **Timing:** the lines start at `linesDelaySec` 0.6 (18 frames). Lines are staggered 0.2 s (6 frames) and words
  0.1 s (3 frames). Words use spring `snappy`, rise 0.45·size, scale 0.96 → 1, blur (1−s)·size·0.08, word gap
  0.26·size, line-height 1.05.
- **Push:** 1.00 → 1.03 across the whole outro with `ease.soft`, plus breathing at 4.6 s / 0.006.
- **Exit:** at frame 102 of 114, over 0.3 s (9 frames) with `ease.in`: opacity 1 − x, scale +4%, blur 8x. Meanwhile
  `FinalFade` fades to black over the last 0.4 s. The last frame is black (YAVG 16.9).

## 10. Motion vocabulary and fonts

Linear easing is forbidden. Entrances use `out`, moves use `inOut`, exits use `in`.

| Name | Value |
|---|---|
| `ease.out` | bezier(0.16, 1, 0.3, 1) |
| `ease.inOut` | (0.83, 0, 0.17, 1) |
| `ease.in` | (0.7, 0, 0.84, 0) |
| `ease.soft` | (0.45, 0, 0.2, 1) |
| spring `snappy` | damping 14, stiffness 160, mass 0.6 |
| spring `smooth` | 20, 90, 1 |
| spring `bouncy` | 11, 170, 0.7 (unused) |
| spring `window` | 18, 120, 0.9 |

Opacity, scale and blur are clamped, and every blur sits in `Math.max(0, …)`. A spring-driven translate may overshoot
by design (F29).

**Font:** Barlow Semi Condensed 400/500/600/700, latin woff2 from @fontsource 5.3.0 (OFL-1.1), bundled in
`assets/fonts/`. The stack is `"Barlow Semi Condensed", "Arial Narrow", sans-serif`. `lib/fonts.ts` calls
`cancelRender` if a face fails to load, so a film is never silently set in serif (F32). This is the premium-dealer-build
standard face. Only a site that deviates needs another font, and that is a documented change.

## 11. Sound

From `theme.sfx`, `Sfx.tsx` and `assets/sfx/SOURCES.md`.

**Master gain: +10 dB.** Every cue plays at `dbToGain(db + 10)`. The kit is about −27 LUFS bare; +10 dB keeps the true
peak around −4 dBTP (F20). There is no music: the user adds a track.

| Cue | File | Level | Timing |
|---|---|---|---|
| Click | `ios_tink` | −12 dB | 2 frames early |
| Tap | `ios_tink` | −16 dB | 2 frames early (no taps in part A) |
| Typing | one keystroke per character from `key_1..7` | −18 dB ±1.5 | 1 frame early. The file is `floor(random("key-<shot>-<frame>")·7)` and the jitter `(random("keydb-…")·2 − 1)·1.5`, both from Remotion's deterministic `random` |
| Window opens | `open_ui` | −14 dB | 2 frames before `desktopA.from` |
| Menu drawer opens | `open_ui` | −14 dB | 1 frame after the click (4-menu `eventCues`, offset 1/fps): click f964 → f965. The click's tink leads the click by 2 frames (f962), so the two sounds are 3 frames apart |
| Phone slides in | `open_ui` | −16 dB | 2 frames early |
| Zoom in | `whoosh_short`, `_lo`, `_hi`, rotating `(i + zoomIndexOffset) % 3` | −20 dB | See below; capped at 0.45 s |
| Intro | `ios_note` | −8 dB | frame 1 |
| Outro | `ios_received` | −4 dB | `outro.from + 18 − 2`, so 2 frames before the URL line |
| Success | `ios_success` | −10 dB | Unused in part A; reserved for an app segment's "N / N signed" |

**Whoosh timing.** The cue frame is `zoom start + peakVelocityFrame(45) − toFrames(peakSec 0.3) − toFrames(leadSec
0.033)` = start + 19 − 9 − 1 = **start + 9**. The whoosh's peak (0.3 s into the sample) therefore lands at start + 18,
one frame before the camera's fastest frame (start + 19). v0 cued at start − 2, so the peak landed before the motion,
and one sample repeated six times (F9).

**Cue frames as shipped:**

| Sound | Film frames |
|---|---|
| ios_note | 1 |
| window open_ui | 40 |
| whooshes | 133, 355, 508, 646, 826, 994 |
| finder tink | 665 (click at 667) |
| keys | 675–691 |
| Menu tink / drawer open_ui | 962 / 965 |
| phone open_ui | 1097 |
| ios_received | 1379 |

**Measured:** max −4.8 dBFS, true peak −4.8 dBTP, integrated −17.3 LUFS. 30 onsets, all on cues; no isolated blips.

**Processed files** (`assets/sfx/SOURCES.md`):

- `open_ui` is cut to 0.6 s with a 50 ms fade. The kit's file ends in a lone tick at 0.97 s that played as a click with
  nothing clicked (F6).
- The keys are seven 95 ms slices of `macbook_keyboard.wav`.
- `whoosh_short` is the first 0.45 s of `whoosh.wav`, with variants pitched ±1.5 semitones.

## 12. Capture settings

From `scripts/capture.cjs` and the storyboard.

| Setting | Value | Why |
|---|---|---|
| Base | `http://localhost:5183`, serving a vite build of the site with `VITE_DESK_URL` set | The drawer's Admin row exists only when `VITE_DESK_URL` is set |
| fps | 30 | |
| DSF | 2 for desktop and phone, set by BOTH Playwright `deviceScaleFactor` and `--force-device-scale-factor` | At 1.8× zoom DSF 1 text is soft. With one switch only you get a 1× picture or a 1× page. |
| Output | 2880×1800 desktop, 780×1594 phone | |
| Clock | the storyboard `clock`, e.g. `2026-09-30T14:00:00-05:00` (a Wednesday, 2 PM Houston) | "Open Now" is computed from the time and must render the same in every capture |
| Time zone | `storyboard.timezone`, default America/Chicago | |
| Intro | `presetIntroSeen` false only for 1-hero; `introKey` = the site's Loader SEEN_KEY (required) | The loader plays once and never replays mid-film |
| Browser | locale en-US, colour scheme light, reducedMotion no-preference. Flags: `--deterministic-mode --hide-scrollbars --force-color-profile=srgb --disable-lcd-text --font-render-hinting=none --mute-audio --disable-background-timer-throttling` | Determinism |
| Rendering | page target with `enableBeginFrameControl`; each frame via `HeadlessExperimental.beginFrame` | `Page.captureScreenshot` under paused virtual time deadlocked |
| Virtual time | paused; frame k shows exactly `gridBase + (k + preroll + 1)/30`, with `pauseIfNetworkFetchesPending` | An exact 1/30 s grid however slow the render |
| Warm-up | 5 ms steps (up to 600) until readyState complete, fonts loaded, `readySelector` present and visible non-lazy images complete | No half-loaded frame 0 |
| Input | queue mouse and keys → advance → render → then await the acks | Mouse moves are rAF-aligned; awaiting first hangs |
| Scroll | eased `window.scrollTo`, `bezier(0.65, 0, 0.35, 1)`, default clamp(0.8 + dist/2600, 0.8, 2.4) s; never the wheel | Smooth and repeatable |
| Typing | `perCharSec` 0.12 by default (0.14 in shot 2), ±25% jitter from an md5-seeded mulberry32 keyed on the shot id | Human rhythm, identical every run |
| Encode | libx264 CRF 12, preset medium, yuv420p, bt709 tv range, `+faststart`; the ffprobe frame count must equal `frameCount` | |
| captureCss | applied to every shot before its own `css` | Video-only brand fixes |

**Capture CSS** (video only; the site source is never edited). Tell the owner that the same rules would fix the live
site:

- `.status--open .status__dot { background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent); }`.
  The green dot breaks the brand (black, white and the logo colour only).
- `#finder-q::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; display: none; }`. Hides
  Chromium's blue ×.
- `.split-card__hours { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }`. "Open Now" sat about 6 px
  low.
- Shot 2 only: `.lineup + .band__fine { visibility: hidden; }` hides the finance fine print. `visibility` keeps the
  layout and the scroll targets.

**Per shot** (`assets/storyboard-dealer-site.json`):

| Shot | Duration | Preroll | readySelector | Key timing |
|---|---|---|---|---|
| 1-hero | 7.6 s | 0 | `.loader` | moveTo (980, 700) at 2.4 for 1.4 s; hover `.hero__title` tight, anchor [0.75, 0.72], at 3.9 for 0.9 s, resting right of the headline's second line (F11) |
| 2-scroll | 17.0 s | 6.6 | `.hero__title` | Scrolls at 0.2, 2.0, 7.3, 12.2; hovers at 3.3 and 8.8; click at 13.6; typing at 14.6 |
| 3-buy | 5.7 s | 2.4 | `.hero__title` | Set-up at −2.3 / −1.2 / −1.0; scroll at 0.3; hover at 2.0 |
| 4-menu | 6.0 s | 6.5 | `.hero__title` | Click `.header__menu` at 0.4 for 1.1 s; hover `.drawer__link--admin` anchor [0.7, 0.42] at 2.3; no click |
| 5-phone | 9.0 s | 0.6 | `.hero__title` | See §8 |

**Cost:** about 0.2–0.32 s per frame and about 4 MB of PNG per frame at DSF 2. That is about 2.5 GB per 15 s shot
before `--clean`, and about 5 minutes for all five shots.

## 13. Render settings

| Setting | Value | Why |
|---|---|---|
| Frames | JPEG quality 95 | |
| Codec | h264 CRF 16 | Masters get re-compressed by platforms, and CRF 16 bands less on the dark gradient (F7) |
| Concurrency | 3 | Shots are 2880×1800 videos; keep frame extraction fed |
| Browser | `/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`, auto-detected in `remotion.config.ts` and also passed as `--browser-executable=$(ls -d …/chrome-linux)/headless_shell` | Bash does not expand a glob glued to `--flag=`, so wrap it in `$(ls -d …)` |
| Priority | `nice -n 15`; about 11–12 min for 1477 frames | Shared container |

The share copy is `ffmpeg -i <master> -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags
+faststart`. That gave 10.6 MB for Discount. `scripts/render.sh` raises the CRF in steps of 2 until the file is ≤ 24 MB.

## 14. Content rules

- **On-screen facts:** only the owner-confirmed list in `client-inputs.json` → `facts` (URL, phone, address, hours),
  copied character for character from where the site prints them.
- **Overlays:** the film's own overlays carry no prices and no claims.
- **Two classes of site text** in frame (`measure-site.cjs` sorts them):
  - **(a) Never in frame:** numbers about money or credit (a price, payment, `/mo`, APR, rate or %, term length in
    months), ratings ("4.8/5") and review counts. Re-stage or re-aim so they never enter the frame; never blur. The
    lineup's fine print and price chips are hidden with `visibility: hidden` (shots 2 and 5).
  - **(b) Allowed, listed for the owner:** claim-like site copy without numbers ("Easy financing, clear terms",
    "Every price is shown plainly", "All credit welcome"). It stays, and the project README lists it (from
    `zoomCopy`) so the owner can decide.
- **Service band:** the middle tile is zoomed. If every tile carries class (a) text, stop and ask the user before
  capturing; the house cut has no recipe for that.
- **Colour:** at most one logo-colour element per frame. The brand is black and white, and the traffic lights are mono.
- **Type:** Title Case, in the site's own font.
- **Hiding content:** re-stage so unconfirmed content never enters the frame; never blur it.
- **Video-only fixes:** go in `captureCss` and are listed for the owner.

## 15. Part B slot

Part B is the app / desk segment.

**What exists:**

- **Segments:** `partBSegments: DesktopSegment[] = []` in `src/demo/timeline.ts`. When the list is non-empty, `Demo`
  inserts a second `DesktopScene` (bare, no `enter`) at `demoTimeline.cutPoint`, in the same window style.
- **Timeline:** everything after the slot moves back automatically, and B's last frame becomes the phone's held
  background.
- **URL pill:** `project.partBDomain ?? project.domain`. `partBDomain` stays null until the owner confirms the desk host
  may be shown. A per-segment `url` also exists.
- **Hand-off contract:**
  - Same 1440×900 DSF 2 viewport.
  - The first B capture opens on the Admin click.
  - Its cursor starts at `cursor.start.fromShot: "4-menu"`. Discount's was (344.8, 542.1), the hand on the Admin row,
    held at 1.8×.
  - Unconfirmed desk data (names, prices, VINs) uses demo data or never enters the frame. Never blur it.
  - `ios_success` is reserved for this segment.

**Hazards nobody has rendered yet.** Check each with `verify.sh` (luma scan, the stills at `cutpoint-*` and
`partB-*`):

- (a) **Black-frame risk.** Part A's Sequence ends exactly at `cutPoint`, and a fresh B `DesktopScene` mounts on that
  frame. That is the same fresh-mount pattern that once rendered one black frame at the phone cut.
- (b) **Pop at the cut.** B's `windowPose` restarts from its own frame 0: the breathing phase resets, and the push
  follows B's camera. A ends at 1.8× (window ×1.10). Unless B's first frame has the same zoom active, the window and the
  content pop.
- (c) **No crossfade.** The A→B boundary is always a hard cut, because xfade works only inside one `DesktopScene`.
- (d) **Whoosh repeats.** The whoosh variant rotation restarts in B.

The recipe for part B is added after its first production use. Do not invent one.

## 16. Known open items

These are not decisions.

- **`theme.ease.in`** is easeInExpo-like (0.7, 0, 0.84, 0) and drives the outro exit, `FinalFade`, the phone exit and
  the cursor/ripple fades. On the approved film the final fade still holds about 40% of its brightness at f1475 (YAVG
  27.1), then reaches black at f1476, so it reads as a quick ~3-frame pop. A critic's fix was a cubic-in
  `bezier(0.32, 0, 0.67, 0)` for opacity and blur exits. The user approved v1 as it is, so change it only if they ask.
- **No separate SFX stem** is produced for when music is added. Only the mixed MP4 exists.
