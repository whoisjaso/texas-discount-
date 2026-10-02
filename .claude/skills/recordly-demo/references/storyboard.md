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
folder or from `--publish`). Re-capturing shot N therefore means re-capturing every later desktop shot too.
`capture.cjs` refuses a shot that still holds a double-brace placeholder or a non-number where a number belongs.

## Top-level fields

**Read by `capture.cjs`:**

| Field | Example | Meaning |
|---|---|---|
| `base` | `"http://localhost:5183"` | The site origin; `--base` overrides it. |
| `introKey` | `"discount.intro.seen"` | The sessionStorage key the site's loader sets: `SEEN_KEY` in `Loader.tsx`. `measure-site.cjs` finds it. It is required for any `presetIntroSeen` shot; there is no default, so another client's key can never replay a loader. |
| `clock` | `"2026-09-30T14:00:00-05:00"` | The page's wall clock at load (`initialVirtualTime`). Always Wednesday 2026-09-30 at 14:00 in the dealer's zone with that day's UTC offset (the next open weekday at 14:00 if the dealer is closed on Wednesdays), so "Open Now" renders. `fill-client.cjs check` enforces 14:00. |
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
| `rest` | none | Read by `measure-site.cjs` only: where a phone shot comes to rest. `{target, below, gap: [min, max], aim, out: []}`: the target's top sits `gap` px under the `below` element (the header) and every `out` element is below the screen. |
| `describe`, `why`, `cssWhy`, `scene`, `cutAfter`, `kind`, `composition` | | Documentation only. |

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
| `moveTo` | `x`, `y`, or `fromShot` + `dx`, `dy` (that capture's last cursor point + the offset, rounded); `durationSec` (default clamp(0.55 + dist/1600, 0.6, 1.3)); `bow` (0.12) | A minimum-jerk pointer move along a gently bowed curve. The `fromShot` form is shot 4's set-up jiggle; it fails if that capture does not exist yet. |
| `hover` | targeting, `durationSec`, `bow` | A move onto an element; `:hover` begins when it lands. |
| `click` | targeting, `durationSec` | The pointer travels, presses on arrival and releases 3 frames later. On a touch shot it is a tap with no travel. |
| `type` | `text`; `perCharSec` (0.12, ±25% seeded jitter) or `durationSec` (even spacing, no jitter) | One key event per character. The pointer hides until the next move. |
| `press` | `key`: `Enter`, `Escape`, `Tab`, `Backspace`, `ArrowDown`, `ArrowUp` | One key. |
| `wait` | | A no-op marker. |

`why`, `adapt` and `override` on an action are documentation (`fill-client.cjs` writes `override: {field: why}` where
`client-inputs.json` → `overrides` changed a value).

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
| `frame` | none | Read by `measure-site.cjs` only: `{target, in: [], out: []}` (selectors, or `{selector, contains}`). Every `in` element must be wholly inside the view at full depth, every `out` element wholly outside; the suggested focus is searched from the target's centre. |

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
- `a.model[href="/inventory?body=X"]` (the lineup is always four square cards in two columns, SUV | Sedan over
  Truck | Coupe, whatever is in stock: a type with no stock keeps its card with "Ask about availability"; on the phone
  they stack in that order)
- `.lineup + .band__fine`
- `.split-card`, `.split-card__text` and `.split-card__hours`
- `#finder-q`
- `.glass-band .band__title`, `.glass-band__demo` and `.glass-band .teasers a.tile`
- `.header`, `.header__menu`
- `.drawer__link--admin`

The house storyboard keeps these selectors and all timings verbatim. What differs per site are the placeholders below,
in `client-inputs.json` → `storyboard`. Each also carries an `adapt` note in the template.

| Placeholder | Discount value | What it is | How to set it |
|---|---|---|---|
| `HERO_ANCHOR` | `[0.75, 0.72]` | Where the cursor rests, as a fraction of the headline's tight glyph box | Keep the house value. The preflight fails if the point lands on a glyph or not on the arrow; then pick the point just right of line 2's last letter from the glyph lines `--rects` prints, and check the `1-hero-zoom0` still at 100% (SKILL.md step 7b). |
| `BODY` | `Truck` | The featured lineup card | Truck if the dealer has trucks in stock, else SUV if it has SUVs, else Truck. Both sit in the left column. Never a right-column card unless the user asks. |
| `BODY_FOCUS` | `{x 375, y 385}` | The 2.0× focus on that card | Keep it. It frames either left-column card; the preflight checks the zoom's `frame` rules and prints a suggestion if they fail. |
| `HOURS_FOCUS` | `{x 400, y 422}` | The 1.8× focus on the visit card | Keep it. If the card copy is longer or shorter, the preflight fails the zoom and prints the suggested focus. |
| `FINDER_QUERY` | `F-150` | Typed into the finder in shots 2 and 3 | A model in stock, about 5 characters. A longer query ends later: keep its last key 45–60 frames before shot 2 ends, with an `override` (below). |
| `SERVICE_TILE` | `We buy trucks` | The middle service-band tile (`contains`) | Its label, copied exactly. No class (a) text (house-recipe §14) in the zoom; class (b) site copy goes in the README. If every tile carries class (a) text, stop and ask the user: the house cut has no recipe for it. |
| `SERVICE_FOCUS` | `{x 740, y 623}` | The 2.0× focus on the tile row | **Always measured.** Leave it null; the preflight with `--into` writes its suggestion (Discount: `{730, 621}`; both pass). |
| `PHONE_SWIPE_2/3` | `430 / 450` | The phone's 2nd and 3rd swipe distances | Keep them. The phone always rests on the Trucks card; the preflight checks the 5-phone `rest` rule (card top 55–70 px under the header, fine print below the screen) and prints the PHONE_SWIPE_3 that fixes it. Always three swipes. |

The jiggle at the start of shot 4 is not a placeholder: `moveTo {fromShot: "3-buy", dx: 6, dy: 2}` is resolved by
`capture.cjs` from the 3-buy capture (Discount: 3-buy ended at (720, 619.7), so (726, 622)).

Top-level values (`DOMAIN`, `DESK_URL`, `INTRO_KEY`, `CLOCK`, `TIMEZONE`, `SITE_DIR`, `SLUG`, `CLIENT`, `FACTS`) come from
`client-inputs.json` directly.

**How to measure the placeholders** (SKILL.md step 6):

1. Build and serve the site (SKILL.md, step 3).
2. Run `node scripts/measure-site.cjs --storyboard clients/<slug>-demo/storyboard.json --rects --into clients/<slug>-demo/client-inputs.json`.
   It replays each shot at its viewport and checks what the header of `measure-site.cjs` lists: missing selectors,
   UNSET placeholders, edge cuts and `frame` rules for every fixed zoom, class (a) text in a zoom or on a last frame,
   resting cursor points, and the phone's `rest`. `--rects` prints every rectangle it used. `--into` writes suggestions
   for UNSET placeholders and every zoom's text (`zoomCopy`, for the README).
3. For a set value that fails, copy the printed suggestion into `client-inputs.json` → `storyboard`.
4. Refill: `fill-client.cjs storyboard client-inputs.json assets/storyboard-dealer-site.json --out storyboard.json` and
   `fill-client.cjs readme client-inputs.json assets/project-README.md --out README.md`.
5. Repeat until it prints `PREFLIGHT CLEAN`. Discount's approved values print it.
6. After capturing, the zoom stills (step 7b, then `verify.sh`) are the final word: the preflight replays instantly
   and follow zooms are only approximate there.

**Timing changes.** Change a `t`, `durationSec`, `at` or `until` only when the page forces it (for example a longer
query), and only through `client-inputs.json` → `overrides`, so a refill keeps it and the README lists it:

```json
"overrides": [{ "shot": "2-scroll", "path": "actions.8.perCharSec", "value": 0.12, "why": "7-character query" }]
```

`path` is dot-separated into the filled shot, with array indexes as in the template. Then re-check the cut stills and
the pacing rules (house-recipe §1), and run every gate.
