---
name: recordly-demo
description: >-
  Make the house demo videos for a car dealer's website and staff sale desk, exactly as the approved
  Discount Used Cars films: the short Recordly / Screen Studio style macOS screen recording (intro
  match-cut onto the site's loader, one macOS window with pixel-matched cuts, auto-zooms, smoothed
  cursor, iPhone cut with iOS swipes, iOS sounds, facts-only outro) and the narrated long cut (a fact-
  checked money-made / time-saved script voiced free with Kokoro). Ships the capture, measure, fill,
  render and verify scripts and the Remotion template. Use it whenever the user wants a demo video for
  a dealer, a screen recording or walkthrough of the site or desk, a narrated or voice-over
  walkthrough, a product reel, promo or screen-recording ad, a dealer social video, says "do the video
  for this client" or "like the Discount video", wants a Mac screen recording look, or mentions
  Recordly or Screen Studio, even without the word demo. Use it instead of building a dealer video
  from scratch with remotion-motion-graphics.
---

# The house demo video (Recordly style)

This skill makes one film, the way the user approved it: Discount Used Cars, part A (approved as `demo-v1.mp4`; it is
now frames 0–1092 of `clients/discount-used-cars-demo/out/discount-demo.mp4`, the site + desk film, unchanged). The
film was approved with "exactly this way". So the job for a
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
| 36.6 s | **CUT POINT** | Part B (the sale desk) goes here. See "Part B: the desk". |
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
   Run the self-test on an idle machine; on a determinism FAIL under load, re-run once before investigating (lesson
   B12).

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

## Part B: the desk (when the client has the premium-dealer-build sale desk)

Shipped once in the Discount film (`out/discount-demo.mp4`, 82.5 s): part A unchanged to the cut point, then the desk in
the SAME window, then B6 (the signed 130-U), then the phone and outro. It is house recipe too: shots in
`assets/storyboard-desk.json`, segments in `template/src/demo/timeline.ts` (`partBSegments`, built from
`project.partB.cuts`), `DocScene` + `theme.doc`. Numbers: house-recipe §15; problems and fixes: lessons B1–B13; gates:
verification §7.

| Film (Discount) | Segment | What |
|---|---|---|
| 36.4 s | (4-menu) | The Admin click drawn on the menu (ring + tink), 6 frames before the cut |
| 36.6–40.4 s | 6-desk-signin | The painted sign-in card at shot 4's 1.8x, pulling back to the card from the cut; email under a privacy blur; Sign In |
| 40.4–48.6 s | 7-desk-onboard | Name; the pen signs at 1.8x (felt-tip sound); Save → "You Are All Set" (ios_success); the camera pulls out; Start Working |
| 48.6–51.4 s | 8a / 8b | Handle A Sale (wide) → Start A Sale (the skeleton cut out) → the car |
| 51.4–54.4 s | 9-desk-buyer | The buyer's name |
| 54.4–59.1 s | 10a / 10b | The address read-back at 2.0x, Hold To Confirm (a rise under the fill, the hand off the label) → (dialog close cut out) "How Are They Paying?" → Cash |
| 59.1–62.5 s | 11-desk-guide | The guided sale |
| 62.5–65.6 s | 12-desk-signed | The packet: push onto "2 / 2 signed" (ios_success), held; Open / Print on the 130-U |
| 65.6–69.9 s | B6 | The 130-U in a Preview window; push onto the centred certification block, spotlight; the member's printed name and drawn signature; identity and money blurred; "Signed Once. On Every Title Application." |
| 69.9 s → | phone, outro | The desk and document dissolve to the wallpaper under the phone |

**Desk runbook** (after part A's steps 1–7 pass):

1. **Facts and data.** The owner confirms the desk host (`partBDomain`). Desk people and the deal are demo data
   (Maria Lopez, James Carter, the mock lot's car); check the demo address does not exist (lesson B13).
2. **Desk server** on :5190 only: `next dev` with `DESK_PREVIEW_MEMBER=fresh` (the preview mock is off in production;
   the css hides the dev indicator). Restart it to reset the mock before re-capturing 6 or 7. Kill it by PID.
3. **Storyboard.** `fill-client.cjs storyboard $I $S/assets/storyboard-desk.json` and merge the shots after 4-menu.
4. **Capture in the storyboard's order** (`partB.notes`): 6, 7, 8, 9, the B4 set-up walk + 11 `--var deal=`, 10, the
   off-camera complete sale (premium-dealer-build desk-walk `sale.cjs` + `ceremony.cjs`, scenario copies in scratch) +
   12 `--var deal=`. `pdftoppm -r 300 -f 1 -l 1` the deal's 130-U into `public/docs/130u-p1.png`.
5. **Measure `partB.cuts`** on the captures (verification §7), fill `client-inputs.json` → `partB` (cuts, docFileName,
   clock), refill `src/project.ts` (`fill-client.cjs project`).
6. **Cuts and stills.** `verify-film.cjs --cuts-only` must print CUTS PASS (part A's pixel cuts and part B's
   jump-cut gates); render the plan's stills (step 7b) and look at every part-B one.
7. **Render** `CRF=17 AUDIO_BITRATE=192k render.sh $P discount-demo` (about 30 min, background), then
   `verify.sh` and the by-eye list in verification §7.

## Narrated long cut (a variant, on request)

When the user asks for a narrated, long or explainer version, make the house film's long cut: the same window, cursor,
cameras, documents, phone and sounds, laid against a voice-over that walks the owner through the site and one whole
sale (Discount: composition `Narrated`, 3:50, 24 lines; the `Demo` composition is untouched). The edit follows the
voice: each line's picture shows what it says, the camera on the thing named as the word is said. The full recipe is
`references/narration.md`; problems and fixes are lessons N1–N12.

1. **Script: the house script, filled.** Every client gets the same 24 lines. Only the variables change: the dealer's
   name, the road customers drive to, what the lot sells, the legal name as said ("L L C"), the demo people and deal,
   and the optional lines (Spanish, the sell band, the seller lien). The script is `assets/narration/script-template.md`
   (variables table, conditions, per-line desk checks, how to fill and fact-check) and `lines-template.json`.
   ```bash
   node $S/scripts/fill-narration.cjs init $I       # adds client-inputs.json → narration to fill
   node $S/scripts/fill-narration.cjs check $I
   node $S/scripts/fill-narration.cjs lines $I --out $P/narration/lines.json     # what Kokoro voices
   node $S/scripts/fill-narration.cjs script $I --out $P/narration/script.md     # the owner reads it before voicing
   ```
   - Re-check every line against this client's desk before voicing, and list each feature seen working in
     `narration.checked`. The fill refuses a line whose feature is not listed, so an unshipped feature is never
     narrated.
   - A line the desk cannot back is cut, with its reason (`narration.cut`), never softened.
   - The paperwork on screen is the client's real dealership on a demo deal.
   - The fill also refuses: leftover `{{placeholders}}`, abbreviations in spoken values, half a setup/payoff pair, and
     Discount's facts reused for another client.
   - `fill-narration.cjs selftest` proves the template gives Discount's approved 24 lines exactly. A change to the
     wording is a template change, never a per-client edit.
2. **Voice** with Kokoro-82M `af_heart` at speed 0.95, one WAV per line; **transcribe back** with faster-whisper
   (`small.en`, word timestamps) and listen to every difference; the word times are the edit's anchors.
3. **Levels:** one gain for the set and a limiter at 0.70 (about −16 LUFS integrated, true peak ≤ −1.5 dBTP); each line
   trimmed to its speech. The film's own sounds duck 6 dB under the voice. No music.
4. **Storyboard against the voice** (timing table first), capture the new desk shots on one fresh server in order, then
   build the plan: segments (holds under overlays), overlays (the deal's real PDF pages, the phone ceremony), and lines
   anchored by key word, 0–0.3 s before the action they name; gaps 0.5–1 s within a thought, up to 3 s on a beat.
5. **Gates:** the plan check (gaps, cut continuity), stills at every segment start, zoom and document key, the render
   (h264 CRF 17, AAC 192k, +faststart) and a share copy under 40 MB, loudness, onsets, and a lip-to-picture table of
   key nouns in the project's narration README, with anything shown another way than the line says.

## What may change per client, and what may not

- **Per client** (all in `client-inputs.json`): domain, facts, outro lines, logos, the loader geometry, word and intro
  key (measured), clock and timezone, the storyboard placeholders, and `logoWidth` (derived from the logo). For the
  narrated cut, also the `narration` block: the script's variables, flags and desk checks. The wording itself is
  house.
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
- `references/narration.md`: the narrated long cut: the house script and its fill, Kokoro voice, transcribe-back,
  levels, the plan of anchored lines, landing rules, ducking, truthful stand-ins, gates.
- `examples/discount-used-cars/`: the approved film's `storyboard.json`, its `client-inputs.json` (with the narration
  block), `narration-lines.json` (the shipped 24 lines the template reproduces), and `NOTES.md` (timeline, cut point
  f1099, what was client-specific, the reproduction checks).

## Files

```
scripts/capture.cjs        storyboard shot → deterministic frames, shot.mp4, cursor.json (+ --selftest)
scripts/measure-site.cjs   loader geometry, intro key, Open Now; storyboard preflight with framing suggestions
                           (--storyboard, --rects, --into); read-only on the site
scripts/fill-client.cjs    client-inputs.json → project.ts / storyboard.json / README.md (check refuses placeholders)
scripts/fill-narration.cjs client-inputs.json → narration/lines.json + script.md from the house script (init, check,
                           lines, script; selftest reproduces Discount's 24 lines and every refusal)
scripts/new-project.sh     template + assets + filled files → clients/<slug>-demo, logoWidth, npm ci
scripts/render.sh          preflight, typecheck, master (CRF 16) + share copy (≤ 24 MB); --check stops before rendering
scripts/verify.sh          the gates (wraps verify-film.cjs; --plan and --cuts-only modes; --allow-* flags)
template/                  the shipped film's Remotion project (parts A and B, DocScene): src identical to the shipped
                           one except project.ts (placeholders, partB null) and theme.ts comments; lockfile pins
                           Remotion 4.0.532
template/scripts/stills.cjs     bundle once, render many stills (step 7b); deletes its own webpack bundle
template/scripts/prepare-sfx.sh rebuilds the sound kit from its source pack; only needed to swap a sound
assets/storyboard-dealer-site.json   the house storyboard with placeholders, `adapt` notes and `frame` / `rest` rules
assets/storyboard-desk.json          part B: the seven desk shots (house values; fills DESK_CLOCK and TIMEZONE)
assets/client-inputs.template.json   the one file filled per client
assets/narration/          the narrated cut's house script: script-template.md (variables, conditions, desk checks,
                           fill and fact-check) and lines-template.json (what fill-narration.cjs fills)
assets/project-README.md   the per-project README
assets/sfx/, assets/fonts/ the 17 sounds the film plays (SOURCES.md) and Barlow Semi Condensed (OFL.txt)
```

**Housekeeping:**

- Run heavy work under `nice -n 15`.
- Capture with `--clean`, since a DSF 2 shot is about 2.5 GB of PNG.
- Delete only the `/tmp/remotion-webpack-bundle-*` your runs created. `render.sh` and `stills.cjs` do this.
- Kill your preview server by its PID, after the cuts pass.
- Do not edit the client's site source: video-only fixes go in the storyboard's `captureCss`.
