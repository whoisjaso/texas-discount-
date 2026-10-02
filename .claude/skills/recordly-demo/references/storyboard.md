# Storyboard reference

A storyboard is one JSON file: the shots `scripts/capture.cjs` records, plus documentation fields for the people
reading it. For a dealer site you never write one from scratch. `scripts/new-project.sh` fills the house storyboard,
`assets/storyboard-dealer-site.json`, from `client-inputs.json`, and you adapt only the marked placeholders (last
section). `examples/discount-used-cars/storyboard.json` is the approved film's storyboard.

## Contents

- [Running the capture](#running-the-capture)
- [Top-level fields](#top-level-fields)
- [Shot fields](#shot-fields)
- [Actions](#actions)
- [Zooms](#zooms)
- [What capture.cjs writes: cursor.json](#what-capturecjs-writes-cursorjson)
- [Composition side: DesktopSegment in timeline.ts](#composition-side-desktopsegment-in-timelinets)
- [Adapting the house storyboard to a new dealer](#adapting-the-house-storyboard-to-a-new-dealer)

## Running the capture

```bash
node scripts/capture.cjs --storyboard sb.json --shot 2-scroll --out $SCRATCH/captures/2-scroll \
     --publish clients/<slug>-demo/public/shots --clean
node scripts/capture.cjs --selftest --dsf 1,2 --out $SCRATCH/selftest [--clock ISO]   # site served on :5183
```

| Option | Meaning |
|---|---|
| `--storyboard F --shot ID` | Capture one shot. The shot must have a `url`; shots without one are drawn in Remotion. |
| `--shot-file F` | Capture a standalone shot JSON (no storyboard-level `introKey`, `clock`, `timezone` or `captureCss`). |
| `--out DIR` | Required. Frames go to `DIR/frames/`, plus `DIR/shot.mp4` and `DIR/cursor.json`. |
| `--base URL` | Site origin. The default is `storyboard.base`, then `http://localhost:5183`. |
| `--dsf N` | Overrides the shot's deviceScaleFactor. |
| `--publish DIR` | Copies `shot.mp4` and `cursor.json` to `DIR/<id>/` when done. |
| `--clean` | Deletes the PNG frames after the MP4's frame count is verified. Always use it: a DSF 2 shot is about 4 MB per frame. |
| `--no-encode` | Frames and cursor.json only. |
| `--preset P` | x264 preset (default `medium`). |
| `--selftest` | The determinism self-test: a 4 s hero shot at each `--dsf`, plus a repeat. It needs a premium-dealer-build site, since it uses `.loader` and `.hero__title`. |
| env `CAPTURE_FLAGS` | Extra Chromium flags. |
| env `CAPTURE_DEBUG=1` | Verbose logging. |

Capture the shots **in order**, because `fromShot` reads the previous capture's cursor.json (from the sibling `--out`
folder or from `--publish`).

## Top-level fields

**Read by `capture.cjs`:**

| Field | Example | Meaning |
|---|---|---|
| `base` | `"http://localhost:5183"` | The site origin; `--base` overrides it. |
| `introKey` | `"discount.intro.seen"` | The sessionStorage key the site's loader sets: `SEEN_KEY` in `Loader.tsx`. `measure-site.cjs` finds it. It is required for any `presetIntroSeen` shot; there is no default, so another client's key can never replay a loader. |
| `clock` | `"2026-09-30T14:00:00-05:00"` | The page's wall clock at load (`initialVirtualTime`). Pick an open weekday mid-afternoon with the correct DST offset, so "Open Now" renders. |
| `timezone` | `"America/Chicago"` | The page's time zone (the default). |
| `captureCss` | `{ "why": "…", "css": "…" }` or a string | Video-only CSS injected into every shot, before the shot's own `css`. If a shot's `css` already contains it (as in the Discount storyboard, written before this was automatic), it is not added twice. |
| `shots` | `[…]` | The shots, in film order. |

**Documentation only.** `timeline.ts` and `Demo.tsx` are the authority for these: `project`, `title`, `notes`,
`template`, `serve`, `capture`, `fps`, `size`, `window`, `facts`, `sfx`, `totalSec`.

## Shot fields

| Field | Default | Meaning |
|---|---|---|
| `id` | required | Folder name in `public/shots/`. The house ids are `1-hero`, `2-scroll`, `3-buy`, `4-menu` and `5-phone`; `timeline.ts` and `Demo.tsx` use them. |
| `url` | required to capture | A path on `base`, or an absolute URL. |
| `viewport` | `{1440, 900, deviceScaleFactor: 1}` | The house uses DSF **2** for every shot: desktop 1440×900, phone 390×797. |
| `mobile` | `false` | `true` sets isMobile + hasTouch; the cursor kind becomes `touch` and scrolls become swipes. |
| `presetIntroSeen` | `false` | Sets `sessionStorage[introKey] = "1"` before load, so the loader is skipped. In the house cut it is false only for `1-hero`. |
| `introKey`, `clock`, `timezone` | from the storyboard | Per-shot overrides. |
| `durationSec` | 4 | Captured length (frame 0 to the end). |
| `prerollSec` | 0 | Virtual time run before frame 0 and not captured. It is raised automatically to cover the earliest negative `t`. |
| `readySelector` | none | The warm-up also waits for this selector (and for fonts, `load` and visible images). `.loader` for shot 1, `.hero__title` otherwise. |
| `css` | `""` | Extra CSS for this shot, after `captureCss`. Use `visibility: hidden` to hide content, never `display: none`. |
| `cursor.kind` | `pointer` (`touch` if mobile) | `pointer`, `touch` or `none`. |
| `cursor.start` | pointer: (vw + 80, vh + 60) | Either `{x, y}` in viewport CSS px, or `{fromShot: "<id>", x, y}` to start where that capture's cursor ended (x/y are a fallback). |
| `actions` | `[]` | See below; sorted by `t`. |
| `zooms` | `[]` | See below. |
| `track` | `{}` | `{name: selector}` or `{name: {selector, contains, nth, tight}}`: extra rects recorded per frame into `cursor.json.tracks`. |
| `describe`, `why`, `scene`, `cutAfter`, `kind`, `composition` | | Documentation only. |

## Actions

Every action starts at `t` (seconds from frame 0). A negative `t` is a set-up action that runs in the preroll, for
example re-typing a field so this shot matches the end of the last one.

**Targeting.** Pointer actions (`moveTo`, `hover`, `click`) and `scrollTo` can target a selector:

| Field | Meaning |
|---|---|
| `selector` | A CSS selector. |
| `contains` | A case-insensitive text filter. |
| `nth` | Picks the n-th match (default 0). |
| `anchor` | `[fx, fy]` within the element's rect (default `[0.5, 0.5]`). |
| `tight` | Use the union of the element's glyph boxes rather than its box. Block children otherwise span the full width. |

| `type` | Fields | Behaviour |
|---|---|---|
| `scrollTo` | `selector` (+ targeting) or `y`; `align` `start`/`center`/`end`; `offset` (px, subtracted); `durationSec` (default clamp(0.8 + dist/2600, 0.8, 2.4)); `cursor` `hide` (default) or `keep` | An eased `window.scrollTo`, bezier(0.65, 0, 0.35, 1). Never the wheel. The drawn cursor hides while the page scrolls itself. |
| `scrollBy` | `y`, and the same options | A relative scroll. |
| (swipe) | on a mobile shot, or with `touch: {x, y}`: `dragSec` (0.3), `tauSec` (0.32), `durationSec` (default drag + 4.5τ) | An iOS swipe: the finger drags 1:1, lets go, and the page coasts. A `touch` event is recorded for the finger ripple. |
| `moveTo` | `x`, `y`; `durationSec` (default clamp(0.55 + dist/1600, 0.6, 1.3)); `bow` (0.12) | A minimum-jerk pointer move along a gently bowed curve. |
| `hover` | targeting, `durationSec`, `bow` | A move onto an element; `:hover` begins when it lands. |
| `click` | targeting, `durationSec` | The pointer travels, presses on arrival and releases 3 frames later. On a touch shot it is a tap with no travel. |
| `type` | `text`; `perCharSec` (0.12, ±25% seeded jitter) or `durationSec` (even spacing, no jitter) | One key event per character. The pointer hides until the next move. |
| `press` | `key`: `Enter`, `Escape`, `Tab`, `Backspace`, `ArrowDown`, `ArrowUp` | One key. |
| `wait` | | A no-op marker. |

`why` and `adapt` on an action are documentation.

## Zooms

```json
{ "at": 3.6, "until": 6.0, "depth": 2.0, "focus": { "x": 375, "y": 385 }, "follow": false, "why": "…" }
```

| Field | Default | Meaning |
|---|---|---|
| `at` | required | The zoom-in starts here (seconds). Keep it within ±0.3 s of the action it goes with. |
| `until` | `null` | When the zoom-out starts; `null` holds to the end of the shot (the 4-menu hold into the cut point). |
| `depth` / `level` | level 3 = 1.8 | The scale, or a Recordly level 1–5 → [1.25, 1.5, 1.8, 2.2, 3.5]. |
| `focus` | the cursor | A selector (tracked every frame, with `contains`, `nth`, `tight`, `anchor`), a fixed point `{x, y}` in viewport CSS px, or `"cursor"`. |
| `follow` | true for a cursor focus, else false | Lean 35% toward the cursor while zoomed. Use `false` with a fixed point when framing matters. |
| `inSec` / `outSec` | 1.5 / 1.0 | Do not change these: they are the Recordly timings and the whoosh placement assumes 1.5. |
| `sfx` | true | `false` silences this zoom's whoosh. |

The view at full depth is `vw/depth × vh/depth`, centred on the focus and clamped to the viewport. At 2.0 that is
720×450 on a 1440×900 page.

## What capture.cjs writes: cursor.json

Per shot, next to `shot.mp4` (2880×1800 or 780×1594, h264 CRF 12, bt709 tv range):

| Key | Meaning |
|---|---|
| `id`, `url`, `fps`, `frameCount`, `viewport`, `mobile`, `pageHeight`, `maxScroll`, `prerollSec`, `clock`, `warmupMs`, `stalls`, `errors` | Run facts. `errors` lists page errors; read them. |
| `cursor` | `{kind, hiddenAtStart}`. `hiddenAtStart` means the preroll ended with typing. |
| `frames[]` | `{x, y, down, scrollY, vt, c}` per frame. x/y are viewport CSS px; `vt` is the page's `performance.now()`; `c` is the pointer shape (`a`/`p`/`t`). |
| `events[]` | `click {frame, x, y}`, `tap`, `type {char}`, `key {key}`, `scroll {frame, endFrame, fromY, toY, cursor}`, `touch {frame, endFrame, x, y}`. |
| `zooms[]` | `{startFrame, inFrames, outFrame, outFrames, depth, follow, focus: {track, anchor, points[]} or {point} or {cursor}, sfx}`. |
| `tracks` | The extra rects from `track`. |
| `video` | `{file, width, height}` after encoding. |
| `screenEdges` | Mobile only: `{top: [[r,g,b]…], bottom: …}`, the page's colour along each edge per frame (status-bar tint, home indicator). |

Remotion draws the cursor, camera, clicks, ripples and sounds from this file. The OS cursor is never captured.

## Composition side: DesktopSegment in timeline.ts

The running order is code: `src/demo/timeline.ts`. Each desktop capture is one `DesktopSegment`:

| Field | Meaning |
|---|---|
| `shot` | The capture id. |
| `trimSec` | Capture seconds skipped at the start. Shot 1's trim is derived from the loader (house-recipe §1). |
| `durationInFrames` | `sec(storyboard durationSec)`. |
| `url` | Overrides the URL pill for this segment (part B, once the host is confirmed). |
| `cues` | Extra `{frame, file, db, maxSec?}`, with frames relative to the segment start. |
| `eventCues` | `{type, index, file, db, offsetSec}`: a sound on the n-th event of a type. For example, the drawer's `open_ui` on click #0, +1 frame. |
| `zoomFocus` | `{[zoomIndex]: {point, follow?, depth?}}`: re-aims a captured zoom without recapturing. It is unused in the approved film. |

Clicks, keys and whooshes are derived automatically from cursor.json (`Sfx.shotCues`). The four film-level cues (intro,
window, phone, outro) are in `Demo.tsx`.

## Adapting the house storyboard to a new dealer

All premium-dealer-build sites share these hooks:

- `.loader`
- `.hero__title`
- `section.band--black:not(.glass-band) .band__title`
- `a.model[href="/inventory?body=X"]`
- `.lineup + .band__fine`
- `.split-card` and `.split-card__hours`
- `#finder-q`
- `.glass-band .band__title` and `.glass-band .teasers a.tile`
- `.header__menu`
- `.drawer__link--admin`

The house storyboard keeps these selectors and all timings verbatim. What differs per site are the placeholders below,
in `client-inputs.json` → `storyboard`. Each also carries an `adapt` note in the template.

| Placeholder | Discount value | What it is | How to set it |
|---|---|---|---|
| `HERO_ANCHOR` | `[0.75, 0.72]` | Where the cursor rests, as a fraction of the headline's tight glyph box | Just right of line 2's last letter. Check a 1:1 crop of the 1.5× zoom. |
| `BODY` | `Truck` | The featured lineup card | A body type in stock. Truck and SUV sit in the left column. |
| `BODY_FOCUS` | `{x 375, y 385}` | The 2.0× focus on that card | Keep it for a left-column card. Re-measure for Sedan or Coupe, or when the card's chip shows a price (the price must be fully out). |
| `HOURS_FOCUS` | `{x 400, y 422}` | The 1.8× focus on the visit card | The card's centre after its scroll. Re-measure if the card copy is longer or shorter. |
| `FINDER_QUERY` | `F-150` | Typed into the finder in shots 2 and 3 | A model in stock, about 5 characters. A longer query ends later: keep its last key 45–60 frames before shot 2 ends. |
| `SERVICE_TILE` | `We buy trucks` | The middle service-band tile (`contains`) | Its label text. Confirm it has no price or claim. |
| `SERVICE_FOCUS` | `{x 740, y 623}` | The 2.0× focus on the tile row | **Always re-measure**: the band's photo or widget moves the row. Centre a 720×450 view on the tiles, with the outer neighbour's label fully out. |
| `SERVICE_JIGGLE_X/Y` | `726 / 622` | Shot 4's set-up jiggle | A few px from shot 3's last cursor point (its cursor.json last frame). |
| `PHONE_SWIPE_2/3` | `430 / 450` | The phone's 2nd and 3rd swipe distances | So the featured card rests fully in frame and the fine print below stays out. |

Top-level values (`DOMAIN`, `DESK_URL`, `INTRO_KEY`, `CLOCK`, `TIMEZONE`, `SITE_DIR`, `SLUG`, `CLIENT`, `FACTS`) come from
`client-inputs.json` directly.

**How to measure the placeholders:**

1. Build and serve the site (SKILL.md, step 3).
2. Run `node scripts/measure-site.cjs --storyboard clients/<slug>-demo/storyboard.json`. It replays each shot at its
   viewport and prints each zoom's view rectangle, the text lines its edges cut, and any price or rating text inside a
   zoom or on a shot's last frame. Discount's approved storyboard prints all OK.
3. Adjust the placeholder in `client-inputs.json`, then refill with
   `node scripts/fill-client.cjs storyboard client-inputs.json assets/storyboard-dealer-site.json --out clients/<slug>-demo/storyboard.json`.
4. Repeat until clean.
5. After capturing, the zoom stills from `verify.sh` are the final word: the preflight replays instantly and ignores
   follow zooms.

Change a timing (`t`, `durationSec`, `at`, `until`) only when the page forces it, for example a longer query, and then
re-check the cut stills and the pacing rules (house-recipe §1).
