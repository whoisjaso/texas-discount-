# Discount Used Cars and Trucks: site demo video

A Recordly / Screen Studio style product demo of the public site (www.discountusedcarsandtrucks.com): the site in a
macOS window on a dark wallpaper, auto-zooms, a smoothed macOS cursor, an iPhone cut and iOS sound effects. It is built
with the `recordly-demo` skill (`.claude/skills/recordly-demo/SKILL.md`). Recordly's code is AGPL and is not used; only
its tuning numbers are.

- **Output:** `out/demo-v1.mp4` (1920×1080, 30 fps, h264 CRF 16 + AAC). Part A only; part B (the sale desk) slots in later.
- **Composition:** `Demo` (`src/Demo.tsx`, running order in `src/demo/timeline.ts`).
- **Storyboard:** `.claude/skills/recordly-demo/examples/discount-used-cars/storyboard.json`. Each shot's actions, zooms,
  injected CSS and the reasons behind them are in its `notes`, `why` and `describe` fields.
- **On-screen facts:** only www.discountusedcarsandtrucks.com, (713) 900-5050, 8108 Gulf Fwy, Houston, and
  Tue – Sat 10 AM – 7 PM. No prices, no claims.

## Running order

| Film | What | Source |
|---|---|---|
| 0–1.9 s | The red mark wipes in and DISCOUNT staggers in. From 1.4 s the sting shrinks onto the site's own loader as the window springs in (a match cut), then dissolves into it | `MatchSting` + `project.loader` |
| 1.4–8 s | The loader's curtain lifts on the hero. The cursor comes in and the camera zooms 1.5x on the headline | shot `1-hero` (the loader plays once per session; this shot does not pre-set `discount.intro.seen`) |
| 8–25 s | "Find Your Fit." is followed by a 2.0x zoom on the Trucks card, then the visit card ("Open Now · Tue – Sat"), then the finder, where the search field is clicked and "F-150" typed | shot `2-scroll` |
| 25–30.6 s | The "We Buy Cars, Too." band with a 2.0x zoom on We Buy Trucks | shot `3-buy` |
| 30.6–36.6 s | The cursor clicks Menu, the drawer opens and the camera holds 1.8x on "Admin · Staff Sign-In To The Sale Desk". **This is the cut point for part B** | shot `4-menu` |
| 36.6–45.6 s | An iPhone slides in while the desktop recedes. Three iOS swipes run down the lineup, then the phone drops out of frame | shot `5-phone` |
| 45.4–49.2 s | Outro: the logo, then the URL, phone and address, and hours. A slow push, then a fade to black | `LogoSting` |

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
npx remotion render src/index.ts Demo out/demo-v1.mp4 --codec h264 --crf 16 \
  --browser-executable=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux)/headless_shell
```

The render takes about 11 minutes at concurrency 3. To check single frames first, run
`node scripts/stills.cjs out/stills Demo:56,391,862,1030` (it deletes its webpack bundle when done).

After rendering:

- **Stills.** To extract film frame f from the MP4, use `ffmpeg -ss $(echo "($f-0.5)/30" | bc -l) -i out/demo-v1.mp4 -frames:v 1 f.png`.
  A plain `f/30` returns the next frame.
- **Peaks.** Run `ffmpeg -i out/demo-v1.mp4 -af ebur128=peak=true -f null -`. The true peak must stay under −1 dBTP.
  The mix is SFX only at +10 dB master gain (`theme.sfx.masterDb`), with no music; add a track in the edit.

## Part B (the sale desk)

The film is cut so that part B can be inserted without touching part A:

1. Capture the desk at the same window size: 1440×900 at deviceScaleFactor 2, with the same storyboard format. The
   first desk shot should open on the Admin click. Shot 4 ends with the cursor resting on the Admin row at viewport
   point (344.8, 542.1), held at 1.8x. Start the desk capture's cursor there (`cursor.start: {x: 344.8, y: 542.1}`)
   so the cut matches.
2. Put the segments in `partBSegments` in `src/demo/timeline.ts`, for example
   `{ shot: "6-desk-login", durationInFrames: sec(8) }`. The Demo inserts a second `DesktopScene` at
   `demoTimeline.cutPoint`, in the same window. Everything after it moves back by part B's length, and the phone's
   blurred background becomes part B's last frame automatically.
3. The URL pill stays `discountusedcarsandtrucks.com` until the owner confirms the desk host may be shown. The desk
   host is not on the confirmed fact list. Once confirmed, set `project.partBDomain` (or give each segment a `url`).
4. Anything on the desk that is not a confirmed fact (customer names, prices, VINs) must stay out of frame. Use demo
   data, or re-stage so it never shows. Do not blur it.

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
src/components/           MatchSting, LogoSting, Wallpaper/Backdrop, MacWindow, IPhone, Camera, Cursor,
                          TapRipple, Sfx, Overlays, Title
public/shots/<id>/        captures (regenerated, git-ignored)
public/sfx/               sound kit (scripts/prepare-sfx.sh)
```
