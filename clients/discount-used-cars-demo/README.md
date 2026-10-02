# Discount Used Cars and Trucks: site demo video

A Recordly / Screen Studio style product demo of the public site (www.discountusedcarsandtrucks.com): the site in a
macOS window on a dark wallpaper, auto-zooms, a smoothed macOS cursor, an iPhone cut and iOS sound effects. It is built
with the `recordly-demo` skill (`.claude/skills/recordly-demo/SKILL.md`). Recordly's code is AGPL and is not used; only
its tuning numbers are.

- **Output:** `out/discount-demo.mp4` (1920×1080, 30 fps, h264 CRF 17 + AAC 192k, +faststart, 82.5 s): part A (the
  site, as approved in demo-v1) and part B (the sale desk and the signed 130-U). `out/discount-demo-share.mp4` is the
  ≤ 24 MB copy for chat (same picture size, +faststart).
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
| 36.4 s | The Admin row is clicked on the menu (ring, tink), 6 frames before the cut | `withCutClick` (timeline.ts) |
| 36.6–40.4 s | B1 · The painted Team Access card at shot 4's 1.8x; the camera pulls back to it from the cut (open_ui); the email (privacy-blurred) and password are typed; Sign In | `6-desk-signin` |
| 40.4–48.6 s | B2 · First sign-in: name Maria Lopez; the pen draws her signature on the pad at 1.8x (a felt-tip under each stroke; "Signed: 10/02/2026"); Save; "You Are All Set" (ios_success); the camera pulls out; Start Working | `7-desk-onboard` |
| 48.6–59.1 s | B3 · Handle A Sale (wide) → Start A Sale (the skeleton loader cut out) → the Camry; the buyer James Carter; the address read-back at 2.0x and Hold To Confirm (a soft rise under the fill, the hand off the label, 0.4 s at 100%) → (the dialog's close cut out) "How Are They Paying?" → Cash | `8-desk-sale-start` (8a/8b), `9-desk-buyer`, `10-desk-readback` (10a/10b) |
| 59.1–62.5 s | B4 · The guided sale: We Do, No plate yet, The Buyer, Here Today | `11-desk-guide` |
| 62.5–65.6 s | B5 · The packet of the same sale, completed off camera: a push onto "Ready To Print · 2 / 2 signed" (ios_success), held; Open / Print on the 130-U | `12-desk-signed` |
| 65.6–69.9 s | B6 · The 130-U opens in a Preview window over the held desk; the camera pushes in on the centred CERTIFICATION block (the rest of the page dims, Screen Studio spotlight): "Discount Used Cars And Trucks, LLC (Maria Lopez) 10/02/2026" beside her drawn signature; box 14, the VIN and box 38(a) blurred; caption "Signed Once. On Every Title Application." | `DocScene` (public/docs/130u-p1.png) |
| 69.9–78.9 s | An iPhone slides in while the desk and the document dissolve to the wallpaper (0.4 s). Three iOS swipes run down the lineup, then the phone drops out of frame | shot `5-phone` |
| 78.7–82.5 s | Outro: the logo, then the URL, phone and address, and hours. A slow push, then a fade to black | `LogoSting` |

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
nice -n 15 npx remotion render src/index.ts Demo out/discount-demo-raw.mp4 --codec h264 --crf 17 \
  --audio-codec aac --audio-bitrate 192k --concurrency 3 --offthreadvideo-cache-size-in-bytes 1500000000 \
  --browser-executable=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux)/headless_shell
ffmpeg -i out/discount-demo-raw.mp4 -c copy -movflags +faststart out/discount-demo.mp4 && rm out/discount-demo-raw.mp4
# share copy (≤ 24 MB): two-pass x264 at a bitrate from the length, same picture size
#   (see "Share copy" below for the exact commands used)
```

The render takes about 30 minutes at concurrency 3 (part A alone about 11). Without the video cache cap a 16 GB box ran
out of memory near the phone scene when other work was running. To check single frames first, run
`node scripts/stills.cjs out/stills Demo:56,391,862,1030` (it deletes its webpack bundle when done).

After rendering:

- **Stills.** To extract film frame f from the MP4, use `ffmpeg -ss $(echo "($f-0.5)/30" | bc -l) -i out/discount-demo.mp4 -frames:v 1 f.png`.
  A plain `f/30` returns the next frame.
- **Peaks.** Run `ffmpeg -i out/discount-demo.mp4 -af ebur128=peak=true -f null -`. The true peak must stay under −1 dBTP.
  The mix is SFX only at +10 dB master gain (`theme.sfx.masterDb`), with no music; add a track in the edit.

## Part B (the sale desk)

Part B is in (`partBSegments` in `src/demo/timeline.ts`, built from `project.partB.cuts`; `DocScene` for B6). The recipe
is the skill's (`SKILL.md` "Part B: the desk", `references/house-recipe.md` §15, `lessons.md` B1–B13,
`verification.md` §7). How it is built:

1. **Captures.** Shots 6-12 are in `.claude/skills/recordly-demo/examples/discount-used-cars/storyboard.json` (after
   4-menu; `assets/storyboard-desk.json` is the same set as a template). Each carries `base: http://localhost:5190`,
   the clock 2026-10-02 14:00 CDT and the part B css.
2. **One window.** Part B plays in the SAME `DesktopScene` as part A (Demo.tsx joins `withCutClick(partASegments)` and
   `partBSegments`): nothing mounts on the cut frame, the window's breathing and lean run on, the whoosh rotation
   continues (B6's push whoosh too, `docWhooshAfter`).
3. **Cuts.** Every B cut is a jump-cut on a click's navigation onto the new page's first fully painted frame
   (`partB.cuts`: the sign-in card at 12; 8's skeleton 42–54 and 10's dialog close and blank page 108–133 are cut out by
   playing those captures as two segments). Pointer and camera are identical on both sides of every cut; a click's ring
   runs on across it (`edit.moveEvents`).
4. **Cameras** (`zoomFocus` / `zoomShift`, composition only): SIGN_IN 1.45x for the card and onboarding; both of 7's
   zooms leave at capture 182 so Handle A Sale opens wide; WIZARD 1.32x for the sale steps; READ_BACK 2.0x (10b pulls
   back from the cut); PACKET 1.62x held to the Open / Print click.
5. **Cursor.** A press-and-hold keeps the pointer pressed for the whole hold, pressed 45 px right of the label
   (`edit.nudge`); the pen is drawn unsmoothed on the ink's tip (`recordly.penLagFrames`).
6. **B6.** The deal's real 130-U page 1 (300 dpi) in a Preview-style window titled `130-U_Carter_812345.pdf`; a 1.5 s
   Recordly push to 0.8 frame px per page px with the certification block centred and the rest dimmed; box 14 (licence
   number), box 1 (VIN) and box 38(a) (money) under a privacy blur at every frame; one Title Case caption over the
   dimmed lower rows, readable about 2 s, gone before the phone. Numbers in `theme.doc`, boxes in `project.doc`.
7. **Sounds.** Admin click: tink on the menu + open_ui on the cut. Pen: a felt-tip per stroke. ios_success when "You Are
   All Set" appears and as the push lands on "2 / 2 signed". Hold To Confirm: a tink at the press, a soft rise under
   the fill, a softer tink at the release. B6: open_ui and one whoosh.

### Re-capturing part B against the desk

From the repo root, with `SCRATCH` a scratch directory and `S=.claude/skills/recordly-demo`:

```bash
# 1. The desk on :5190 ONLY, under next dev (its preview mock is off in production), with a member who has not
#    onboarded and has NO temporary password (onboarding opens on the name step). Note the PID; kill it by PID.
cd clients/discount-used-cars-desk
DESK_PREVIEW_MEMBER=fresh setsid npx next dev -p 5190 > $SCRATCH/desk.log 2>&1 & echo $! > $SCRATCH/desk.pid
cd ../..
git -C clients/discount-used-cars-desk checkout -- next-env.d.ts   # if next rewrote it

# 2. Capture in this order on ONE fresh server (restart it before re-capturing 6 or 7: the mock's state is in memory)
SB=$S/examples/discount-used-cars/storyboard.json
for id in 6-desk-signin 7-desk-onboard 8-desk-sale-start 9-desk-buyer; do
  node $S/scripts/capture.cjs --storyboard $SB --shot $id --out $SCRATCH/captures/$id \
    --publish clients/discount-used-cars-demo/public/shots --clean || break
done
# B4 set-up deal (premium-dealer-build desk-walk sale.cjs, a scratch copy of scenarios/james-carter-to-registration.json),
# then 11 on it; then 10 (makes its own deal); then the off-camera complete sale (sale.cjs james-carter.json +
# ceremony.cjs) and 12 on it:
node $S/scripts/capture.cjs --storyboard $SB --shot 11-desk-guide --var deal=<B4 deal> --out $SCRATCH/captures/11-desk-guide --publish clients/discount-used-cars-demo/public/shots --clean
node $S/scripts/capture.cjs --storyboard $SB --shot 10-desk-readback --out $SCRATCH/captures/10-desk-readback --publish clients/discount-used-cars-demo/public/shots --clean
node $S/scripts/capture.cjs --storyboard $SB --shot 12-desk-signed --var deal=<complete deal> --out $SCRATCH/captures/12-desk-signed --publish clients/discount-used-cars-demo/public/shots --clean
pdftoppm -r 300 -f 1 -l 1 -png <the deal's 130-U_Carter_812345.pdf> clients/discount-used-cars-demo/public/docs/130u-p1
kill "$(cat $SCRATCH/desk.pid)"

# 3. Re-measure partB.cuts on the new captures (verification.md §7), set them in src/project.ts (and the example
#    client-inputs.json), then:
node $S/scripts/verify-film.cjs --project clients/discount-used-cars-demo --cuts-only --out $SCRATCH/cuts   # CUTS PASS
```

The desk's source is never edited: video-only fixes go in the shots' css. Demo data only: staff Maria Lopez, buyer
James Carter (1418 Belrose Dr, Houston 77034, checked not to exist), the mock lot's 2019 Toyota Camry SE.

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
