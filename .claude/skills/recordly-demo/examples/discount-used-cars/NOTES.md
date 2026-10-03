# Discount Used Cars and Trucks: the approved film (part A) and the desk film (part B)

| | |
|---|---|
| Project | `clients/discount-used-cars-demo` |
| Master | `out/demo-v1.mp4`: 1920×1080, 30 fps, 1477 frames, 49.237 s, 41.9 MB (deleted after part B shipped: part A is frames 0–1092 of `out/discount-demo.mp4`, and `render.sh` re-renders it) |
| Share copy | `out/discount-demo-part-a-preview.mp4`: CRF 23, 10.6 MB (deleted likewise) |
| Status | Approved by the user: "I love it, let's make this a skill … exactly this way" |

- `storyboard.json` is the capture storyboard as shipped, kept byte for byte. It predates the automatic `captureCss`,
  so each shot carries a pasted copy; `capture.cjs` does not add it twice. Its `serve` notes (npx) also predate lesson
  O1: build and serve as SKILL.md step 3 says.
- `client-inputs.json` holds the inputs that rebuild this project with `scripts/new-project.sh`.

## Reproduction check (done when the skill was locked)

1. **Project:** `new-project.sh examples/discount-used-cars/client-inputs.json <scratch>`
   - Produced a project whose `src/` differs from the shipped one only in comments (in `project.ts` and
     `theme.ts`). Every value is identical, and `logoWidth` comes out 760.
   - Every sound, font and logo file is byte-identical.
   - `tsc --noEmit` passes.
2. **Storyboard:** filling `assets/storyboard-dealer-site.json` with these inputs gives, for every shot, the same
   normalised capture instructions as `storyboard.json` (`capture.cjs` normalizeShot + resolveFromShot, compared with
   sorted keys): actions, zooms, viewport, clock, intro key and CSS. Shot 4's jiggle, a `fromShot: "3-buy"` move in
   the template, resolves to the same (726, 622). The only addition is the template's price-chip rule in shots 2 and 5
   (`.model__price, .model .chips .chip + .chip`), which matches no element on Discount (no priced stock: every card
   reads "Ask about availability"), so no pixel changes.
3. **Preflight:** `measure-site.cjs --storyboard` on that filled storyboard prints `PREFLIGHT CLEAN`. With
   BODY_FOCUS, HOURS_FOCUS and SERVICE_FOCUS unset it suggests {375, 387}, {400, 422} and {730, 621}; the hand-set
   values kept here also pass.
4. **Pixels:** stills rendered from the rebuilt project (`scripts/stills.cjs`) with the shipped captures match
   `demo-v1.mp4` (frames taken with `select=eq(n,f)`) on frames 2, 56, 175, 391, 667, 963, 1030, 1098, 1100, 1300,
   1380 and 1460 at 41.7–47.9 dB RGB and 45.7–51.3 dB luma (pass mark 38). That is codec noise; neighbouring frames
   score as low as 16 dB. The final fix round re-ran it and got byte-identical stills.
5. **Gates:** `scripts/verify.sh` on `demo-v1.mp4` passes every gate.
6. **Full rebuild:** `scripts/render.sh` on the rebuilt project gave a 1477-frame film.
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
| Outro logo | `discount-logo-reverse.png` (1402×540), 760 px wide | Derived: min(760, round(300 × 1402/540)) = 760; a 1.28:1 logo gets 384 |
| Intro key | `discount.intro.seen` | Per client: the `SEEN_KEY` in Loader.tsx (Vega's: `vegas.intro.seen`) |
| Clock | 2026-09-30T14:00-05:00 (Wednesday, 2 PM Houston) | House date and time; per client only the zone's offset (or the next open weekday at 14:00) |
| Featured card | Truck, focus (375, 385) | Generic rule: Truck if in stock, else SUV, else Truck (both left column, same focus). Price chips are hidden by the shot CSS |
| Finder query | "F-150" | Per client (in stock) |
| Service band | "We Buy Cars, Too.", tile "We buy trucks", focus (740, 623) | The selector is generic; the label is copied and the focus measured per band (the tool suggests {730, 621} here) |
| Shot 4 jiggle | (726, 622) | Not a placeholder: `capture.cjs` resolves 3-buy's last cursor point + (6, 2) |
| Phone swipes | 430, 450 px to the Truck card (top 60.8 px under the header) | House values: the phone always rests on the Trucks card; the 5-phone `rest` rule checks it |
| Hero anchor | [0.75, 0.72] for "Cars & Trucks. / For Less." | Re-check per headline |

## Owner decisions recorded in the project README

- Site copy visible in the zooms: the hero lede, "Every Price Is Shown Plainly", "Easy Financing, Clear Terms". These
  are exactly the class (b) lines `measure-site.cjs` lists for this storyboard.
- Video-only CSS: the status dot in the text colour, the search × hidden, the hours line aligned.
- The lineup fine print is hidden in shot 2.
- The desk host (`desk.discountusedcarsandtrucks.com`) is not shown in the URL pill until confirmed.

## Part B: the desk film (shipped 2026-10-02)

| | |
|---|---|
| Master | `out/discount-demo.mp4`: 1920×1080, 30 fps, 2474 frames, 82.47 s, h264 CRF 17 + AAC 192k, +faststart |
| Share copy | `out/discount-demo-share.mp4`: two-pass x264, same size, ≤ 24 MB, +faststart |
| Inputs | `client-inputs.json` → `partBDomain`, `partB` (cuts 12 / [42, 55] / [108, 134], `130-U_Carter_812345.pdf`, clock 2026-10-02 14:00 CDT) |
| Storyboard | `storyboard.json` shots 6-12 (= `assets/storyboard-desk.json` filled with these inputs, checked shot by shot) |

Timeline (film frames): A 0–1099 (the Admin click drawn at 1093) · 6 1099–1212 · 7 1212–1457 · 8a 1457–1487 · 8b
1487–1542 · 9 1542–1633 · 10a 1633–1734 · 10b 1734–1774 · 11 1774–1874 · 12 1874–1967 · B6 1967–2096 · phone
2096–2366 · outro 2360–2474. The finish pass's critic findings and their fixes are lessons B1–B13.


## The narrated long cut (2026-10-03)

`clients/discount-used-cars-demo`, composition `Narrated` (3:50, 6901 frames): the approved film's part A and desk
sign-in reused, eight new desk captures (20-car … 27-desk-stored, in `narration/storyboard-long.json`), the deal's own
bill of sale and 130-U pages, the phone ceremony, and 24 Kokoro lines anchored by key word. Recipe:
`references/narration.md`; lessons N1–N12; timing and lip-to-picture tables: the project's `narration/README.md`.
