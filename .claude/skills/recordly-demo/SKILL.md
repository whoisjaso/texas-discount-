---
name: recordly-demo
description: Make a polished product demo video of a website or web app in the style of Recordly / Screen Studio, which looks like a macOS screen recording: the page inside a macOS window on a soft wallpaper, smooth auto-zooms that follow the cursor, a spring-smoothed cursor with click bounce, light motion blur, iPhone frame for the phone cut, and native iOS sound effects. Use whenever the user asks for a demo video, walkthrough, product reel, "screen recording" ad, or a video showing a site or the admin desk, including "make it look like a Mac screen recording" or "use Recordly". Pairs with remotion-motion-graphics (load it first) and the jason-video-editor sound kit.
---

# Recordly-style demo videos

Recordly (github.com/webadderallorg/Recordly) is a desktop recorder. It
cannot run in a headless build container, and its code is AGPL-3.0, so we
**do not copy its code**. We reproduce its *look* with our own pipeline and
use its published defaults as tuning reference only:

| Recordly default | Value we use |
|---|---|
| zoom depth (default level 3) | 1.8× (levels: 1.25, 1.5, 1.8, 2.2, 3.5) |
| zoom-in transition | ~1.5 s, ease-in-out (cubic, slow start, long settle) |
| zoom-out transition | ~1.0 s |
| cursor | spring-smoothed (smoothing ≈0.67), size ≈2.5× the OS arrow at 1080p |
| click | bounce: scale to 0.82 and back over 350 ms, plus a soft ring |
| zoom motion blur | light (≈0.35): blur only while the camera moves, ≤2 px at 1080p |

## The pipeline

```
storyboard.json  →  capture (deterministic frames)  →  shots/*.mp4 + cursor tracks
                 →  Remotion composition (window, wallpaper, zoom, cursor, SFX)
                 →  render 1920×1080 (+ 1080×1920 cut)  →  VERIFY stills  →  deliver
```

1. **Storyboard first** (`storyboard.json`): ordered shots. Each shot names a
   URL, a viewport (1440×900 desktop or 390×844 phone at deviceScaleFactor 2),
   and timed actions (`scrollTo`, `hover`, `click`, `type`, `wait`) in seconds,
   with zoom regions (`{at, to, until, depth, focus: selector|point}`) and SFX
   cues. Keep the story short: 45–75 s total, one idea per shot, nothing on
   screen for more than ~4 s without movement.
2. **Capture deterministically** (`scripts/capture.cjs`): Chromium via
   Playwright plus the DevTools virtual-time policy, so time advances exactly
   1/30 s per frame and every CSS transition, intro loader and scroll is
   recorded smoothly no matter how slow the screenshot is. Scroll with eased
   `window.scrollTo`, never the wheel. Write PNG frames, then
   `ffmpeg -framerate 30 -i %05d.png -c:v libx264 -crf 12 -pix_fmt yuv420p`.
   The real cursor is never captured: the script writes the **cursor track**
   (x, y and click events per frame, in page pixels) from the same action
   list, and Remotion draws the cursor.
3. **Compose in Remotion** (follow remotion-motion-graphics' rules: theme
   object, springs, no linear easing, grain and vignette on top):
   - *Wallpaper*: the brand's dark gradient mesh with slow drift and grain.
   - *macOS window*: 12 px radius, hairline border, large soft shadow, title
     bar with the three traffic lights and a centred URL pill showing the
     real domain. Window enters with a spring (scale 0.94→1, y 30→0, opacity).
   - *Camera*: the shot video inside the window; zoom regions scale around the
     focus point with the Recordly timings above; the camera eases to follow
     the cursor while zoomed, clamped so the frame never shows past the page.
   - *Cursor*: macOS arrow (drawn as SVG), position from the track through a
     spring, click bounce and ring; hide it while the page scrolls by itself.
   - *Phone cut*: an iPhone frame (rounded 55 px, dynamic island, side buttons
     drawn in SVG) holding the 390-wide capture; tap ripples instead of a cursor.
   - *Titles*: few and short, the site's own font, Title Case, one line each.
4. **Sound** (no music unless asked; the user adds a track): the
   jason-video-editor kit, `assets/sfx/ios/*` and `assets/sfx/ui/*`, copied
   into `public/sfx/`. Map: click → `ios_tink` (-12 dB); typing → one
   `macbook_keyboard` hit per character (-18 dB, randomised ±1.5 dB);
   window/menu open → `open_ui`; zoom in → `whoosh` (-20 dB, very short);
   success (N / N signed, form filed) → `ios_success`; intro logo → `ios_note`;
   outro → `ios_received`. Apple's system sounds are Apple's: fine for demos,
   swap to the kit's non-Apple clicks for paid ads.
5. **Render** `npx remotion render ... --codec h264 --crf 17` with
   `--browser-executable=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`.
   Delete `/tmp/remotion-webpack-bundle-*` after still runs.
6. **Verify** (mandatory): stills at every shot change and mid-zoom; check
   the cursor lands on the thing clicked, zooms never reveal past the page
   edge, text is crisp at 100% (capture at deviceScaleFactor 2 if not), no
   frame shows a loader or blank page by accident, audio peaks under -1 dBFS.
   Then send the MP4.

## Files

- `scripts/capture.cjs` — storyboard shot → frames + cursor track.
- `template/` — the Remotion project (Wallpaper, MacWindow, IPhone, Camera,
  Cursor, Sfx, theme).
- `examples/discount-used-cars/storyboard.json` — the first production use.

## Capture: how to run it, and what we learned

```bash
node scripts/capture.cjs --selftest --dsf 1,2 --out $SCRATCH/selftest   # site must be served on :5183
node scripts/capture.cjs --storyboard sb.json --shot 2-scroll --out $SCRATCH/captures/2-scroll \
     --publish <project>/public/shots --clean     # → public/shots/<id>/{shot.mp4,cursor.json}
```
Capture shots in storyboard order: `cursor.start.fromShot` starts a shot where the
previous capture's cursor ended. Negative action times run in the preroll
(e.g. re-type a field so the next shot matches the last). `clock` pins the
page's wall clock (anything time-based, like "Open now", renders the same).

- **Rendering is BeginFrameControl, not screenshots.** `Page.captureScreenshot`
  under paused virtual time deadlocks intermittently (drawer transitions, async
  image decodes, mouse input). The script launches the headless shell with
  `--deterministic-mode`, creates the page with `enableBeginFrameControl` and
  renders each frame with `HeadlessExperimental.beginFrame` at
  `virtualTimeTicksBase + elapsed`. Frames sit on an exact 1/30 s grid.
- **DSF needs two switches here**: Playwright's `deviceScaleFactor` (sets
  `devicePixelRatio`) *and* `--force-device-scale-factor` (sets the rendered
  surface). With only one you get a 1x picture or a 1x page.
- **Input order**: queue mouse/keys, advance time, render, *then* await the
  acks (mouse moves are rAF-aligned; awaiting them before a frame hangs).
- **Determinism** (self-test): page clock exactly 33.333 ms/frame, identical
  cursor track, frames identical or within raster noise (PSNR ≥ 55 dB).
- **DSF 2 for desktop shots**: the window shows the page ~1490 px wide and
  zooms to 1.8x; DSF 1 text goes soft there. ~0.2 s/frame, ~2.5 GB of PNGs
  per 15 s shot before `--clean`.

## Template: how to use it

`cp -r template/. clients/<name>-demo/ && cd clients/<name>-demo &&
scripts/prepare-sfx.sh && npm install`; copy the brand logos to
`public/brand/` and the site font's woff2 files to `public/fonts/`; fill in
`src/project.ts` (domain, logo paths, the confirmed facts). Compositions:
`Intro`, `Outro`, `ShotPreview` / `PhonePreview` (any capture, via
`--props='{"shot":"<id>","url":"<domain>"}'`). Build the film from
`ShotScene` (window + camera + cursor + auto SFX, `trimSec`, `enter`, `exit`)
and `PhoneScene` (`behind` = the receding desktop) in `<Series>`. Check stills
with `node scripts/stills.cjs out/stills Comp:frame,frame …` (bundles once,
deletes its webpack bundle).
