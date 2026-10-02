# Verification: the gates before anyone sees the film

A demo that glitches on one frame looks broken. The defects found while making part A were each visible on only 3–5
frames, or only in a full render, never in single stills. So verification is partly numbers and partly looking, at
fixed moments. Nothing is sent until every gate below passes and every still has been looked at.

All of it is scripted. Every frame number is derived from the project's own `timeline.ts`, `Sfx.tsx`, camera and
window code (bundled with the project's esbuild) and from each capture's `cursor.json`. So the checks follow the film
when timings change or part B goes in.

```bash
S=.claude/skills/recordly-demo/scripts
node $S/verify-film.cjs --project clients/<slug>-demo --plan                    # 0. the plan: timeline, stills, cuts, cues
node $S/verify-film.cjs --project clients/<slug>-demo --cuts-only --out $SCRATCH/cuts   # 2. after capture, before rendering
$S/verify.sh clients/<slug>-demo out/demo-v1.mp4 $SCRATCH/verify-v1             # 4. after rendering: every gate
```

`verify.sh` exits 0 only when every gate passes. Its output folder holds:

- `stills/` (about 46 labelled frames)
- `contact-sheet.png`
- `cuts/` (last | first | diff×8 for every cut)
- `yavg.txt`
- `report.json`

Calibration: the approved Discount film passes every gate with the numbers quoted below (2 min 17 s on this container).

## Contents

- [1. Before capture](#1-before-capture)
- [2. After capture, before rendering](#2-after-capture-before-rendering)
- [3. Before rendering](#3-before-rendering)
- [4. After rendering: numeric gates](#4-after-rendering-numeric-gates)
- [5. After rendering: the stills to look at](#5-after-rendering-the-stills-to-look-at)
- [6. What to do with a failure](#6-what-to-do-with-a-failure)

## 1. Before capture

| Check | Command | Pass | Catches |
|---|---|---|---|
| Capture determinism | `capture.cjs --selftest --dsf 1,2` (site on :5183) | 120 frames exactly; page clock 33.333 ms ±0.25 per frame; cursor speed spike ≤ 1 px, peak/mean ≤ 2.2, max < 120 px/frame; no flat frame; loader dark in ≥ 45 of the first 60 frames; hero in all of the last 15; repeat capture min PSNR ≥ 50 dB and cursor ≤ 0.5 px | A broken browser, virtual-time drift, a non-deterministic site. Observed: 91/120 frames byte-identical, min 55 dB, peak 1.87× mean. |
| Loader, intro key, Open Now | `measure-site.cjs --into client-inputs.json` | The loader is found; `wordDoneSec` ≈ 1.5; an intro key is found; the status pill reads "Open now" at the clock | A wrong clock or DST offset, a missing SEEN_KEY, a loader that differs from the premium-dealer-build one |
| Storyboard preflight | `measure-site.cjs --storyboard storyboard.json` | No missing selectors; fixed-focus zooms report OK (no edge cuts); no price, rating or finance text in a zoom or on a shot's last frame | Renamed selectors, a different layout, priced inventory in the lineup, an unadapted `SERVICE_FOCUS` |

## 2. After capture, before rendering

| Check | Pass | Catches |
|---|---|---|
| Each capture's frame count | `capture.cjs` verifies the ffprobe count equals `frameCount` and throws otherwise | A truncated encode |
| `cursor.json` `errors` | Empty, or explained | Page errors during capture |
| Cut pixels (`--cuts-only`) | Last frame of capture N vs first frame of capture N+1: PSNR ≥ 45 dB. Look at `cuts/*_diff_x8.png` | A mismatched hand-off (hover, caret, reveal tail, scroll). Discount: 45.1 (the site's bobbing scroll arrow) / 55.4 / 51.1 dB |
| Cut cursor (`--cuts-only`) | Same cursor point (≤ 0.5 px), same scrollY, same pointer shape | A cursor jump, or a scroll a few px off |

PSNR alone cannot see a 2 px caret. The diff image can, so look at it.

## 3. Before rendering

`scripts/render.sh` runs these and stops on a failure:

- Every file the film reads exists: `theme.sfx` and font files, `project.mark` and `logoReverse`, and each segment's
  `shot.mp4` and `cursor.json`.
- `project.loader` is not the template placeholder.
- `npx tsc --noEmit` passes, run in the foreground.

## 4. After rendering: numeric gates

| Gate | Pass | Catches |
|---|---|---|
| Video stream | h264, 1920×1080, 30/1 | A wrong composition or codec |
| Frame count | ffprobe counted frames = `timeline.total` (Discount: 1477 = 49.233 s) | A wrong composition length, dropped frames |
| Audio stream | AAC present | A silent render |
| Luma scan | Per-frame `signalstats` YAVG; no one-frame spike (both neighbours differ by > 10 in the same direction while they agree within 6) | Mount, decode and remount glitches that only a full render shows, like the black frame at the phone cut. Discount: none. |
| Last frame black | YAVG < 20 (Discount: 16.9) | An ending that cuts instead of fading |
| Cuts | As in section 2, again from the captures | Same |
| White level | At 1× camera, three 30×30 boxes near the bottom edge of the page (left, centre, right), away from the cursor: where the capture is white (≥ 250), the render must be within 4 levels | A grade, vignette or overlay drawn over the recording (v0's whites fell to 187–228). Discount: 255 → 255. |
| Audio peak | True peak < −1 dBTP and max ≤ −1 dBFS (`ebur128=peak=true`, `volumedetect`) | Clipping on phone speakers. Discount: −4.8 dBTP, −17.3 LUFS. |
| Onset map | Per-frame peak (1470-sample windows at 44.1 kHz). An onset is > −55 dB and rising > 9 dB over the previous 3 frames. Every onset must fall within −1…+12 frames of a cue the composition plays | A sound with nothing on screen (the `open_ui` tail tick). Discount: 30 onsets, all on 18 cues. |
| Isolated blips | No frame > −60 dB with 4 frames < −80 dB on each side | Stray ticks in silence |

When a spike or onset has been looked at and is explained by page content, allow it explicitly with
`--allow-spikes 812` or `--allow-onsets 1450`, and say so in the report to the user.

## 5. After rendering: the stills to look at

Extract film frame f with `ffmpeg -ss (f − 0.5)/30`. A plain f/30 returns the next frame. `verify.sh` does this, and
grabs the last frame with `-sseof`.

| Label | Frame (Discount) | Derived from | Look for |
|---|---|---|---|
| `intro-1.0s` | 30 | 1.0 s | The mark and letters mid draw-in; the wallpaper is neutral grey, with no banding |
| `handoff-start` / `handoff-mid` / `sting-landed` / `sting-dissolved` | 42 / 49 / 56 / 60 | `intro.handoffAt`, midpoint, `landAt`, `landAt + fadeFrames` | ONE logo on screen at every frame; the sting lands exactly on the loader; no jump at the dissolve |
| `hero-curtain` | 100 | segment 1 + capture 3.0 s | The loader's curtain lifting on the hero |
| `<shot>-zoom<k>-<depth>x` | 175, 397, 550, 688, 868, 1036 | zoom start + 45 + 6 | Full depth: no edge through text, labels fully in or out, one red element at most, crisp text at 100%, the window leaning in |
| `cut<i>-minus0.3` / `-last` / `-first` / `-plus0.3` | 229/237/238/247, 739/747/748/757, 910/918/919/928 | each in-window cut | last = first; no soft frame, no jump |
| `<shot>-between-scrolls-no-cursor` | 295 | midpoint between merged self-scrolls | No cursor blinking in the gutter |
| `<shot>-click<k>-ring` / `-after` | 669/693, 966/990 | click + 2, click + 26 | The ring is visible on white and on black; the drawer is open after the Menu click |
| `<shot>-typed-no-pointer` | 692 | last typed key | The query typed, the pointer hidden, no blue × |
| `cutpoint-minus0.3` / `cutpoint-last-desktop` | 1090 / 1098 | `cutPoint` | Held at 1.8× on the Admin row, the hand cursor on it |
| `partB-first` / `partB-last` | (when part B exists) | `desktopB` | No black frame; no window or zoom pop at the A→B cut |
| `phone-first` / `-enter-2` / `-enter-5` / `-plus0.3` | 1099 / 1101 / 1104 / 1108 | `phone.from` | The phone is opaque by frame 2; motion blur; the desktop recedes behind, never black |
| `phone-swipe1-drag` | 1164 | first touch + 5 | The finger disc reads on the page; the finger rides with the content |
| `phone-mid` | 1302 | 75% in | The status bar is tinted like the page top; the home indicator is visible |
| `phone-exit-start` / `-mid` / `-late` | 1356 / 1362 / 1366 | phone end − 13, − 7, − 3 | An accelerating drop with blur; the outro is UNDER the phone, with no double exposure |
| `outro-under` / `outro-logo` / `outro-lines` / `outro-exit` | 1369 / 1372 / 1420 / 1460 | outro start + 6, + 9, + 1.9 s; end − 0.57 s | Logo, then only the confirmed facts, readable (42/30 px); a clean exit |
| `last-frame` | 1476 | total − 1 | Black |

Also look at these, by eye:

- Text is crisp at 1:1 at rest and at 1.8×. Open the zoom stills at 100%.
- The cursor lands on what it clicks, and it never sits on a glyph.
- No frame shows an unconfirmed fact, a price, a rating, a review or finance terms.
- Watch the whole MP4 once at speed, with sound.

## 6. What to do with a failure

- **Cut PSNR below 45 dB.** Look at the diff image. A reveal tail, a hover or the caret means re-staging the next
  shot's preroll (lessons C8, C9). The site's own animation in a corner may be acceptable at about 45 dB.
- **Luma spike.** Inspect the frame and its neighbours. A black or empty frame is a mount glitch (lesson P4); fix the
  composition, do not allow it.
- **Unexplained onset.** Find the cue file playing there and trim it (lesson A1), or move the cue onto its event.
- **White level.** Something is drawn over the recording; move it onto the backdrop (lesson P1).
- **Frame count.** `timeline.ts` and the render disagree, or a capture is too short.

After a fix, re-render and run the gates again. Diff the new stills against the previous run's, and confirm that only
the intended frames changed.
