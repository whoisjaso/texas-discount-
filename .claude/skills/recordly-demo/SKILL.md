---
name: recordly-demo
description: Make the house demo video for a car-dealer website (and later its staff sale desk), exactly as the approved Discount Used Cars film. It is a Recordly / Screen Studio style macOS screen recording of a premium-dealer-build site. The intro sting match-cuts onto the site's own loader, one macOS window holds every shot with hard pixel-matched cuts, and it has auto-zooms, a smoothed macOS cursor, an iPhone cut with iOS swipes, iOS sound effects and a facts-only outro. Ships the capture tool, the Remotion template, a dealer storyboard template, client-inputs filler, render and verify scripts. Use it whenever the user wants a demo video for a dealer, a video of the website or the desk, a walkthrough, product reel or screen-recording ad, says like the Discount video, do the video for this client, make it look like a Mac screen recording, or mentions Recordly or Screen Studio, even without the word demo.
---

# The house demo video (Recordly style)

This skill makes one film, the way the user approved it: Discount Used Cars, part A
(`clients/discount-used-cars-demo/out/demo-v1.mp4`). The film was approved with "exactly this way". So the job for a
new dealer is to reproduce that film on their site. It is not a new edit:

- The code, timings, sounds and look are fixed. They live in `template/` and are documented with their reasons in
  `references/house-recipe.md`.
- Only the client's facts, logos, measured loader geometry and a few page-dependent framing points change. They all
  live in one `client-inputs.json`.

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
- **The client's site:** a premium-dealer-build site under `clients/<slug>-site`, with its Vite toolchain and
  `public/brand` logos.
- **Remotion licence:** Remotion 4.0.532 is installed per project by `npm ci` from the template's lockfile (about
  440 MB). Remotion is free for individuals and companies of up to 3 people; a bigger agency needs a company licence.
- **Bundled in the skill:** the 15 processed sound files (`assets/sfx/`, see `SOURCES.md` for the Apple-sound note) and
  the Barlow Semi Condensed font (`assets/fonts/`, OFL).

## Runbook

Run from the repo root. Set `S=.claude/skills/recordly-demo`, plus `SCRATCH` (a scratch dir) and `SLUG`.

1. **Facts first.** Take the on-screen facts only from the site's `business.ts` fields sourced OWNER or TXDMV: the web
   address, phone, street and city, and short hours exactly as the visit card prints them. No prices, ratings or
   claims. If one is unconfirmed, ask the user. Do not guess.

2. **Client inputs.**
   `cp $S/assets/client-inputs.template.json clients/$SLUG-demo-inputs.json` and fill in the slug, client, `siteDir`,
   domain, `deskUrl`, facts, `outroLines`, `brand.logoReverse`, the clock (an open weekday about 2 PM local, with the
   correct DST offset) and the timezone. `loader`, `word`, `introKey` and `brand.mark` are measured in step 4.
   `examples/discount-used-cars/client-inputs.json` is a complete one.

3. **Build the site with the Admin link, and serve it on :5183.** `VITE_DESK_URL` makes the drawer's Admin row render;
   it is never navigated in part A. Use vite's own binary so `$!` is the PID to kill. Never touch ports another
   workflow uses (the sale desk runs on 5190; 5181 is taken too).
   ```bash
   cd clients/$SLUG-site
   VITE_DESK_URL=<deskUrl> npx vite build --outDir $SCRATCH/dist-demo --emptyOutDir
   ./node_modules/.bin/vite preview --outDir $SCRATCH/dist-demo --port 5183 --strictPort > $SCRATCH/preview.log 2>&1 &
   echo $! > $SCRATCH/preview.pid; cd -
   ```

4. **Measure the site.** This writes the loader rects, word, intro key and mark into the inputs, and checks "Open Now"
   at the clock. On a new site or machine, also run the capture self-test, which must PASS.
   ```bash
   node $S/scripts/measure-site.cjs --into clients/$SLUG-demo-inputs.json
   node $S/scripts/capture.cjs --selftest --dsf 1,2 --out $SCRATCH/selftest --clock <clock>
   ```

5. **Create the project.** This copies the template, sounds, fonts and logos, and writes `src/project.ts`,
   `storyboard.json` and `README.md`. It then runs `npm ci` under nice. It also copies the inputs to
   `clients/$SLUG-demo/client-inputs.json`; edit that copy from here on.
   ```bash
   bash $S/scripts/new-project.sh clients/$SLUG-demo-inputs.json clients/$SLUG-demo
   ```

6. **Adapt the storyboard placeholders.** These are the service-band focus, the jiggle and, when the layout differs,
   the card focus and swipes (`references/storyboard.md`, last section). Measure, edit `storyboard` in the inputs,
   refill, and repeat until the preflight is clean. If you change facts or logos, refill `project.ts` the same way
   (`fill-client.cjs project … --out clients/$SLUG-demo/src/project.ts`).
   ```bash
   P=clients/$SLUG-demo
   node $S/scripts/measure-site.cjs --storyboard $P/storyboard.json
   node $S/scripts/fill-client.cjs storyboard $P/client-inputs.json $S/assets/storyboard-dealer-site.json --out $P/storyboard.json
   ```

7. **Capture the five shots, in order**, then check the cuts before rendering:
   ```bash
   for id in 1-hero 2-scroll 3-buy 4-menu 5-phone; do
     node $S/scripts/capture.cjs --storyboard clients/$SLUG-demo/storyboard.json --shot $id \
       --out $SCRATCH/captures/$id --publish clients/$SLUG-demo/public/shots --clean
   done
   node $S/scripts/verify-film.cjs --project clients/$SLUG-demo --cuts-only --out $SCRATCH/cuts
   kill "$(cat $SCRATCH/preview.pid)"
   ```
   Order matters because each shot starts its cursor where the previous capture ended. A failed cut means re-staging
   that shot's preroll (lessons C8–C10), not a dissolve.

8. **Render** the master (h264 CRF 16 + AAC) and the share copy (≤ 24 MB, `+faststart`). This takes about 12 minutes
   under nice, and runs the typecheck in the foreground first.
   ```bash
   bash $S/scripts/render.sh clients/$SLUG-demo demo-v1
   ```

9. **Verify.** Every gate must pass (next section). Then open the contact sheet, look at every still, and view the zoom
   stills at 100%.
   ```bash
   bash $S/scripts/verify.sh clients/$SLUG-demo out/demo-v1.mp4 $SCRATCH/verify-v1
   ```

10. **Send it in chat.** Use `SendUserFile` with `out/demo-v1-share.mp4` (and the contact sheet if useful), plus a
    short note:
    - length and running order
    - the master's path
    - that every gate passed
    - the owner decisions from the project README: site copy in zooms, video-only CSS, hidden fine print, desk host

    Do not describe a film you have not verified.

## Gates before sending

Every one is scripted, and the approved Discount film passes all of them. Details and what each catches are in
`references/verification.md`.

| Gate | Pass |
|---|---|
| Frame count | Equals `timeline.total`: 1920×1080, h264, 30 fps, AAC present |
| Luma scan | No one-frame spike in the per-frame scan; the last frame is black |
| In-window cuts | PSNR ≥ 45 dB, with the same cursor point, pointer shape and scroll |
| White level | A white page reads white at the window's edges (the recording is never graded) |
| Peak | True peak < −1 dBTP |
| Onset map | Every onset sits on a cue the composition plays; no isolated blips |
| Stills | About 46 labelled stills looked at: one logo through the hand-off, zooms framed with no edge through text, rings visible, the phone opaque by frame 2, the outro under the phone, only facts on screen, a black last frame |

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
  key (measured), clock and timezone, and the storyboard placeholders. Also `theme.outro.logoWidth`, only for a
  near-square logo.
- **House, never per client:** everything else in `template/`, including every timing, depth, ease, spring, colour,
  sound level and cue rule, and the capture settings. If a site truly forces a change, write the reason in the project
  README, change it in one place, and re-run every gate. Many of these numbers fixed a defect a critic found, and
  `references/lessons.md` says which.
- **Not a dealer site, or no intro loader:** the house cut does not apply as is, because the intro is a match cut onto
  the loader. Tell the user, and agree the change before building anything.

When you change composition code, read the remotion-motion-graphics skill first. The template follows its rules,
except one deliberate override: the grade and vignette sit under the window.

## References

- `references/house-recipe.md`: every constant with its value and reason (the source of truth for "exactly this way").
- `references/lessons.md`: every rule as rule / why / symptom, the decisions kept (do not "fix" them), and open items.
- `references/storyboard.md`: every storyboard and capture field, cursor.json, `DesktopSegment`, and adapting the
  placeholders.
- `references/verification.md`: the gates, the stills list, the thresholds, and what to do with a failure.
- `examples/discount-used-cars/`: the approved film's `storyboard.json`, its `client-inputs.json`, and `NOTES.md`
  (timeline, cut point f1099, what was client-specific, the reproduction check).

## Files

```
scripts/capture.cjs        storyboard shot → deterministic frames, shot.mp4, cursor.json (+ --selftest)
scripts/measure-site.cjs   loader geometry, intro key, Open Now, storyboard preflight (read-only)
scripts/fill-client.cjs    client-inputs.json → project.ts / storyboard.json / README.md
scripts/new-project.sh     template + assets + filled files → clients/<slug>-demo, npm ci
scripts/render.sh          preflight, typecheck, master (CRF 16) + share copy (≤ 24 MB)
scripts/verify.sh          the gates (wraps verify-film.cjs; --plan and --cuts-only modes)
template/                  the approved film's Remotion project: src identical to the shipped one except
                           project.ts (placeholders) and one theme.ts comment; lockfile pins Remotion 4.0.532
assets/storyboard-dealer-site.json   the house storyboard with placeholders and `adapt` notes
assets/client-inputs.template.json   the one file filled per client
assets/project-README.md   the per-project README
assets/sfx/, assets/fonts/ the 15 sounds the film plays (SOURCES.md) and Barlow Semi Condensed (OFL.txt)
```

**Housekeeping:**

- Run heavy work under `nice -n 15`.
- Capture with `--clean`, since a DSF 2 shot is about 2.5 GB of PNG.
- Delete only the `/tmp/remotion-webpack-bundle-*` your runs created. `render.sh` and `stills.cjs` do this.
- Kill your preview server by its PID.
- Do not edit the client's site source: video-only fixes go in the storyboard's `captureCss`.
