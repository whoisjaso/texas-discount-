# Discount Used Cars and Trucks: site demo video

A Recordly / Screen Studio style product demo of the public site (www.discountusedcarsandtrucks.com): the site in a
macOS window on a dark wallpaper, auto-zooms, a smoothed macOS cursor, an iPhone cut and iOS sound effects. It is built
with the `recordly-demo` skill (`.claude/skills/recordly-demo/SKILL.md`). Recordly's code is AGPL and is not used; only
its tuning numbers are.

- **Output:** `out/demo-v2.mp4` (1920×1080, 30 fps, h264 CRF 17 + AAC, 83.6 s): part A (the site) and part B (the
  sale desk and the signed 130-U). `out/demo-v1.mp4` is the approved part A film (49.2 s).
- **Composition:** `Demo` (`src/Demo.tsx`, running order in `src/demo/timeline.ts`).
- **Storyboard:** `.claude/skills/recordly-demo/examples/discount-used-cars/storyboard.json`. Each shot's actions, zooms,
  injected CSS and the reasons behind them are in its `notes`, `why` and `describe` fields.
- **On-screen facts:** only www.discountusedcarsandtrucks.com, (713) 900-5050, 8108 Gulf Fwy, Houston, and
  Tue – Sat 10 AM – 7 PM; part B adds desk.discountusedcarsandtrucks.com (the URL pill), Discount Used Cars And Trucks,
  LLC and GDN P145000 (on the 130-U). No prices, no claims. Desk people and the deal are demo data: staff member
  "Maria Lopez", buyer "James Carter", the mock lot's 2019 Toyota Camry SE.

## Running order

| Film | What | Source |
|---|---|---|
| 0–1.9 s | The red mark wipes in and DISCOUNT staggers in. From 1.4 s the sting shrinks onto the site's own loader as the window springs in (a match cut), then dissolves into it | `MatchSting` + `project.loader` |
| 1.4–8 s | The loader's curtain lifts on the hero. The cursor comes in and the camera zooms 1.5x on the headline | shot `1-hero` (the loader plays once per session; this shot does not pre-set `discount.intro.seen`) |
| 8–25 s | "Find Your Fit." is followed by a 2.0x zoom on the Trucks card, then the visit card ("Open Now · Tue – Sat"), then the finder, where the search field is clicked and "F-150" typed | shot `2-scroll` |
| 25–30.6 s | The "We Buy Cars, Too." band with a 2.0x zoom on We Buy Trucks | shot `3-buy` |
| 30.6–36.6 s | The cursor clicks Menu, the drawer opens and the camera holds 1.8x on "Admin · Staff Sign-In To The Sale Desk". **This is the cut point for part B** (f1099) | shot `4-menu` |
| 36.6–40.8 s | B1 · The Admin click lands (open_ui) and the URL pill reads desk.discountusedcarsandtrucks.com; the Team Access card fades in; the email (privacy-blurred) and password are typed; Sign In | `6-desk-signin` |
| 40.8–49.0 s | B2 · First sign-in: name Maria Lopez; the pen draws her signature on the pad at 1.8x ("Signed: 10/02/2026"); Save; "You Are All Set" (ios_success); Start Working | `7-desk-onboard` |
| 49.0–60.9 s | B3 · Handle A Sale → Start A Sale → the Camry; the buyer James Carter; the address read-back at 2.0x and Hold To Confirm held 2.2 s while it fills → "How Are They Paying?" → Cash | `8-desk-sale-start`, `9-desk-buyer`, `10-desk-readback` |
| 60.9–64.2 s | B4 · The guided sale: We Do, No plate yet, The Buyer, Here Today | `11-desk-guide` |
| 64.2–67.3 s | B5 · The packet of the same sale, completed off camera: a push onto "Ready To Print · 2 / 2 signed" (ios_success); Open / Print on the 130-U | `12-desk-signed` |
| 67.3–71.0 s | B6 · The 130-U opens in a Preview window over the held desk; the camera pushes in on the seller band ("Discount Used Cars And Trucks, LLC (Maria Lopez)" and her drawn signature); caption "Signed Once. On Every Title Application." | `DocScene` (public/docs/130u-p1.png) |
| 71.0–80.0 s | An iPhone slides in while the desk and the document recede. Three iOS swipes run down the lineup, then the phone drops out of frame | shot `5-phone` |
| 79.8–83.6 s | Outro: the logo, then the URL, phone and address, and hours. A slow push, then a fade to black | `LogoSting` |

The cuts inside the window are hard cuts on pixel-matched frames: shot N+1 starts where shot N ended, with the same
scroll, cursor point, hover state and caret blink phase.

## Re-capture

You need ffmpeg, plus Playwright from the global npm root with its browsers in `/opt/pw-browsers`. Never run
`playwright install`. Run everything from the repo root, with `SCRATCH` set to a scratch directory.

```bash
# 1. Build a copy of the site WITH the Admin link (the desk URL) and serve it on :5183
cd clients/discount-used-cars-site
VITE_DESK_URL=https://desk.discountusedcarsandtrucks.com npx vite build --outDir $SCRATCH/dist-demo --emptyOutDir
npx vite preview --outDir $SCRATCH/dist-demo --port 5183 --strictPort &   # note the PID; kill it by PID when done
cd ../..

# 2. Capture the shots IN ORDER (each one starts its cursor where the previous capture ended)
for id in 1-hero 2-scroll 3-buy 4-menu 5-phone; do
  node .claude/skills/recordly-demo/scripts/capture.cjs \
    --storyboard .claude/skills/recordly-demo/examples/discount-used-cars/storyboard.json \
    --shot $id --out $SCRATCH/captures/$id --publish clients/discount-used-cars-demo/public/shots --clean
done
```

Each shot writes `public/shots/<id>/shot.mp4` (2880×1800 for desktop, 780×1594 for the phone) and `cursor.json`. The
cursor file holds the cursor track, the pointer shapes, the events and the zooms. For the phone it also holds the
page's edge colours. `--clean` deletes the PNG frames once the MP4 is checked; a 15 s shot is about 2.5 GB of PNGs.
The whole run takes about 5 minutes.

After a re-capture, check that every cut still matches. The last frame of one capture against the first frame of the
next should give PSNR ≥ 45 dB:

```bash
ffmpeg -i public/shots/2-scroll/shot.mp4 -vf "select=eq(n\,509)" -frames:v 1 a.png
ffmpeg -i public/shots/3-buy/shot.mp4 -vf "select=eq(n\,0)" -frames:v 1 b.png
ffmpeg -i a.png -i b.png -lavfi psnr -f null -
```

If you change the site's loader, re-measure `project.loader` in `src/project.ts` (getBoundingClientRect of
`.loader__stage`, `.loader__emblem img` and `.loader__word` at 1440×900). The match cut is drawn from those numbers.

## Re-render

```bash
cd clients/discount-used-cars-demo
npm install                      # first time only
scripts/prepare-sfx.sh           # copies the sound kit and cuts key_1..7, whoosh_short(+_lo/_hi) and open_ui (0.6 s)
npx tsc --noEmit
npx remotion render src/index.ts Demo out/demo-v2.mp4 --codec h264 --crf 17 \
  --browser-executable=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux)/headless_shell
```

The render takes about 25 minutes at concurrency 3 (part A alone about 11). To check single frames first, run
`node scripts/stills.cjs out/stills Demo:56,391,862,1030` (it deletes its webpack bundle when done).

After rendering:

- **Stills.** To extract film frame f from the MP4, use `ffmpeg -ss $(echo "($f-0.5)/30" | bc -l) -i out/demo-v2.mp4 -frames:v 1 f.png`.
  A plain `f/30` returns the next frame.
- **Peaks.** Run `ffmpeg -i out/demo-v2.mp4 -af ebur128=peak=true -f null -`. The true peak must stay under −1 dBTP.
  The mix is SFX only at +10 dB master gain (`theme.sfx.masterDb`), with no music; add a track in the edit.

## Part B (the sale desk)

Part B is in (`partBSegments` in `src/demo/timeline.ts`, `DocScene` for B6). How it is built:

1. **Captures.** Shots 6-12 are in `.claude/skills/recordly-demo/examples/discount-used-cars/storyboard.json` (after
   4-menu; each carries `base: http://localhost:5190`, its clock 2026-10-02 14:00 CDT and the pasted part B css; the
   capture order, the desk server and the off-camera deals are in its `partB.notes`). The desk runs under `next dev`
   (its preview mock is off in production), with `DESK_PREVIEW_MEMBER=fresh`; restart it before re-capturing 6 or 7.
2. **One window.** Part B plays in the SAME `DesktopScene` instance as part A (Demo.tsx joins the two segment lists), so
   nothing mounts on the cut frame, the window's breathing and lean run on, and the whoosh rotation continues. Each B
   segment's `url` puts desk.discountusedcarsandtrucks.com in the pill from the first desk frame.
3. **Cuts.** Every B capture ends on the frame before its click's navigation and the next opens on the new page with the
   cursor and the camera where they were: hard jump-cuts on the click, never a dissolve (camera view and cursor position
   are identical on both sides of every cut; only the pointer's shape changes, as the page under it changes).
4. **Trims.** The still heads of 8-12 are trimmed (0.37, 0.17, 0.23, 0.23, 0.27 s) so the cursor sets off about 0.1 s
   after each cut; `zoomShift` moves 8's pull-back and 12's push by the trim so the first frame shown keeps the camera.
5. **Re-aimed cameras** (`zoomFocus`, composition only): the sign-in card, the sale steps, the read-back and the packet
   are framed so no edge cuts text (see the comment above `SIGN_IN` in timeline.ts).
6. **Cursor.** A press-and-hold (B3) keeps the pointer pressed for the whole hold with one ring at the press; the pen
   (B2) is drawn unsmoothed on the ink's tip (`recordly.penLagFrames`).
7. **B6.** The deal's real 130-U page 1 (300 dpi) in a Preview-style window titled `130-U_Carter_812345.pdf`, a spring
   entrance over the dimmed desk, then a 1.5 s Recordly push (log-space) onto the seller band; box 38(a)'s money is under
   a privacy blur at every frame; one Title Case caption on a dark pill, gone before the phone. Its numbers are in
   `theme.doc` and the boxes in `project.doc`.
8. **Sounds.** Admin click: tink + open_ui. ios_success when "You Are All Set" appears and as the push lands on
   "2 / 2 signed". Hold To Confirm: a tink at the press, a softer one at the release. B6: open_ui and one whoosh.

**Privacy.** Identity data (the sign-in email and the sidebar's identity handle) is under a privacy blur, so no real
mailbox is implied; the desk's workflow screens and the document's dealer facts are never blurred; money figures on
documents are blurred (130-U box 38(a)); the bill of sale is not shown.

## Decisions to confirm with the owner

- **Site copy in the zooms.** Some of the site's own copy is visible in the zooms: the hero's "Easy Financing And
  Fair Prices At 8108 Gulf Freeway", the finder's "Every Price Is Shown Plainly…" and the drawer's "Easy Financing,
  Clear Terms". The film's own overlays only show the four facts. If site copy also counts as a claim, these zooms
  need re-aiming.
- **Video-only CSS.** Every capture injects some CSS (the storyboard's `captureCss`) that is not on the live site:
  - The green "Open Now" dot is drawn in the text colour.
  - Chromium's blue search-clear × is hidden.
  - The hours line is centre-aligned; on the live site the status pill sits about 6 px low.

  The same three rules would fix the live site.
- **Fine print.** Shot 2 hides the lineup's finance fine print ("15% down, 12.9% APR, 48 months").

## Files

```
src/Demo.tsx              the film (layers, intro match cut, phone, outro, SFX cues)
src/demo/timeline.ts      running order: segments, cut point, part B
src/project.ts            domain, logos, loader geometry, outro facts, part-B domain
src/theme.ts              colours, motion, Recordly tuning, sound map (all timings in seconds)
src/scenes/DesktopScene   one macOS window, several captures, hard cuts, camera, cursor
src/scenes/PhoneScene     iPhone cut (status-bar tint, home indicator, swipes, drop exit)
src/scenes/DocScene       B6: the 130-U in a Preview window, push onto the seller band, privacy blur, caption
src/components/           MatchSting, LogoSting, Wallpaper/Backdrop, MacWindow, IPhone, Camera, Cursor,
                          TapRipple, Sfx, Overlays, Title
public/shots/<id>/        captures (regenerated, git-ignored)
public/docs/              the 130-U page 1 (and the bill of sale page 1, unused) at 300 dpi, from the off-camera deal
public/sfx/               sound kit (scripts/prepare-sfx.sh)
```
