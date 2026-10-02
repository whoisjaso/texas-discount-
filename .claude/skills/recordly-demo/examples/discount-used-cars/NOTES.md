# Discount Used Cars and Trucks: the approved film (part A)

| | |
|---|---|
| Project | `clients/discount-used-cars-demo` |
| Master | `out/demo-v1.mp4`: 1920×1080, 30 fps, 1477 frames, 49.237 s, 41.9 MB |
| Share copy | `out/discount-demo-part-a-preview.mp4`: CRF 23, 10.6 MB |
| Status | Approved by the user: "I love it, let's make this a skill … exactly this way" |

- `storyboard.json` is the capture storyboard as shipped. It predates the automatic `captureCss`, so each shot carries
  a pasted copy; `capture.cjs` does not add it twice.
- `client-inputs.json` holds the inputs that rebuild this project with `scripts/new-project.sh`.

## Reproduction check (done when the skill was locked)

1. **Project:** `new-project.sh examples/discount-used-cars/client-inputs.json <scratch>`
   - Produced a project whose `src/` differs from the shipped one only in comments: `project.ts` comments and one
     comment line in `theme.ts`. Every value is identical.
   - Every sound, font and logo file is byte-identical.
   - `tsc --noEmit` passes.
2. **Storyboard:** filling `assets/storyboard-dealer-site.json` with these inputs gives, for every shot, the same
   normalised capture instructions as `storyboard.json`: actions, zooms, viewport, clock, intro key and the set of CSS
   rules.
3. **Pixels:** stills rendered from the rebuilt project with the shipped captures match `demo-v1.mp4` at 41.5–48.3 dB
   on frames 56, 175, 397, 748, 1036, 1104, 1302 and 1420. That is codec noise; neighbouring frames score as low as
   17 dB.
4. **Gates:** `scripts/verify.sh` on `demo-v1.mp4` passes every gate.
5. **Full rebuild:** `scripts/render.sh` on the rebuilt project gave a 1477-frame film.
   - It passes every gate with the same numbers.
   - Against `demo-v1.mp4`, every frame scores ≥ 49 dB (average 61.7 dB; many are identical).
   - The decoded audio is byte-identical.
   - The share copy came out at 10.1 MB.

## Final timeline (film frames, 30 fps)

| Frames | What |
|---|---|
| 0–60 | Intro sting. Hand-off at f42, lands at f56, dissolved by f60 |
| 42–238 | 1-hero (capture frames 32–227) |
| 238–748 | 2-scroll |
| 748–919 | 3-buy |
| 919–1099 | 4-menu, ending held at 1.8× on the Admin row |
| **1099** | **CUT POINT for part B** (`demoTimeline.cutPoint`) |
| 1099–1369 | 5-phone |
| 1363–1477 | Outro (drawn under the phone for its first 6 frames) |

**Cues:**

| Sound | Film frames |
|---|---|
| ios_note | 1 |
| window open_ui | 40 |
| whooshes | 133, 355, 508, 646, 826, 994 |
| finder tink | 665 |
| keys | 675–691 |
| Menu tink / drawer open_ui | 962 / 965 |
| phone open_ui | 1097 |
| ios_received | 1379 |

**Cuts:**

| Cut | PSNR | Cursor | Scroll |
|---|---|---|---|
| f238 | 45.1 dB | (399, 564.7) arrow | 0 |
| f748 | 55.4 dB | (267, 482.1) I-beam | 3659 |
| f919 | 51.1 dB | (720, 619.7) hand | 4424 |

Shot 4 ends with the hand at (344.8, 542.1). Part B's first capture starts there via `cursor.start.fromShot: "4-menu"`.

## What was specific to Discount

| Item | Discount value | Generic? |
|---|---|---|
| Domain / facts | discountusedcarsandtrucks.com; (713) 900-5050; 8108 Gulf Fwy, Houston; Tue – Sat 10 AM – 7 PM | Per client (`client-inputs.json`) |
| Loader geometry | stage [540, 378.53, 360, 142.94], mark [540, 378.53, 360, 48.94], word [607.5, 451.47, 240, 45], cover [520, 366, 400, 136] | Measured per client (`measure-site.cjs`). The Loader component and timing are generic. |
| Mark / word | `discount-mark.png` (640×87 swoosh), "DISCOUNT" | Per client. Vega's has an 1100×861 emblem and "VEGA’S". |
| Sting width | 600 (k = 1.667) | The ratio is house; the width follows the loader's mark width. |
| Outro logo | `discount-logo-reverse.png` (1402×540), 760 px wide | 760 suits a ~2.6:1 logo; a near-square logo needs ~360–420. |
| Intro key | `discount.intro.seen` | Per client: the `SEEN_KEY` in Loader.tsx (Vega's: `vegas.intro.seen`) |
| Clock | 2026-09-30T14:00-05:00 (Wednesday, 2 PM Houston) | Per client: an open weekday with the right DST offset |
| Featured card | Truck, focus (375, 385) | Left column is generic; Sedan or Coupe need a new focus. Priced cards need re-staging. |
| Finder query | "F-150" | Per client (in stock) |
| Service band | "We Buy Cars, Too.", tile "We buy trucks", focus (740, 623) | The selector is generic; the label and focus are re-measured per band |
| Shot 4 jiggle | (726, 622) | Follows shot 3's last cursor point |
| Phone swipes | 430, 450 px to the Truck card | Re-set for another featured card |
| Hero anchor | [0.75, 0.72] for "Cars & Trucks. / For Less." | Re-check per headline |

## Owner decisions recorded in the project README

- Site copy visible in the zooms: the hero lede, "Every Price Is Shown Plainly", "Easy Financing, Clear Terms".
- Video-only CSS: the status dot in the text colour, the search × hidden, the hours line aligned.
- The lineup fine print is hidden in shot 2.
- The desk host (`desk.discountusedcarsandtrucks.com`) is not shown in the URL pill until confirmed.
