# The runbook, step by step

<!-- generated from assets/runbook.json by `node scripts/runbook.cjs doc > references/runbook.md`; edit the JSON, not this file (selftest checks they agree) -->

Every step has one command, its outputs, a PASS gate and a written rule for a FAIL. `node $S/scripts/runbook.cjs next` prints
the next step with the variables resolved; `run <id>` runs and judges it; long steps start through `bg.sh` and are
judged with `check <id>`; looked-at, listened-to, approval and send steps close only with `mark <id>` (references/harness.md).
Every command assumes `source $SCRATCH/demo.env` first (S0-S2 come before it exists), and every step runs from $REPO.

A PASS holds only while what it was built from holds: a step that runs again makes every step after it STALE, and an
approval is bound to the files it approved (a changed script.md asks again). STALE is not done; `next` returns it.
`run <id> --force` needs `--why` and the user's own words (`--by-user`); it is recorded, shows as PASS* and goes into
the send note. An optional step is declined only with the user's words (`skip <id> --by-user … --source …`).

## Every film

### S0 · Check the machine

- **Kind:** auto (scripted: the gate decides)
- **Command:**

  ```bash
  bash "$S/scripts/setup.sh" --check
  ```

- **PASS:** exit 0; prints `SETUP OK`
- **On FAIL:** Apply each printed remedy. Browsers, apt packages and global npm installs only with the user's OK; never playwright install on your own. Disk under 8 GB: the disk row lists what this skill made, largest first (captures, stills, render frames, the medium.en model are safe to delete once the film they fed is sent; keep the voice venv if a narrated cut is coming). A taken port names its holder: yours, stop it; someone else's, wait (desk-server.sh start --wait 1800), then ask. Re-run S0.

### S2 · Write the run's variables (demo.env)

- **Kind:** manual (you do the work; the gate checks it)
- **Needs:** S0
- **Command:**

  ```bash
  bash "$S/scripts/env.sh" --slug <client-slug> --scratch <absolute scratch dir outside the repo> --desk clients/<slug>-desk   (or --no-desk, only on the user's word)
  ```

- **Outputs:** `$SCRATCH/demo.env`
- **PASS:** every output exists
- **On FAIL:** Fix the variable it names. The desk is said, never guessed: --desk <folder> for the house film (parts A + B), --no-desk only when the user says the client has no desk. S is the absolute folder that holds this skill's SKILL.md (export S=<that folder> before S0). Then `source <scratch>/demo.env` at the top of EVERY later command (variables do not survive between calls).

### A1 · Facts and client-inputs.json

- **Kind:** manual (you do the work; the gate checks it)
- **Needs:** S2
- **Command:**

  ```bash
  mkdir -p "$P" && [ -f "$I" ] || cp "$S/assets/client-inputs.template.json" "$I"; node "$S/scripts/fill-client.cjs" check "$I" --stage facts
  ```

- **Outputs:** `$I`
- **PASS:** exit 0; prints `client-inputs OK (facts)`
- **On FAIL:** Fill each listed key from the site's business.ts fields sourced OWNER or TXDMV, character for character: the check compares phone, street and city, hours and domain with business.ts (split days as the site writes them, e.g. "Mon – Fri 9 AM – 7 PM, Sat 9 AM – 5 PM"), and refuses Example, Test, Lorem, TBD or a .example host. An unconfirmed fact is asked of the user, never guessed. FINDER_QUERY: a model in the served site's own inventory (its /inventory page or its inventory data file), about 5 characters. A financing service band: read its tile on the site and record it in storyboard.SERVICE_TILE_CHECK (class (a) text: ask the user). The narration flags follow the kickoff answers (assets/narration/script-template.md, 'Kickoff answers to flags'). Leave loader, word, introKey and brand.mark null (A3 measures them). With a desk, ask the part-B questions (B0) now, with the facts, so the run never waits on a person hours in.

### A2 · Build the site with the Admin link and serve it on :5183

- **Kind:** auto (scripted: the gate decides)
- **Needs:** A1
- **Command:**

  ```bash
  bash "$S/scripts/site-server.sh" build-start
  ```

- **PASS:** exit 0; prints `SITE READY`
- **On FAIL:** Port taken: site-server.sh stop (yours) or wait (someone else's). Never another port. A build error is the site's: tell the user.

### A3 · Measure the site, check the inputs

- **Kind:** auto (scripted: the gate decides)
- **Needs:** A2
- **Command:**

  ```bash
  node "$S/scripts/measure-site.cjs" --into "$I" && node "$S/scripts/fill-client.cjs" check "$I" --stage pre
  ```

- **PASS:** exit 0; prints `client-inputs OK (pre)`
- **On FAIL:** "Open Now" FAIL: the clock must be Wednesday 2026-09-30 14:00 local (or the next open weekday). Fix each listed key, re-run A3.

### A3s · Capture self-test (a new site or machine)

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** A3
- **Command:**

  ```bash
  node "$S/scripts/capture.cjs" --selftest --dsf 1,2 --out "$SCRATCH/selftest" --clock "$(node -e 'console.log(require(process.argv[1]).clock)' "$I")"
  ```

- **PASS:** exit 0; prints `SELFTEST PASS`
- **On FAIL:** Determinism FAIL: re-run once when the load average is under the core count (setup.sh --check prints it; lesson B12). A second FAIL: stop and send the user the log.

### A4 · Create the project (template, assets, filled files, npm ci)

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** A3
- **Command:**

  ```bash
  bash "$S/scripts/new-project.sh" "$I" "$P" $(node -e 'process.stdout.write(require(process.argv[1]).narration ? "--narrated" : "")' "$I")
  ```

- **Outputs:** `$P/src/project.ts`, `$P/storyboard.json`, `$P/node_modules/remotion/package.json`
- **PASS:** exit 0; prints `PROJECT READY`; every output exists
- **On FAIL:** npm ci failed: send the user the error; never npm install. 'refusing: … already holds a project': this client's project exists. To re-create it on purpose run `runbook.cjs run A4 --pass-force` (new-project.sh --force backs up plan.ts, vo-lines.ts, the storyboards, project.ts and the README to <P>/.backup/<time>/ and keeps a worked plan.ts and vo-lines.ts); otherwise use the project as it is and mark nothing.

### A5 · Adapt and preflight the site storyboard (loop until clean)

- **Kind:** manual (you do the work; the gate checks it)
- **Needs:** A4
- **Command:**

  ```bash
  node "$S/scripts/measure-site.cjs" --storyboard "$P/storyboard.json" --rects --into "$I"; node "$S/scripts/fill-client.cjs" storyboard "$I" "$S/assets/storyboard-dealer-site.json" --out "$P/storyboard.json"; node "$S/scripts/fill-client.cjs" readme "$I" "$S/assets/project-README.md" --out "$P/README.md"; node "$S/scripts/measure-site.cjs" --storyboard "$P/storyboard.json"
  ```

- **PASS:** exit 0; prints `PREFLIGHT CLEAN`
- **On FAIL:** Copy each SUGGEST line into client-inputs.json → storyboard and run A5 again. After 5 rounds without PREFLIGHT CLEAN, stop and send the user the preflight output.

### A6 · Capture the five site shots, in order

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** A5
- **Command:**

  ```bash
  bash "$S/scripts/capture-all.sh" "$P/storyboard.json" 1-hero 2-scroll 3-buy 4-menu 5-phone
  ```

- **Outputs:** `$P/public/shots/1-hero/cursor.json`, `$P/public/shots/5-phone/shot.mp4`
- **PASS:** exit 0; prints `CAPTURES OK`; every output exists
- **On FAIL:** Re-capture from the failed shot with --from <id> (the script refuses shot N without 1..N-1 and moves stale later captures aside).

### A7 · Check the site cuts; stop the site server

- **Kind:** auto (scripted: the gate decides)
- **Needs:** A6
- **Command:**

  ```bash
  node "$S/scripts/verify-film.cjs" --project "$P" --cuts-only --out "$SCRATCH/cuts" && bash "$S/scripts/site-server.sh" stop
  ```

- **PASS:** exit 0; prints `CUTS PASS`
- **On FAIL:** A failed cut at shot N: add 15 frames of preroll to N (at most twice), re-capture N..5 (A6 --from N). Still failing: send the user the cut stills ($SCRATCH/cuts) and stop.

### A8 · Look at the part-A stills before rendering

- **Kind:** by-eye (looked at: closed by mark); long: runs through bg.sh
- **Needs:** A7
- **Command:**

  ```bash
  F=$(node "$S/scripts/verify-film.cjs" --project "$P" --plan | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).stills.map(x=>x.frame).join(",")))') && cd "$P" && nice -n 15 node scripts/stills.cjs "$SCRATCH/stills" Demo:$F
  ```

- **Outputs:** `$SCRATCH/stills`
- **PASS:** `runbook.cjs mark`
- **On FAIL:** Look at every still at 100% (the hero anchor beside the headline, every zoom's framing, the cut stills, the outro). A model that cannot view images sends the stills (or a contact sheet of them) to the user and records their words with mark --by-user. Never self-certify.

### N0 · Offer the narrated long cut (on request; skip it with the user's words)

- **Kind:** manual (you do the work; the gate checks it); optional: the user may decline it (skip)
- **Needs:** S2
- **Command:**

  ```bash
  node "$S/scripts/fill-narration.cjs" init "$I"
  ```

- **PASS:** exit 0; prints `wrote an empty narration block`
- **On FAIL:** Ask the user whether they want the narrated long cut (about 4 minutes, a fact-checked script voiced free). Yes: run N0, which adds the narration block; the narrated steps (S1, N1-N14) then appear in `next`. No: runbook.cjs skip N0 --by-user "<their words>" --source "<where they said it>". 'already has a narration block': it was added before; run nothing and go on (mark nothing).

## A site with no desk (rare: the house cut ends on the desk's Admin row; ask the user first)

### R1 · Render the site film (demo-v1) and its chat copy

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** A8
- **Command:**

  ```bash
  bash "$S/scripts/render.sh" "$P" demo-v1 --check && bash "$S/scripts/render.sh" "$P" demo-v1
  ```

- **Outputs:** `$P/out/demo-v1.mp4`, `$P/out/demo-v1-chat.mp4`
- **PASS:** exit 0; prints `RENDERED`; every output exists
- **On FAIL:** Before R1: the site-only film is the rare case (the house film ends on the desk's Admin row and goes on into part B). Ask the user first, and record their answer, before rendering it as the deliverable. Killed or out of memory: render the missing ranges with --frames A-B and join them with --concat (references/harness.md).

### R2 · Verify the site film

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** R1
- **Command:**

  ```bash
  bash "$S/scripts/verify.sh" "$P" out/demo-v1.mp4 "$SCRATCH/verify"
  ```

- **PASS:** exit 0; prints `VERIFY PASS`
- **On FAIL:** Each failed gate's fix is in references/verification.md §6. An --allow-* only with its verify-decisions.md row (mark --allow).

### R3 · The contact sheet, the zoom stills at 100%, one full watch with sound

- **Kind:** by-ear (watched and listened to: closed by mark)
- **Needs:** R2
- **Command:**

  ```bash
  ls "$SCRATCH/verify/contact-sheet.png" "$P/out/demo-v1-chat.mp4"
  ```

- **PASS:** `runbook.cjs mark`
- **On FAIL:** A model that cannot see or hear sends contact-sheet.png and the chat copy to the user and waits for an explicit OK (mark --by-user).

### R4 · Send the site film

- **Kind:** send (sent: closed by mark)
- **Needs:** R3
- **Command:**

  ```bash
  node "$S/scripts/fill-client.cjs" send-note "$I" --film "$P/out/demo-v1.mp4" --share "$P/out/demo-v1-chat.mp4" --report "$SCRATCH/verify/report.json" --out "$SCRATCH/send-note.md"
  ```

- **Outputs:** `$SCRATCH/send-note.md`
- **PASS:** `runbook.cjs mark`
- **On FAIL:** Ask the user first that the site-only film is what they want sent (the house film is parts A + B; SKILL.md: demo-v1 alone is an internal checkpoint). Then attach demo-v1-chat.mp4 (<= 28 MB) and the contact sheet with your file-sending tool, paste the send note. Never send the master.

## With the sale desk: part B, render, verify, send

### B0 · Part B decisions, asked at kickoff: the onboarding path, the demo fee, the desk host, the demo data

- **Kind:** approval (the user's approval: closed by mark --by-user)
- **Approves:** `$P/partB-decisions.json` (a change makes it STALE)
- **Needs:** A1
- **Command:**

  ```bash
  node "$S/scripts/fill-client.cjs" check "$I" --stage desk && node "$S/scripts/fill-client.cjs" decisions "$I" --out "$P/partB-decisions.json"
  ```

- **Outputs:** `$P/partB-decisions.json`
- **PASS:** exit 0; prints `PART B DECISIONS WRITTEN`; every output exists; `runbook.cjs mark`
- **On FAIL:** Asked at kickoff, with A1's facts. Ask the user, verbatim: "Film the owner's first sign-in including Your Fees (I type a fee figure you give me), or film a salesperson's first sign-in (no fees screen)?" and "May the desk's own web address be shown in the address bar on the desk frames, or should it show the site's?" Never choose for them. If they choose the owner path, tell them Your Fees is new to the film: its shots and its composition segment are made and verified on this run (a house change; render.sh refuses until the segment exists). Record partB.onboarding (and demoFee with its source), partBDomain and partB.domainDecision (their words), demo.phone (a 555 number in the dealer's area code) and demo.addressPartB (scripts/check-address.cjs --which addressPartB --write; lesson B13). deskClock is the capture day at 14:00: set it on the day of B4 (the desk check refuses another day). Then mark B0 --by-user "<their words>" --source "<where they said it>". A later change to these decisions makes B0 STALE: ask again.

### B1 · Start the desk on :5190 (its own process group)

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B0, A8
- **Command:**

  ```bash
  bash "$S/scripts/desk/desk-server.sh" start
  ```

- **PASS:** exit 0; prints `DESK READY`
- **On FAIL:** Port taken by your own server: desk-server.sh stop. By another (the refusal names its pid, folder and start time): desk-server.sh start --wait 1800 polls it for up to 30 minutes, then ask the user who owns it. Never another port, never kill a server you did not start, never npm install in the desk.

### B2 · Merge the filled desk shots into the storyboard

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B1
- **Command:**

  ```bash
  node "$S/scripts/fill-client.cjs" desk-storyboard "$I" --into "$P/storyboard.json"
  ```

- **PASS:** exit 0; prints `merged `
- **On FAIL:** Fill the values it names in client-inputs.json (B0).

### B3 · Desk theme and selector preflight, then a fresh desk

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B2
- **Command:**

  ```bash
  node "$S/scripts/desk/theme.cjs" --into "$SCRATCH/demo.env" && source "$SCRATCH/demo.env" && node "$S/scripts/measure-site.cjs" --desk --storyboard "$P/storyboard.json" --desk-dir "$DESK_DIR" && bash "$S/scripts/desk/desk-server.sh" restart
  ```

- **PASS:** exit 0; prints `DESK PREFLIGHT CLEAN[sS]*DESK READY`
- **On FAIL:** A missing selector or label means the desk changed: read the desk's docs/verification/paperwork-pages/corridor-changes.md, update the shot in assets/storyboard-desk.json (a house template change, said in the send note), refill (B2), re-run B3.

### B4 · Capture part B and its off-camera sales on one fresh desk

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh; refused while the desk has moved since its clean preflight
- **Needs:** B3
- **Command:**

  ```bash
  node "$S/scripts/fill-client.cjs" check "$I" --stage desk && bash "$S/scripts/capture-desk.sh"
  ```

- **Outputs:** `$P/public/shots/12-desk-signed/cursor.json`, `$P/public/docs/130u-p1.png`
- **PASS:** exit 0; prints `DESK CAPTURES OK`; every output exists
- **On FAIL:** 'deskClock is …, but today at the dealer is …': set deskClock to today 14:00 (the desk stamps today's date on the paper) and run B4 again. A scenario refused by validate-scenario (strict): the corridor changed since it was walked; read the desk's docs/verification/paperwork-pages/corridor-changes.md, update assets/desk-scenarios/<name>.json (a tap is answered { "button": "<label>" }, a typed box { "fill": "main input", "value": … }), walk it once on this desk with premium-dealer-build desk-walk sale.cjs to the packet, then validate-scenario.cjs --stamp. Otherwise the script restarted the desk and tried once more already: stop and send the user the log.

### B5 · Measure the part-B cuts; refill project.ts

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B4
- **Command:**

  ```bash
  node "$S/scripts/measure-desk-cuts.cjs" --project "$P" --into "$I" && node "$S/scripts/fill-client.cjs" check "$I" --stage post && node "$S/scripts/fill-client.cjs" project "$I" --out "$P/src/project.ts"
  ```

- **PASS:** exit 0; prints `client-inputs OK (post)`
- **On FAIL:** A value not found: re-capture the named shot (B4). A WARN about the 100% frame: look at the frames it names and set readbackRelease[0] by hand.

### B6 · Check every cut, parts A and B

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B5
- **Command:**

  ```bash
  node "$S/scripts/verify-film.cjs" --project "$P" --cuts-only --out "$SCRATCH/cuts"
  ```

- **PASS:** exit 0; prints `CUTS PASS`
- **On FAIL:** A jump-cut fails pointer/camera: the cut frames in partB.cuts or the shot's cutFrames; a first frame not painted: re-measure (B5) or re-capture. Then B6 again.

### B6v · Look at every still, parts A and B

- **Kind:** by-eye (looked at: closed by mark); long: runs through bg.sh
- **Needs:** B6
- **Command:**

  ```bash
  F=$(node "$S/scripts/verify-film.cjs" --project "$P" --plan | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).stills.map(x=>x.frame).join(",")))') && cd "$P" && nice -n 15 node scripts/stills.cjs "$SCRATCH/stills-ab" Demo:$F
  ```

- **Outputs:** `$SCRATCH/stills-ab`
- **PASS:** `runbook.cjs mark`
- **On FAIL:** The part-B list is references/verification.md §7 (privacy blurs, the pad's date, no skeleton on screen, the 130-U push). No vision: send them to the user; mark --by-user.

### B7 · Stop the desk; next-env.d.ts restored

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B6
- **Command:**

  ```bash
  bash "$S/scripts/desk/desk-server.sh" stop
  ```

- **PASS:** exit 0; prints `DESK STOPPED`
- **On FAIL:** desk-server.sh stop --force. If :5190 stays taken by a server you did not start, leave it and tell the user.

### B8 · Render the film (parts A + B) and its chat copy

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** B6v, B7
- **Command:**

  ```bash
  bash "$S/scripts/render.sh" "$P" "$SLUG-demo" --check && CRF=17 AUDIO_BITRATE=192k bash "$S/scripts/render.sh" "$P" "$SLUG-demo"
  ```

- **Outputs:** `$P/out/$SLUG-demo.mp4`, `$P/out/$SLUG-demo-chat.mp4`
- **PASS:** exit 0; prints `RENDERED`; every output exists
- **On FAIL:** Killed or out of memory: render.sh … --frames A-B for the missing ranges, then --concat (references/harness.md).

### B9 · Verify the film

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** B8
- **Command:**

  ```bash
  bash "$S/scripts/verify.sh" "$P" "out/$SLUG-demo.mp4" "$SCRATCH/verify"
  ```

- **PASS:** exit 0; prints `VERIFY PASS`
- **On FAIL:** references/verification.md §6. An --allow-* needs its row first (mark B9 --allow spike:<frame> --why … --by-agent …).

### B9w · Contact sheet, zoom stills at 100%, one full watch with sound

- **Kind:** by-ear (watched and listened to: closed by mark)
- **Needs:** B9
- **Command:**

  ```bash
  ls "$SCRATCH/verify/contact-sheet.png" "$P/out/$SLUG-demo-chat.mp4"
  ```

- **PASS:** `runbook.cjs mark`
- **On FAIL:** No vision or hearing: send contact-sheet.png and the chat copy to the user, wait for an explicit OK, mark --by-user.

### B10 · The chat copy is <= 28 MB with the master's frame count

- **Kind:** auto (scripted: the gate decides)
- **Needs:** B9w
- **Command:**

  ```bash
  bash "$S/scripts/share.sh" "$P/out/$SLUG-demo.mp4" 28
  ```

- **PASS:** exit 0; prints `SHARE OK`
- **On FAIL:** It lowers the bitrate once itself; still over: send the master's path, never the master.

### B11 · Send the film

- **Kind:** send (sent: closed by mark)
- **Needs:** B10
- **Command:**

  ```bash
  node "$S/scripts/fill-client.cjs" send-note "$I" --film "$P/out/$SLUG-demo.mp4" --share "$P/out/$SLUG-demo-chat.mp4" --report "$SCRATCH/verify/report.json" --out "$SCRATCH/send-note.md"
  ```

- **Outputs:** `$SCRATCH/send-note.md`
- **PASS:** `runbook.cjs mark`
- **On FAIL:** Attach $SLUG-demo-chat.mp4 and contact-sheet.png with your file-sending tool (SendUserFile in Claude Code), paste the send note, then mark B11 --by-agent "sent".

## The narrated long cut (on request, after the short film is sent)

### S1 · Build the voice venv (Kokoro + faster-whisper)

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** S0
- **Command:**

  ```bash
  bash "$S/scripts/setup.sh" --voice
  ```

- **PASS:** exit 0; prints `VOICE OK`
- **On FAIL:** Re-run once (a network blip). A second failure: send the user the log; never disable TLS or unset the proxy.

### N1 · Fill and fact-check the house script on this client's desk

- **Kind:** manual (you do the work; the gate checks it)
- **Needs:** S1, B11
- **Command:**

  ```bash
  node "$S/scripts/fill-narration.cjs" check "$I" --desk "$DESK_DIR" && node "$S/scripts/fill-narration.cjs" lines "$I" --out "$P/narration/lines.json" && node "$S/scripts/fill-narration.cjs" script "$I" --out "$P/narration/script.md"
  ```

- **Outputs:** `$P/narration/lines.json`, `$P/narration/script.md`
- **PASS:** exit 0; every output exists
- **On FAIL:** Walk the desk for checked.features: desk-server.sh start, then premium-dealer-build desk-walk sale.cjs with a scenario (DESK_DIR set): it writes walk-report.json into its out folder. Record checked.on, checked.commit (the report's deskCommit), checked.dirty and checked.evidence (that folder); the check refuses a walk on another corridor commit or one older than the desk's last corridor commit, and any 'dry run' or 'not walked' wording. A line the desk cannot back is cut with its reason, never softened.

### N2 · The user approves the script

- **Kind:** approval (the user's approval: closed by mark --by-user)
- **Approves:** `$P/narration/script.md` (a change makes it STALE)
- **Needs:** N1
- **Command:**

  ```bash
  ls "$P/narration/script.md"
  ```

- **PASS:** `runbook.cjs mark`
- **On FAIL:** Send narration/script.md and wait. Voice nothing before an explicit approval (mark N2 --by-user "<their words>" --source "<where they said it>"). A changed script.md makes N2 STALE: send it again.

### N3 · Voice every line (Kokoro af_heart, 0.95)

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** N2
- **Command:**

  ```bash
  "$VOICE_VENV/bin/python" "$S/scripts/voice/voice.py" --project "$P"
  ```

- **Outputs:** `$P/narration/lines-timed.json`, `$P/narration/preview.mp3`
- **PASS:** exit 0; prints `VOICED`; every output exists
- **On FAIL:** A missing venv: S1. Another voice or speed is refused unless client-inputs.json → voice says so with a reason.

### N4 · Transcribe back and compare

- **Kind:** auto (scripted: the gate decides)
- **Needs:** N3
- **Command:**

  ```bash
  "$VOICE_VENV/bin/python" "$S/scripts/voice/transcribe.py" --project "$P"
  ```

- **Outputs:** `$P/narration/words.json`, `$P/narration/transcribe-diff.md`
- **PASS:** exit 0; prints `TRANSCRIBE OK`
- **On FAIL:** Exit 2: transcribe-diff.md suggests the first fix per open row. Run --model medium.en --only <ids> (refused when it would leave under 8 GB free); --accept <id> --by medium.en --why … is accepted only when medium.en heard that line as written. Else change only the punctuation of `speak` (a comma or full stop right after the word the models dropped; fill-narration refuses any other change to the words) and re-voice that line (voice.py --only, at most twice). A proper noun both models hear wrongly, or anything still open: carry it to N5 for the user's ear. A decision is bound to its take: re-voicing a line reopens it.

### N5 · The user approves the voiced set

- **Kind:** approval (the user's approval: closed by mark --by-user)
- **Approves:** `$P/narration/preview.mp3`, `$P/narration/transcribe-diff.md` (a change makes it STALE)
- **Needs:** N4
- **Command:**

  ```bash
  ls "$P/narration/preview.mp3" "$P/narration/transcribe-diff.md"
  ```

- **PASS:** `runbook.cjs mark`
- **On FAIL:** Send preview.mp3 and transcribe-diff.md together: one reply covers the voiced set and every open transcribe row (record each open row with transcribe.py --accept <id> --by user --words "<their words>" --why …). Cut nothing until the user says yes (mark N5 --by-user … --source …). Re-voicing anything makes N5 STALE: send again.

### N6 · Levels and trims (-16 LUFS +/- 0.5, true peak <= -1.5 dBTP)

- **Kind:** auto (scripted: the gate decides)
- **Needs:** N5
- **Command:**

  ```bash
  python3 "$S/scripts/voice/prepare-vo.py" --project "$P"
  ```

- **Outputs:** `$P/src/narrated/vo-lines.ts`
- **PASS:** exit 0; prints `VO READY`; every output exists
- **On FAIL:** LEVELS FAIL: look for a clipped or near-silent take (re-voice it), then re-run. Never edit vo-lines.ts by hand.

### N7 · The narrated demo address and the demo card

- **Kind:** manual (you do the work; the gate checks it)
- **Needs:** N6
- **Command:**

  ```bash
  node "$S/scripts/fill-client.cjs" check "$I" --stage narrated && node "$S/scripts/make-demo-card.mjs" --out "$P/public/narrated"
  ```

- **Outputs:** `$P/public/narrated/card-front.png`, `$P/public/narrated/card-back.png`
- **PASS:** exit 0; prints `CARD DECODES`; every output exists
- **On FAIL:** demo.addressNarrated: a block number on a commercial road the Census geocoder resolves (curl 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=<street, city, TX zip>&benchmark=Public_AR_Current&format=json' returns addressMatches) and no listed home. No web access: ask the user for one.

### N8 · The long-cut storyboard, filled and preflighted on the desk

- **Kind:** auto (scripted: the gate decides)
- **Needs:** N7
- **Command:**

  ```bash
  bash "$S/scripts/desk/desk-server.sh" start && node "$S/scripts/fill-client.cjs" long-storyboard "$I" --into "$P/narration/storyboard-long.json" && node "$S/scripts/measure-site.cjs" --desk --storyboard "$P/narration/storyboard-long.json" --desk-dir "$DESK_DIR" && bash "$S/scripts/desk/desk-server.sh" restart
  ```

- **PASS:** exit 0; prints `DESK PREFLIGHT CLEAN[sS]*DESK READY`
- **On FAIL:** As B3: the desk changed under the storyboard; update assets/storyboard-long.template.json from the desk's corridor-changes.md, re-run N8. :5190 held by another: desk-server.sh start --wait 1800, then ask.

### N9 · Capture 20-27 and the off-camera steps on one fresh desk

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh; refused while the desk has moved since its clean preflight
- **Needs:** N8
- **Command:**

  ```bash
  bash "$S/scripts/capture-narrated.sh" && bash "$S/scripts/desk/desk-server.sh" stop
  ```

- **Outputs:** `$P/public/shots/27-desk-stored/cursor.json`, `$P/public/docs/narr-130u-p1.png`
- **PASS:** exit 0; prints `NARRATED CAPTURES OK`; every output exists
- **On FAIL:** The script restarted and retried once already. Stop; send the log.

### N10 · Write the plan; the plan check and the lip-to-picture gate

- **Kind:** manual (you do the work; the gate checks it)
- **Needs:** N9
- **Command:**

  ```bash
  node "$S/scripts/narrated-plan.cjs" --project "$P" --draft && node "$S/scripts/narrated-check.cjs" --project "$P" && node "$S/scripts/narrated-plan.cjs" --project "$P" --write
  ```

- **Outputs:** `$P/narration/lip-to-picture.md`
- **PASS:** exit 0; prints `LIP-TO-PICTURE OK`
- **On FAIL:** --draft writes src/narrated/plan.draft.ts from THIS run's captures (cursor.json events), the voice (vo-lines.ts) and client-inputs.json → narration.anchors (each with its shot and key word): one cut per anchored line, the word landing 0.15 s before its event, documents and the phone left as TODO lines (their overlay needs its page, pushes and boxes: pdftotext -bbox on the anchor text, references/narration.md §6), and narration/anchors.draft.json, the anchors re-keyed to those cuts. Read both, copy the draft into src/narrated/plan.ts and its anchors into narration.anchors together, add the overlays (references/narration.md §5-7; examples/discount-used-cars/plan.ts is the worked one, never copy its frames), then fix the line or anchor each FAIL names; an exception only with its reason.

### N11 · Stills of the narrated plan

- **Kind:** by-eye (looked at: closed by mark); long: runs through bg.sh
- **Needs:** N10
- **Command:**

  ```bash
  cd "$P" && nice -n 15 node scripts/stills.cjs "$SCRATCH/n-stills" Narrated:$(node "$S/scripts/narrated-frames.cjs" --project "$P" --csv)
  ```

- **Outputs:** `$SCRATCH/n-stills`
- **PASS:** `runbook.cjs mark`
- **On FAIL:** Every segment start, zoom at depth, document key landed, the phone, the outro. No vision: send them; mark --by-user.

### N12 · Render the narrated film and its chat copy (~80 min)

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** N11
- **Command:**

  ```bash
  bash "$S/scripts/render.sh" "$P" "$SLUG-demo-narrated" --composition Narrated --check && CRF=17 AUDIO_BITRATE=192k bash "$S/scripts/render.sh" "$P" "$SLUG-demo-narrated" --composition Narrated
  ```

- **Outputs:** `$P/out/$SLUG-demo-narrated.mp4`, `$P/out/$SLUG-demo-narrated-chat.mp4`
- **PASS:** exit 0; prints `RENDERED`; every output exists
- **On FAIL:** Chunk recovery as B8 (--frames A-B, then --concat).

### N13 · Verify the narrated film

- **Kind:** auto (scripted: the gate decides); long: runs through bg.sh
- **Needs:** N12
- **Command:**

  ```bash
  bash "$S/scripts/verify.sh" "$P" "out/$SLUG-demo-narrated.mp4" "$SCRATCH/verify-n" --composition Narrated
  ```

- **PASS:** exit 0; prints `ALL GATES PASS`
- **On FAIL:** Per gate (references/narration.md §10): voice set -16 +/- 0.5 LUFS, mix -16 +/- 1, true peak <= -1.5 dBTP, frames = the plan's total, onsets on cues or lines.

### N14 · Watch it, then send the narrated film

- **Kind:** send (sent: closed by mark)
- **Needs:** N13
- **Command:**

  ```bash
  bash "$S/scripts/share.sh" "$P/out/$SLUG-demo-narrated.mp4" 28 && node "$S/scripts/fill-client.cjs" send-note "$I" --film "$P/out/$SLUG-demo-narrated.mp4" --share "$P/out/$SLUG-demo-narrated-chat.mp4" --report "$SCRATCH/verify-n/report.json" --out "$SCRATCH/send-note-narrated.md"
  ```

- **Outputs:** `$SCRATCH/send-note-narrated.md`
- **PASS:** `runbook.cjs mark`
- **On FAIL:** One full watch with sound first (no hearing: the user watches the chat copy and says yes). Attach the chat copy, the contact sheet and narration/lip-to-picture.md; never the master.

