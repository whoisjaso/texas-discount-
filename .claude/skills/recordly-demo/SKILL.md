---
name: recordly-demo
description: >-
  Make the house demo videos for a car dealer's website and staff sale desk, exactly as the approved
  Discount Used Cars films, in gated steps (the user reviews the short cut, approves script and
  voice): the short Recordly / Screen Studio style macOS screen recording (loader match-cut
  intro, pixel-matched cuts, auto-zooms, smoothed cursor, iPhone cut, iOS sounds, facts-only outro)
  and the narrated long cut (a fact-checked money-made / time-saved script voiced free with Kokoro).
  Ships the scripts, the Remotion template and a runbook any agent or model can run. Use it whenever
  the user wants a demo video for a dealer, a screen recording or walkthrough of the site or desk, a
  narrated or voice-over walkthrough, a product reel, promo or screen-recording ad, a social
  video, says "do the video for this client" or "like the Discount video", wants a Mac screen
  recording look, or mentions Recordly or Screen Studio, even without the word demo. Use it instead
  of a from-scratch dealer video with remotion-motion-graphics.
---

# The house demo video (Recordly style)

This skill makes the films the user approved for Discount Used Cars, "exactly this way", for a new dealer:

- **The house film** (the deliverable when the client has the sale desk, about 80 s): part A, the site (49.2 s in the
  approved `demo-v1`, now frames 0–1092 of `clients/discount-used-cars-demo/out/discount-demo.mp4`); part B, the sale
  desk in the same window (sign-in, first sign-in, a sale, the signed 130-U); the phone; the outro. `demo-v1` alone is
  an internal checkpoint, never sent, unless the client has no desk.
- **The narrated long cut** (on request, after the house film): the same window, cursor, documents, phone and sounds
  against a voice-over that walks the owner through the site and one whole sale (Discount: 3:50, 24 lines).

It is not a new edit. The code, timings, sounds and look are fixed in `template/` and documented with their reasons in
`references/house-recipe.md`. Only the client's facts, logos, measured geometry, a few framing points and the desk's
demo inputs change, all in one `client-inputs.json`, and the tools measure most of them.

**Where this sits in a dealer build:** premium-dealer-build's Phase 6 (6a the short cut, 6b the script, 6c the voice
and the narrated cut), after its Phase 5 has verified the site and the desk and before its Phase 7 delivers and deploys.
The gated steps below are the order every run follows.

Recordly (github.com/webadderallorg/Recordly) is AGPL-3.0 and cannot run headless. **None of its code is used.** Only
its published tuning numbers are, as reference (zoom depths, zoom timings, cursor smoothing, click bounce, motion
blur). Our own capture (`scripts/capture.cjs`) and Remotion composition reproduce the look.

## How to run it: under any agent or model

Everything is a numbered step with one command, a PASS gate and a written rule for a FAIL
(`assets/runbook.json`; the same as prose in `references/runbook.md`). `scripts/runbook.cjs` walks it.
`$S` is the absolute folder that holds this SKILL.md: `export S=<that folder>` before S0 (demo.env sets it from S2 on).

```bash
bash $S/scripts/setup.sh --check                              # S0: the machine (each missing piece with its remedy)
bash $S/scripts/env.sh --slug <slug> --scratch <absolute scratch dir> (--desk clients/<slug>-desk | --no-desk)   # S2
source <scratch>/demo.env                                     # at the top of EVERY later command
node $S/scripts/runbook.cjs next                              # the next step's card, variables resolved
node $S/scripts/runbook.cjs run <id>                          # run and judge it (long steps detach through bg.sh)
node $S/scripts/runbook.cjs check <id>                        # judge a long step once bg.sh says DONE
node $S/scripts/runbook.cjs mark <id> --by-user "<their words>" | --by-agent "<what you looked at>"
node $S/scripts/runbook.cjs status                            # where the run is
```

The rules that make it repeatable on any model (`references/harness.md`):

1. **Variables live in `$SCRATCH/demo.env`,** sourced in every call; the voice venv and models live in
   `$HOME/.cache` (durable), never in a session's scratch.
2. **Anything over two minutes runs through `scripts/bg.sh`** (setsid, a log, an exit-code file) and is polled
   (`bg.sh wait <name> 540`). Never hold a capture or a render in a foreground call a harness may cut off.
3. **Two ports only:** the site on :5183 (`site-server.sh`), the desk on :5190 (`desk/desk-server.sh`), each in its
   own process group, stopped by group. A taken port is waited for, never swapped. Never `npm install` in the desk.
4. **Never self-certify what you cannot perceive.** A model that cannot view images or hear audio sends the contact
   sheet, the stills or the film to the user and records their words (`mark --by-user`). Approvals (the onboarding
   choice, the script, the voiced set) are always the user's.
5. **Never force a gate.** An `--allow-*` needs its recorded row in `$P/verify-decisions.md` first; every allowance is
   in the send note. `run <id> --force` needs `--why` and the user's own words (`--by-user`); it is
   recorded, shows as PASS* and is carried into the send note. Re-running a step marks every step built on it STALE
   (`status` and `next` show it), and an approval of something that has since changed is asked again.
6. **Never invent a fact or a figure.** On-screen facts come from owner- or TxDMV-sourced fields; the demo fee from
   the owner or the user; an unconfirmed value is asked of the user.
7. **Every file sent in chat is ≤ 28 MB** (the upload limit is 30 MB): `share.sh` makes it; the master is never sent.

## The gated steps (in this order; stop at every gate)

**Prerequisites** (premium-dealer-build; never film a stand-in for any of them): Phase 1, the user-approved site
(G1) with its Admin link; Phase 3, the real inventory loaded (or the user's words that the stand-ins are filmed);
Phases 4 and 5, the desk built and verified (G5); and the kickoff answers asked at its G0 (B0's onboarding path,
demo fee and desk address; the narration flags). A site-only film needs Phases 1 and 3. Asked for a video before
these exist, say which one is missing and offer to do it first.

| # | Step | Runbook | Gate |
|---|---|---|---|
| 1 | Setup: the machine, the run's variables, the voice venv when narrated | S0, S2, S1 | the scripted checks |
| 2 | Site capture: facts, build, measure, project, storyboard, the five shots, the cut gate, the stills | A1-A8 (B0 at kickoff) | A8 by eye |
| 3 | Desk capture: the desk on :5190, part B and the off-camera sales on one fresh desk | B1-B7 | B6v by eye |
| 4 | Short-cut render: render, verify, one watch with sound, the chat copy | B8-B10 | B9w by ear |
| **G1** | **Short cut review** (soft): send `<slug>-demo-chat.mp4`, the contact sheet and the send note; ask "Here is the short cut (<length>). Anything to change before I write the narrated script?" | B11 | the user's go, or "keep going" recorded |
| 5 | Script fill and fact-check: offer the narrated cut, fill the house script, check every line on this desk | N0-N1 | `check` PASS |
| **G2** | **Script approval** (hard): send `narration/script.md`; ask "Approve it as written, or tell me what to change. Nothing is voiced until you approve." | N2 | `mark N2 --by-user` |
| 6 | Voice: Kokoro-82M af_heart, one WAV per line, `preview.mp3` | N3 | scripted |
| 7 | Transcribe-back: every difference decided and recorded | N4 | scripted |
| **G3** | **Voice preview** (hard): send `preview.mp3` and `transcribe-diff.md`; ask "Does the voice sound right, and do you accept the differences listed?" | N5 | `mark N5 --by-user` |
| 8 | The narrated cut: levels, the demo card, the long storyboard, captures, the plan, stills, render, verify | N6-N13 | N11 by eye; N13 scripted |
| **G4** | **Final gate** (hard): send the narrated chat copy, the contact sheet, `narration/lip-to-picture.md` and the send note; ask "Here is the narrated walkthrough (<length>). Is it ready to show the dealer?" | N14 | the user's yes |

A site-only film runs steps 1-2, then R1-R4 (its gate is R4, the user's go on `demo-v1`). Hard gates always wait; a
soft gate waits too unless the user said "keep going", and then the status file records it (standalone: say so in the
chat). A gate never passes on a model's own judgement (rule 4 above), and re-running a step makes every later gate
STALE, so it is asked again. In a dealer build, tick the matching Phase 6 rows of `clients/<slug>-STATUS.md` at each
gate and commit it (recordly-demo's G1-G4 are its G6a-G6d); `runbook.cjs status` is the run's own record.

## The runbook at a glance

| Step | What | Command (after `source demo.env`) |
|---|---|---|
| S0 | Check the machine | `bash $S/scripts/setup.sh --check` |
| S1 | Voice venv (narrated only; long) | `bash $S/scripts/setup.sh --voice` |
| S2 | Run variables | `bash $S/scripts/env.sh --slug … --scratch …` |
| A1 | Facts → client-inputs.json | copy `assets/client-inputs.template.json`; `fill-client.cjs check $I --stage facts` |
| A2 | Build the site with the Admin link, serve :5183 | `bash $S/scripts/site-server.sh build-start` |
| A3 | Measure the site (loader, intro key, Open Now) | `node $S/scripts/measure-site.cjs --into $I` |
| A3s | Capture self-test (new site or machine; long) | `node $S/scripts/capture.cjs --selftest --dsf 1,2 …` |
| A4 | Create the project (npm ci; long) | `bash $S/scripts/new-project.sh $I $P [--narrated]` |
| A5 | Adapt and preflight the storyboard (loop) | `measure-site.cjs --storyboard … --rects --into $I` → PREFLIGHT CLEAN |
| A6 | Capture 1-hero … 5-phone in order (long) | `bash $S/scripts/capture-all.sh $P/storyboard.json 1-hero 2-scroll 3-buy 4-menu 5-phone` |
| A7 | Cut gate; stop the site | `verify-film.cjs --cuts-only` → CUTS PASS; `site-server.sh stop` |
| A8 | Part-A stills, looked at (by eye) | `stills.cjs` on the plan's frames; `mark A8` |
| B0 | Asked at kickoff with A1: the onboarding choice, demo fee, desk host, demo data | `check-address.cjs --which addressPartB --write`; `fill-client.cjs check $I --stage desk`; `mark B0 --by-user` |
| B1 | The desk on :5190 | `bash $S/scripts/desk/desk-server.sh start` |
| B2 | Merge the desk shots | `fill-client.cjs desk-storyboard $I --into $P/storyboard.json` |
| B3 | Desk theme + selector preflight, fresh desk | `desk/theme.cjs`, `measure-site.cjs --desk`, `desk-server.sh restart` |
| B4 | Part B captures + off-camera sales (long) | `bash $S/scripts/capture-desk.sh` |
| B5 | Measure the cuts, refill project.ts | `measure-desk-cuts.cjs --into $I`; `fill-client.cjs project` |
| B6 / B6v | Every cut; every still (by eye) | `verify-film.cjs --cuts-only`; stills; `mark B6v` |
| B7 | Stop the desk (next-env.d.ts restored) | `desk-server.sh stop` |
| B8 | Render master + chat copy (long) | `CRF=17 AUDIO_BITRATE=192k render.sh $P $SLUG-demo` |
| B9 / B9w | Verify; contact sheet + one full watch with sound | `verify.sh $P out/$SLUG-demo.mp4 $SCRATCH/verify`; `mark B9w` |
| B10 / B11 | Chat copy ≤ 28 MB; send with the filled note | `share.sh`; `fill-client.cjs send-note`; `mark B11` |
| N0 | Offer the narrated cut (or skip it with the user's words) | `fill-narration.cjs init $I`, or `runbook.cjs skip N0 --by-user` |
| N1-N14 | The narrated cut (on request) | script → approval → voice → transcribe-back → approval → levels → card → long storyboard → captures → plan (`narrated-plan.cjs --draft` starts it) → stills → render → verify → send |

A site with no desk (rare: the house cut ends on the desk's Admin row, so ask the user first) runs S0-A8, then R1-R4
(render, verify, watch, send `demo-v1`).

## Part A: the site (the house cut, 49.2 s at 30 fps)

| Film | Shot | What happens |
|---|---|---|
| 0–2.0 s | intro | The loader's mark wipes in and its word staggers in. From 1.4 s it shrinks onto the site's own loader inside the springing macOS window (a match cut), lands at 1.87 s and dissolves into it. |
| 1.4–7.9 s | 1-hero | The curtain lifts on the hero. The cursor drifts in and rests beside the headline. A 1.5× zoom on the headline. |
| 7.9–24.9 s | 2-scroll | The lineup band; a 2.0× zoom on the featured card (hovered). The visit card at 1.8× ("Open Now"). The finder: click, type a model. |
| 24.9–30.6 s | 3-buy | The service band; a 2.0× zoom on the middle tile (hovered). |
| 30.6–36.6 s | 4-menu | Menu, the drawer opens, and the camera holds 1.8× on "Admin · Staff Sign-In To The Sale Desk" with the hand resting on it. |
| 36.6 s | **CUT POINT** | Part B (the sale desk) goes here. |
| 36.6–45.6 s | 5-phone | An iPhone slides in while the desktop recedes. Three iOS swipes down the lineup, then the phone drops away. |
| 45.4–49.2 s | outro | Drawn under the phone: the logo, the URL, phone · address, and hours; a slow push; a fade to black. |

Why it works: it opens on the dealer's own brand moment and the product is visible by about 3 s; every cut inside the
window is invisible (pixel-matched); the camera moves like Screen Studio (the whole window leans into each zoom);
nothing is still for more than about 4 s; the sound is native and quiet; the only words the film adds are
owner-confirmed facts.

**Facts first (A1).** Take the on-screen facts only from the site's `business.ts` fields sourced OWNER or TXDMV: the
web address (www. + domain), the phone as (000) 000-0000, street and city, and the short hours line exactly as
`hoursShort` prints it, without closed days (split days as the site writes them: "Mon – Fri 9 AM – 7 PM, Sat 9 AM –
5 PM"). Copy every string character for character ("Gulf Fwy", not "Gulf Freeway"). No prices, ratings or claims.
`check --stage facts` compares them with `business.ts` and refuses placeholder words. `FINDER_QUERY` is read off the
served site's `/inventory`. Ask B0's questions at the same kickoff. The clock is **Wednesday 2026-09-30T14:00 in the dealer's zone with that
day's UTC offset** (the next open weekday at 14:00 if closed on Wednesdays). `brand.logoReverse` is the full-colour
logo the site itself shows on dark; never recolour or invert a logo. `examples/discount-used-cars/client-inputs.json`
is a complete one.

**Capture notes.** Order matters: each shot starts its cursor where the previous capture ended, so re-capturing shot
N means every later shot too (`capture-all.sh --from N` refuses otherwise). A failed cut means re-staging that shot's
preroll (lessons C8–C10), not a dissolve; `--allow-cut` exists only for the site's own small looping animation
(verification §6), with its recorded row. Re-rendering an existing client: symlink its `public/shots/<id>/` folders
into the project instead of re-capturing; still run `--cuts-only` and `render.sh --check`.

## Part B: the desk (when the client has the premium-dealer-build sale desk)

Shipped once in the Discount film (`out/discount-demo.mp4`, 82.5 s): part A unchanged to the cut point, then the desk in
the SAME window, then B6 (the signed 130-U), then the phone and outro. House recipe too: shots in
`assets/storyboard-desk.json`, segments in `template/src/demo/timeline.ts` (`partBSegments`, from
`project.partB.cuts`), `DocScene` + `theme.doc`. Numbers: house-recipe §15; problems and fixes: lessons B1–B14; gates:
verification §7; the capture recipe: `references/desk-capture.md`.

| Film (Discount) | Segment | What |
|---|---|---|
| 36.4 s | (4-menu) | The Admin click drawn on the menu (ring + tink), 6 frames before the cut |
| 36.6–40.4 s | 6-desk-signin | The painted sign-in card at shot 4's 1.8x, pulling back to the card; email under a privacy blur; Sign In |
| 40.4–48.6 s | 7-desk-onboard | Name; the pen signs at 1.8x (felt-tip sound); Save → "You Are All Set"; the camera pulls out; Start Working |
| (owner path) | 7b-desk-fees | Your Fees: the demo fee typed (partB.demoFee), the yes/no screens answered No, Save Fees, Done |
| 48.6–51.4 s | 8a / 8b | Handle A Sale (wide) → Start A Sale (the skeleton cut out) → the car |
| 51.4–54.4 s | 9-desk-buyer | The buyer's name |
| 54.4–59.1 s | 10a / 10b | The address read-back at 2.0x, Hold To Confirm → (dialog close cut out) "How Are They Paying?" → Cash |
| 59.1–62.5 s | 11-desk-guide | The guided sale |
| 62.5–65.6 s | 12-desk-signed | The packet: push onto "2 / 2 signed", held; Open / Print on the 130-U |
| 65.6–69.9 s | B6 | The 130-U in a Preview window; push onto the certification block; the member's printed name and drawn signature; identity and money blurred; "Signed Once. On Every Title Application." |
| 69.9 s → | phone, outro | The desk and document dissolve to the wallpaper under the phone |

- **The onboarding choice is the user's (B0).** The storyboard predates the owner's Your Fees step; `fresh` is now an
  owner who meets it. Ask: film the owner's first sign-in with Your Fees (then `partB.demoFee`, the owner's figure or
  one the user approved, named as a demo input in the README and the send note, never on screen), or a salesperson's
  (`fresh-sales`, no fees screen). `7b-desk-fees` is written but not yet captured, and its composition segment is
  added and tuned on the first owner-fees run (`render.sh` refuses until then; references/desk-capture.md §3).
- **The desk changes under the video.** Before every desk capture, the preflight (B3) replays every desk shot and the
  scenarios are validated against the desk's questions; the runbook refuses the captures while the desk has moved since
  the clean preflight. What changed is in the desk's `docs/verification/paperwork-pages/corridor-changes.md`.
- **Off camera** (`capture-desk.sh`): the set-up deal for 11, the complete sale for 12 signed by the buyer's hand
  (`desk/ceremony-hand.cjs`, never a sine wave: it prints on the paper), the PDFs, `docFileName`, and the 130-U page
  rasterised by its text (`raster-docs.sh --find CERTIFICATION`). One automatic restart-and-retry, then stop.

## Narrated long cut (a variant, on request)

The same window, cursor, cameras, documents, phone and sounds, laid against a voice-over. The edit follows the voice:
each line's picture shows what it says, the camera on the thing named as the word is said (Discount: composition
`Narrated`, 3:50, 24 lines; `Demo` is untouched). The recipe is `references/narration.md`; lessons N1–N12.

1. **Script (N1-N2):** the house script, filled: `fill-narration.cjs init / check / lines / script`
   (`assets/narration/`). Every line is checked against this client's desk (`narration.checked`: the corridor
   commit and the desk walk's `walk-report.json` as evidence); a line the desk cannot back is cut with its reason.
   `check --desk $DESK_DIR` refuses a check on another corridor commit. The user approves `script.md` before anything
   is voiced. The kickoff answers set the flags (`script-template.md`, Kickoff answers to flags).
2. **Voice (N3-N5):** `voice/voice.py` (Kokoro-82M af_heart, speed 0.95, one WAV per line, `preview.mp3`);
   `voice/transcribe.py` (faster-whisper small.en; every difference decided and recorded; medium.en is the second
   opinion for a model that cannot listen). The user approves the voiced set.
3. **Levels (N6):** `voice/prepare-vo.py`: one computed gain, a limiter at 0.70, trimmed lines; the set −16 ± 0.5
   LUFS, true peak ≤ −1.5 dBTP. No music; the film's sounds duck 6 dB under the voice.
4. **Captures (N7-N9):** the demo card (`make-demo-card.mjs`: a PDF417 the desk's scanner decodes), the long
   storyboard (`fill-client.cjs long-storyboard`), its desk preflight, then `capture-narrated.sh` on one fresh desk.
5. **Plan and gates (N10-N14):** `src/narrated/plan.ts` written from this run's captures (the template's is an empty
   skeleton, and `narrated-plan.cjs --draft` writes a starting one; `examples/discount-used-cars/plan.ts` is the worked
   one); `narrated-check.cjs` (PLAN OK);
   `narrated-plan.cjs` (the lip-to-picture table and its gate, from `narration.anchors`); stills; the render
   (`render.sh --composition Narrated`, ~80 min, through bg.sh); `verify.sh --composition Narrated`; the chat copy.

## Gates before sending

`verify.sh` runs every scripted row and exits non-zero on any failure; the approved Discount film passes all of them.
The last two rows are looked at and listened to, and recorded (`runbook.cjs mark`). Details: `references/verification.md`.

| Gate | Pass |
|---|---|
| Placeholders | No double-brace value left in `src/project.ts` or `storyboard.json` |
| Frame count | Equals `timeline.total`: 1920×1080, h264, 30 fps, AAC present |
| Luma scan | No one-frame spike in the per-frame scan; the last frame is black |
| In-window cuts | PSNR ≥ 45 dB (or a recorded `--allow-cut` for a ≤ 64×64 px site animation at ≥ 40 dB), same cursor point, pointer shape and scroll |
| Part-B jump-cuts | Pointer ≤ 1.5 CSS px, camera scale Δ ≤ 0.01, pan ≤ 3 px; the first frame painted (edge density ≥ 11) |
| White level | A white page reads white at the window's edges (never graded); INFO means the two named stills by eye |
| Peak | True peak < −1 dBTP |
| Onset map | Every onset sits on a cue the composition plays; no isolated blips |
| Stills (by eye, recorded) | About 46 labelled stills (and part B's): one logo through the hand-off, zooms framed with no edge through text, rings visible, the phone opaque by frame 2, the outro under the phone, only facts on screen, privacy blurs on the desk, a black last frame |
| Watch (by ear, recorded) | The whole chat copy once at speed, with sound |

## What to send, and when

Attach with your harness's file-sending tool (SendUserFile in Claude Code). Never the master; every file ≤ 28 MB.

| When | Send | Then |
|---|---|---|
| A by-eye or by-ear gate, and the model cannot see or hear | `contact-sheet.png`, the named stills, or the chat copy | wait for an explicit OK; `mark --by-user` |
| B0 | the onboarding question, verbatim | record the answer and the fee's source |
| The house film is done (B11, gate G1) | `<slug>-demo-chat.mp4` + `contact-sheet.png` + the filled send note | wait for the user's go (or a recorded "keep going") before N1 |
| N2 (gate G2) | `narration/script.md` | wait for approval |
| N5 (gate G3) | `narration/preview.mp3` + `transcribe-diff.md` | wait for approval |
| The narrated cut is done (N14, gate G4) | `<slug>-demo-narrated-chat.mp4` + contact sheet + `narration/lip-to-picture.md` + send note | wait for the user's yes |

The send note (`fill-client.cjs send-note`) covers the length and running order, the master's path, every gate and
every recorded allowance, the facts on screen, the onboarding filmed and the demo fee with its source, the timing
overrides, and that the iOS sounds are cleared for showing the dealer, not for a paid ad (if the user says it will run
as an ad, the sounds need replacing first: `assets/sfx/SOURCES.md`; do not swap them without their choice). Do not
describe a film you have not verified. Commit the project's `client-inputs.json`, `storyboard.json`, `src/`,
`public/sfx`, `public/fonts`, `public/brand`, `verify-decisions.md` and README; never `public/shots/` or `out/`.

## What may change per client, and what may not

- **Per client** (all in `client-inputs.json`): domain, facts, outro lines, logos, the loader geometry, word and intro
  key (measured), clock and timezone, the storyboard placeholders, `logoWidth` (derived from the logo), and with a
  desk: the onboarding choice, the demo fee and its source, the desk clock, the demo phone and addresses, the measured
  cuts. For the narrated cut: the `narration` block (the script's variables, flags, desk checks, anchors). The wording
  itself is house.
- **House, never per client:** everything else in `template/` and the storyboards, including every timing, depth,
  ease, spring, colour, sound level and cue rule, and the capture settings. If a site truly forces a timing change, put
  it in `client-inputs.json` → `overrides` with its reason (the README lists it) and re-run every gate. A desk change
  that breaks a shot is a template change, said in the send note. Many of these numbers fixed a defect a critic
  found; `references/lessons.md` says which.
- **Not a dealer site, no intro loader, or no sale desk:** the house cut does not apply as is. Tell the user and agree
  the change before building.

When you change composition code, read the remotion-motion-graphics skill first. The template follows its rules,
except one deliberate override: the grade and vignette sit under the window.

## Requirements (setup.sh checks every one)

- Node 22 and npm registry access; Playwright 1.56.x (`PWPATH`, default the global npm root) with Chromium and
  chromium_headless_shell under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`). Never `playwright install`
  without the user's OK (`references/harness.md` §6 has the commands for another machine).
- ffmpeg/ffprobe with libx264, aac, ebur128, silencedetect, alimiter, psnr and signalstats; python3 ≥ 3.10 with PIL and
  numpy; poppler (pdftoppm, pdftotext); curl, openssl, setsid; ≥ 8 GB free (20 recommended).
- The narrated cut: python3.11 (or 3.10 / 3.12) for the voice venv; ~2 GB for it and ~1 GB of models.
- The client's site under `clients/<slug>-site` with its `npm ci` done, real inventory loaded and `public/brand`
  logos; with a desk, `clients/<slug>-desk` with its own install (never `npm install` it from here).
- Remotion 4.0.532 is installed per project by `npm ci` from the template's lockfile (about 440 MB). Remotion is free
  for individuals and companies of up to 3 people; a bigger agency needs a company licence (ask the user).
- Bundled: the 15 processed sounds (`assets/sfx/`, cleared for showing the dealer, not for a paid ad), Barlow Semi
  Condensed (`assets/fonts/`, OFL), DejaVu Sans for the demo card (`assets/narrated/`, its licence beside it).

## References

- `references/runbook.md`: every step's card (generated from `assets/runbook.json`).
- `references/harness.md`: long jobs, ports, demo.env, what a model must never decide alone, other machines, and the
  Claude Code appendix.
- `references/desk-capture.md`: the desk server, sessions, onboarding paths, clock, demo data, preflight, capture order,
  signatures, documents, and what to do when the desk changes.
- `references/house-recipe.md`: every constant with its value and reason (the source of truth for "exactly this way").
- `references/lessons.md`: every rule as rule / why / symptom, the decisions kept, open items.
- `references/storyboard.md`: every storyboard and capture field, cursor.json, `DesktopSegment`, adapting placeholders.
- `references/verification.md`: the gates, the stills list, thresholds, the decisions record, what to do with a failure.
- `references/narration.md`: the narrated cut: script, voice, transcribe-back, levels, the plan, landing rules, gates.
- `examples/discount-used-cars/`: the approved film's `storyboard.json`, `client-inputs.json` (narration block with
  anchors, demo data), `narration-lines.json`, `plan.ts`, `storyboard-long.json`, and `NOTES.md`.

## Files

```
scripts/setup.sh            S0 machine check; --voice builds the voice venv (idempotent)
scripts/env.sh              S2: $SCRATCH/demo.env
scripts/bg.sh               long jobs: start | status | wait | tail | stop | list (setsid, log, exit code)
scripts/runbook.cjs         status | next | show | run | check | mark | doc | selftest
scripts/decisions.cjs       $P/verify-decisions.md: by-eye / by-ear / approval rows and allowances
scripts/site-server.sh      the site on :5183 (build-start | stop | status)
scripts/capture.cjs         storyboard shot → deterministic frames, shot.mp4, cursor.json (+ --selftest)
scripts/capture-all.sh      shots in order, restart-from-N rule
scripts/capture-desk.sh     part B's captures and off-camera steps on one fresh desk
scripts/capture-narrated.sh the narrated cut's captures and off-camera steps
scripts/measure-site.cjs    loader, Open Now, storyboard preflight; --desk: the desk selector preflight + commit stamp
scripts/measure-desk-cuts.cjs  partB.cuts from the desk captures' edge density
scripts/fill-client.cjs     client-inputs.json → project.ts, storyboards (site, desk, long), scenarios, README, send note
scripts/fill-narration.cjs  client-inputs.json → narration/lines.json + script.md (selftest: Discount's 24 lines)
scripts/check-address.cjs   a demo address against the Census geocoder, recorded in demo.<which>.how (B0, N7)
scripts/new-project.sh      template + assets + filled files → clients/<slug>-demo, npm ci (no install fallback)
scripts/render.sh           preflight, typecheck, master (+faststart), chat copy; --composition, --frames, --concat
scripts/share.sh            the chat copy: two-pass x264 to <= 28 MB, frames = the master's
scripts/verify.sh           the gates (verify-film.cjs, or narrated-verify.cjs with --composition Narrated)
scripts/raster-docs.sh      a deal PDF's page, chosen by its text, as the exact PNG the film reads
scripts/make-demo-card.mjs  the demo licence (PDF417 decoded back) for the narrated scan
scripts/narrated-{check,frames,verify,plan}.cjs   the narrated plan check, stills list, film gates, lip-to-picture gate
scripts/voice/              voice.py, transcribe.py, prepare-vo.py, smoke.py, common.py
scripts/desk/               desk-server.sh, theme.cjs, onboard.cjs, ceremony-hand.cjs, signing-link.cjs,
                            review-confirm.cjs, close-sale.cjs, latest-deal.cjs, validate-scenario.cjs, corridor.cjs,
                            lib.cjs
scripts/card/demo-card.py   the demo card's front and back camera frames
template/                   the shipped film's Remotion project (parts A and B, DocScene, src/narrated with an empty
                            plan); lockfile pins Remotion 4.0.532
assets/runbook.json         the runbook as data
assets/storyboard-*.json    the site, desk and long-cut storyboards with placeholders
assets/desk-scenarios/, assets/sig/, assets/narrated/   off-camera sales, signatures, the menu and camera feed
assets/client-inputs.template.json, assets/send-note.md, assets/project-README.md, assets/narration/, assets/voice/
assets/sfx/, assets/fonts/  the 15 sounds (SOURCES.md) and Barlow Semi Condensed (OFL.txt)
```

**Housekeeping:** heavy work under `nice -n 15` (the scripts do it); capture with `--clean` (a DSF 2 shot is about
2.5 GB of PNG); delete only the `/tmp/remotion-webpack-bundle-*` your runs created (render.sh and stills.cjs do);
stop your servers by process group when their step is done; never edit the client's site or desk source: video-only
fixes go in the storyboard's `captureCss`.
