---
name: recordly-demo
description: Make the house demo video for a car dealer's website (and later its staff sale desk), exactly as the approved Discount Used Cars film, a Recordly / Screen Studio style macOS screen recording of a premium-dealer-build site. The intro match-cuts onto the site's own loader; one macOS window holds every shot with pixel-matched hard cuts, auto-zooms and a smoothed cursor; then an iPhone cut with iOS swipes, iOS sounds and a facts-only outro. Ships the capture, measure, fill, render and verify scripts and the Remotion template. Use it whenever the user wants a demo video for a dealer or dealership, a screen recording of the site or the desk, a site walkthrough, product reel, promo or screen-recording ad, a video for the dealer's social, says "do the video for this client" or "like the Discount video", wants a Mac screen recording look, or mentions Recordly or Screen Studio, even without the word demo. Use it instead of building a dealer video from scratch with remotion-motion-graphics.
---

# The house demo video (Recordly style)

This skill makes one film, the way the user approved it: Discount Used Cars, part A
(`clients/discount-used-cars-demo/out/demo-v1.mp4`). The film was approved with "exactly this way". So the job for a
new dealer is to reproduce that film on their site. It is not a new edit:

- The code, timings, sounds and look are fixed. They live in `template/` and are documented with their reasons in
  `references/house-recipe.md`.
- Only the client's facts, logos, measured loader geometry and a few page-dependent framing points change. They all
  live in one `client-inputs.json`, and the tools measure most of them.

Recordly (github.com/webadderallorg/Recordly) is AGPL-3.0 and cannot run headless. **None of its code is used.** Only
its published tuning numbers are, as reference: zoom depths, 1.5 s / 1.0 s zoom timings, cursor smoothing, click
bounce and motion blur. Our own capture (`scripts/capture.cjs`) and Remotion composition reproduce the look.

## The house cut (49.2 s at 30 fps, part B empty)

| Film | Shot | What happens |
|---|---|---|
| 0–2.0 s | intro | The loader's mark wipes in and its word staggers in. From 1.4 s it shrinks onto the site's own loader inside the springing macOS window (a match cut), lands at 1.87 s and dissolves into it. |
| 1.4–7.9 s | 1-hero | The curtain lifts on the hero. The cursor drifts in and rests beside the headline. A 1.5× zoom on the headline. |
| 7.9–24.9 s | 2-scroll | The lineup band; a 2.0× zoom on the featured card (hovered). The visit card at 1.8× ("Open Now"). The finder: click, type a model. |
| 24.9–30.6 s | 3-buy | The service band; a 2.0× zoom on the middle tile (hovered). |
| 30.6–36.6 s | 4-menu | Menu, the drawer opens, and the camera holds 1.8× on "Admin · Staff Sign-In To The Sale Desk" with the hand resting on it. |
| 36.6 s | **CUT POINT** | Part B (the app / desk segment) goes here. See "Part B slot". |
| 36.6–45.6 s | 5-phone | An iPhone slides in while the desktop recedes. Three iOS swipes down the lineup, then the phone drops away. |
| 45.4–49.2 s | outro | Drawn under the phone: the logo, the URL, phone · address, and hours; a slow push; a fade to black. |

Why it works:

- It opens on the dealer's own brand moment, and the product is visible by about 3 s.
- Every cut inside the window is invisible (pixel-matched).
- The camera moves like Screen Studio: the whole window leans into each zoom.
- Nothing is still for more than about 4 s.
- The sound is native and quiet.
- The only words the film adds are owner-confirmed facts.

## Requirements (outside the skill)

- **Node and Playwright:** Node 22 with npm registry access. Playwright 1.56.x comes from the global npm root, with
  browsers in `/opt/pw-browsers`. Never run `playwright install`. Capture needs the Linux `chromium_headless_shell`,
  for BeginFrameControl.
- **Command-line tools:** system `ffmpeg`/`ffprobe` with libx264, and `python3` with PIL for the contact sheet.
- **The client's site:** a premium-dealer-build site under `clients/<slug>-site` with its `npm ci` done, its real
  inventory loaded (premium-dealer-build phase 3) and its `public/brand` logos. The house cut ends on the drawer's
  Admin row, so it assumes the client has a sale desk: if not, ask the user before building anything.
- **Remotion licence:** Remotion 4.0.532 is installed per project by `npm ci` from the template's lockfile (about
  440 MB). Remotion is free for individuals and companies of up to 3 people; a bigger agency needs a company licence.
- **Bundled in the skill:** the 15 processed sound files (`assets/sfx/`) and the Barlow Semi Condensed font
  (`assets/fonts/`, OFL). The iOS sounds are cleared for showing the demo to the dealer, not for a paid ad
  (`assets/sfx/SOURCES.md`).

## Agent shell notes (Claude Code)

- **Variables do not survive between Bash calls.** Write them once to a file and `source` it at the top of every
  command block. `SCRATCH` must be absolute, because step 3 changes directory:
  ```bash
  SCRATCH=$(realpath -m <your scratchpad>/demo-<slug>); mkdir -p "$SCRATCH"
  printf 'S=%s\nSCRATCH=%s\nSLUG=%s\nP=%s\nI=%s\n' "$PWD/.claude/skills/recordly-demo" "$SCRATCH" <slug> \
    "$PWD/clients/<slug>-demo" "$PWD/clients/<slug>-demo/client-inputs.json" > "$SCRATCH/demo.env"
  ```
  Every block below starts with `source <that absolute path>/demo.env`.
- **Long runs:** `npm ci` in step 5, the stills in step 7b and `verify.sh` (2.5–4 minutes) need a Bash timeout of
  600000 ms. The capture loop (about 5 minutes, more on a busy container) and the render (about 12 minutes) can
  outlast a foreground call: run them with `run_in_background` (or capture one shot per call) and poll the log. The
  preview server also runs with `run_in_background`.
- **Shared container:** heavy work runs under `nice -n 15`; never touch another workflow's ports (5181 and the sale
  desk's 5190 are taken; check with `ss -ltn` or `/proc/net/tcp` before claiming one).

## Runbook

Run from the repo root.

1. **Facts first.** Take the on-screen facts only from the site's `business.ts` fields sourced OWNER or TXDMV: the web
   address (www. + domain), the phone as (000) 000-0000, street and city, and the short hours line exactly as the
   visit card prints it, without closed days. Copy every string character for character from where the site prints
   it ("Gulf Fwy", not "Gulf Freeway"). No prices, ratings or claims. If one is unconfirmed, ask the user. Do not guess.

2. **Client inputs**, one copy, inside the project folder from the start:
   `mkdir -p $P && cp $S/assets/client-inputs.template.json $I`. Fill every double-brace value: slug, client,
   `siteDir`, domain, `deskUrl`, facts, `outroLines` (facts[0]; facts[1] · facts[2]; facts[3]), `brand.logoReverse`
   (the full-colour logo the site itself shows on its black bands or footer; if it has none, ask the user; never
   recolour or invert a logo), the timezone, and the clock: **Wednesday 2026-09-30T14:00 in the dealer's zone with
   that day's UTC offset** (the next open weekday at 14:00 if closed on Wednesdays). Leave the null fields null:
   `loader`, `word`, `introKey` and `brand.mark` are measured in step 4, `logoWidth` in step 5 and `SERVICE_FOCUS` in
   step 6. `examples/discount-used-cars/client-inputs.json` is a complete one.

3. **Build the site with the Admin link, and serve it on :5183.** `VITE_DESK_URL` makes the drawer's Admin row
   render; it is never navigated in part A. Use the site's own build script (it type-checks first) when it ends in
   `vite build`, and vite's own binary through `exec`, so the pid file holds vite's PID:
   ```bash
   (cd clients/$SLUG-site && VITE_DESK_URL=<deskUrl> npm run build -- --outDir $SCRATCH/dist-demo --emptyOutDir)
   # run_in_background:
   (cd clients/$SLUG-site && echo $BASHPID > $SCRATCH/preview.pid && exec ./node_modules/.bin/vite preview --outDir $SCRATCH/dist-demo --port 5183 --strictPort)
   ```

4. **Measure the site.** This writes the loader rects, word, intro key and `brand.mark` (the .png twin of the
   loader's image) into the inputs and checks "Open Now" at the clock; then the inputs must check OK. On a new site or
   machine, also run the capture self-test (about 70 s), which must PASS.
   ```bash
   node $S/scripts/measure-site.cjs --into $I && node $S/scripts/fill-client.cjs check $I
   node $S/scripts/capture.cjs --selftest --dsf 1,2 --out $SCRATCH/selftest --clock <clock>
   ```

5. **Create the project.** This copies the template, sounds, fonts and logos, sets `theme.outro.logoWidth` from the
   logo's shape (written back into `$I`), writes `src/project.ts`, `storyboard.json` and `README.md`, and runs
   `npm ci` under nice (timeout 600000). `--force` re-creates an existing project and overwrites the README; keep
   decisions in `$I`, never only in the README.
   ```bash
   bash $S/scripts/new-project.sh $I
   ```

6. **Adapt and preflight the storyboard.** The preflight replays every shot on the served site. It fails on:
   - missing selectors and UNSET placeholders;
   - zoom edges that cut text, and the zooms' `frame` rules;
   - class (a) text (house-recipe §14) in a zoom;
   - resting cursor points on glyphs;
   - the phone's resting card.

   With `--into` it writes the suggested focus for an UNSET placeholder (`SERVICE_FOCUS` always) and each zoom's
   visible text for the README. For a set value that fails, copy the printed suggestion into `$I` → `storyboard`.
   Refill and repeat until it prints `PREFLIGHT CLEAN` (`references/storyboard.md`, last section).
   ```bash
   node $S/scripts/measure-site.cjs --storyboard $P/storyboard.json --rects --into $I
   node $S/scripts/fill-client.cjs storyboard $I $S/assets/storyboard-dealer-site.json --out $P/storyboard.json
   node $S/scripts/fill-client.cjs readme $I $S/assets/project-README.md --out $P/README.md
   ```
   A timing the page forces (for example a longer query) goes in `$I` → `overrides`, with its reason. If facts or
   logos change, refill `project.ts` too (`fill-client.cjs project $I --out $P/src/project.ts`).

7. **Capture the five shots, in order**, then check the cuts; the server is killed only when they print CUTS PASS:
   ```bash
   for id in 1-hero 2-scroll 3-buy 4-menu 5-phone; do
     node $S/scripts/capture.cjs --storyboard $P/storyboard.json --shot $id \
       --out $SCRATCH/captures/$id --publish $P/public/shots --clean || { echo "capture $id failed"; break; }
   done
   node $S/scripts/verify-film.cjs --project $P --cuts-only --out $SCRATCH/cuts && kill "$(cat $SCRATCH/preview.pid)"
   ```
   - **Order matters.** Each shot starts its cursor where the previous capture ended, and shot 4's set-up jiggle
     starts from shot 3's last point. Re-capturing shot N means re-capturing every later shot too.
   - **A failed cut** means re-staging that shot's preroll (lessons C8–C10), not a dissolve. `--allow-cut <frame>`
     exists only for the site's own small looping animation (verification.md §6).
   - **Re-rendering an existing client:** copy or symlink its `public/shots/<id>/` folders (shot.mp4 + cursor.json)
     into the project instead of re-capturing; Remotion follows symlinks in `public/`. Still run `--cuts-only` and
     `render.sh --check`.

   **7b. Spot-check stills before the full render** (3–5 minutes for the plan's 46 frames). Look at the zoom
   stills at 100% (the hero anchor beside the headline, the framing), the cut stills and the outro:
   ```bash
   F=$(node $S/scripts/verify-film.cjs --project $P --plan | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).stills.map(x=>x.frame).join(",")))')
   (cd $P && nice -n 15 node scripts/stills.cjs $SCRATCH/stills Demo:$F)
   ```

8. **Render** the master (h264 CRF 16 + AAC) and the share copy (≤ 24 MB, `+faststart`). Run the preflight and
   typecheck in the foreground, then the render with `run_in_background` (about 12 minutes under nice):
   ```bash
   bash $S/scripts/render.sh $P demo-v1 --check
   bash $S/scripts/render.sh $P demo-v1 > $SCRATCH/render.log 2>&1      # run_in_background; poll the log
   ```

9. **Verify.** Every scripted gate must pass (next section). Then open the contact sheet, look at every still, and view
   the zoom stills at 100%. If the white-level gate prints INFO, it is by eye on the two stills it names.
   ```bash
   bash $S/scripts/verify.sh $P out/demo-v1.mp4 $SCRATCH/verify-v1      # timeout 600000
   ```

10. **Send it in chat.** Use `SendUserFile` with `out/demo-v1-share.mp4` (and the contact sheet if useful), plus a
    short note:
    - length and running order
    - the master's path
    - that every gate passed (and any `--allow-*` used, with the reason)
    - the owner decisions from the project README: site copy in zooms, video-only CSS, hidden fine print, desk host
    - the sounds: the iOS kit is cleared for showing the demo to the dealer. If the user says the film will run as a
      paid ad, tell them the sounds need replacing first (`assets/sfx/SOURCES.md`); do not swap them without their
      choice.

    Do not describe a film you have not verified. Commit the project's `client-inputs.json`, `storyboard.json`,
    `src/`, `public/sfx`, `public/fonts`, `public/brand` and README; never `public/shots/` or `out/` (gitignored).

## Gates before sending

`verify.sh` runs every scripted row and exits non-zero on any failure; the approved Discount film passes all of them.
The last row is by eye. Details and what each catches are in `references/verification.md`.

| Gate | Pass |
|---|---|
| Placeholders | No double-brace value left in `src/project.ts` or `storyboard.json` |
| Frame count | Equals `timeline.total`: 1920×1080, h264, 30 fps, AAC present |
| Luma scan | No one-frame spike in the per-frame scan; the last frame is black |
| In-window cuts | PSNR ≥ 45 dB (or `--allow-cut` for a ≤ 64×64 px site animation at ≥ 40 dB), with the same cursor point, pointer shape and scroll |
| White level | A white page reads white at the window's edges (the recording is never graded); INFO means check the two named stills by eye |
| Peak | True peak < −1 dBTP |
| Onset map | Every onset sits on a cue the composition plays; no isolated blips |
| Stills (by eye) | About 46 labelled stills looked at: one logo through the hand-off, zooms framed with no edge through text, rings visible, the phone opaque by frame 2, the outro under the phone, only facts on screen, a black last frame |

## Part B slot

**Part B: recipe added after its first production use.** The film is built so an app or desk segment can be inserted
at the cut point without touching part A:

- **Slot:** `partBSegments` in `src/demo/timeline.ts`, empty in part A. When filled, `Demo.tsx` mounts a second
  `DesktopScene` at `demoTimeline.cutPoint`, in the same window style. Everything after it moves back automatically,
  and the phone's held background becomes part B's last frame.
- **Hand-off contract:**
  - Same 1440×900 viewport at DSF 2.
  - The first B capture opens on the Admin click.
  - Its cursor starts with `cursor.start.fromShot: "4-menu"`.
  - The URL pill stays the public domain until the owner confirms the desk host (`project.partBDomain`).
  - Desk data that is not a confirmed fact uses demo data or stays out of frame. Never blur it.
  - `ios_success` is reserved for this segment.
- **Hazards no render has exercised yet** (house-recipe §15): a fresh scene mounting on the cut frame (the black-frame
  pattern), the window pose and zoom restarting at the A→B cut, and the whoosh rotation restarting. Run the full gates.

Do not invent the part B storyboard here. When it has shipped once, add its recipe to this skill.

## What may change per client, and what may not

- **Per client** (all in `client-inputs.json`): domain, facts, outro lines, logos, the loader geometry, word and intro
  key (measured), clock and timezone, the storyboard placeholders, and `logoWidth` (derived from the logo).
- **House, never per client:** everything else in `template/`, including every timing, depth, ease, spring, colour,
  sound level and cue rule, and the capture settings. If a site truly forces a timing change, put it in
  `client-inputs.json` → `overrides` with its reason (the README lists it) and re-run every gate. Many of these numbers
  fixed a defect a critic found, and `references/lessons.md` says which.
- **Not a dealer site, no intro loader, or no sale desk:** the house cut does not apply as is (the intro is a match
  cut onto the loader; shot 4 ends on the desk's Admin row). Tell the user, and agree the change before building.

When you change composition code, read the remotion-motion-graphics skill first. The template follows its rules,
except one deliberate override: the grade and vignette sit under the window.

## References

- `references/house-recipe.md`: every constant with its value and reason (the source of truth for "exactly this way"),
  including the content classes (§14).
- `references/lessons.md`: every rule as rule / why / symptom, the decisions kept (do not "fix" them), and open items.
- `references/storyboard.md`: every storyboard and capture field, cursor.json, `DesktopSegment`, and adapting and
  measuring the placeholders.
- `references/verification.md`: the gates, the stills list, the thresholds, and what to do with a failure.
- `examples/discount-used-cars/`: the approved film's `storyboard.json`, its `client-inputs.json`, and `NOTES.md`
  (timeline, cut point f1099, what was client-specific, the reproduction check).

## Files

```
scripts/capture.cjs        storyboard shot → deterministic frames, shot.mp4, cursor.json (+ --selftest)
scripts/measure-site.cjs   loader geometry, intro key, Open Now; storyboard preflight with framing suggestions
                           (--storyboard, --rects, --into); read-only on the site
scripts/fill-client.cjs    client-inputs.json → project.ts / storyboard.json / README.md (check refuses placeholders)
scripts/new-project.sh     template + assets + filled files → clients/<slug>-demo, logoWidth, npm ci
scripts/render.sh          preflight, typecheck, master (CRF 16) + share copy (≤ 24 MB); --check stops before rendering
scripts/verify.sh          the gates (wraps verify-film.cjs; --plan and --cuts-only modes; --allow-* flags)
template/                  the approved film's Remotion project: src identical to the shipped one except
                           project.ts (placeholders) and theme.ts comments; lockfile pins Remotion 4.0.532
template/scripts/stills.cjs     bundle once, render many stills (step 7b); deletes its own webpack bundle
template/scripts/prepare-sfx.sh rebuilds the sound kit from its source pack; only needed to swap a sound
assets/storyboard-dealer-site.json   the house storyboard with placeholders, `adapt` notes and `frame` / `rest` rules
assets/client-inputs.template.json   the one file filled per client
assets/project-README.md   the per-project README
assets/sfx/, assets/fonts/ the 15 sounds the film plays (SOURCES.md) and Barlow Semi Condensed (OFL.txt)
```

**Housekeeping:**

- Run heavy work under `nice -n 15`.
- Capture with `--clean`, since a DSF 2 shot is about 2.5 GB of PNG.
- Delete only the `/tmp/remotion-webpack-bundle-*` your runs created. `render.sh` and `stills.cjs` do this.
- Kill your preview server by its PID, after the cuts pass.
- Do not edit the client's site source: video-only fixes go in the storyboard's `captureCss`.
