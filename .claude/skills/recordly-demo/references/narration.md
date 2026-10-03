# The narrated long cut: a voice-driven tour of the site and the desk

A variant of the house film, made once for Discount Used Cars (`clients/discount-used-cars-demo`, composition
`Narrated`, 3:50; the worked example for everything below). It keeps the house look, window, cursor, cameras,
documents, phone and sounds, and adds a voice-over: 24 lines that walk an owner through the site and one whole sale on
the desk. The edit follows the voice: every line's picture shows what the line says, with the camera on the thing named
as the word is said.

It is not the house cut. Make it only when the user asks for a narrated, long or explainer version; the 49 s / 82 s
house film stays the default. The `Demo` composition is never changed by it.

## Contents

1. The script
2. The voice
3. The transcribe-back check
4. Levels and trimming
5. Storyboard against the voice
6. The plan: segments, holds, overlays, anchored lines
7. Landing rules and gaps
8. Sound under the voice
9. Showing it truthfully
10. Gates
11. Files in the worked example

## 1. The script

**Every client gets the house script, filled; it is not rewritten.** The 24 lines live in
`assets/narration/lines-template.json`, and `assets/narration/script-template.md` is the same script for people. It
holds:

- the variables table (each variable, where its value comes from, Discount's value);
- the conditional lines and the setup/payoff pairs;
- the feature each line narrates and where to check it on the desk;
- how to fill and fact-check.

The client's values go in `client-inputs.json` → `narration`, and `scripts/fill-narration.cjs` turns them into
`narration/lines.json` (what Kokoro voices) and `narration/script.md` (the lines with their pictures, which the owner
reads before voicing):

```bash
node $S/scripts/fill-narration.cjs init   $I          # the empty block: said / shown variables, flags, checked, cut, speak
node $S/scripts/fill-narration.cjs check  $I
node $S/scripts/fill-narration.cjs lines  $I --out $P/narration/lines.json
node $S/scripts/fill-narration.cjs script $I --out $P/narration/script.md
node $S/scripts/fill-narration.cjs selftest           # Discount's approved 24 lines, exactly, and every refusal
```

- **The variables:** the road customers drive to, what the lot sells, the fees the receipt adds up, the legal name as
  the voice says it, the dealer's name, and the closing line are spoken. The sell band's name, the legal name as
  printed, and the demo people, car, address and county are on screen only.
- **The flags:** `SELL_BAND`, `SPANISH_DOCS` and `SELLER_LIEN` leave out lines 03, 09 and 16 when false.
- **Refusals:** the fill refuses a leftover `{{placeholder}}`, a missing or unknown variable, and an abbreviation in a
  spoken value ("Fwy", "LLC", "&"). It refuses a line whose feature is not in `narration.checked.features` (seen
  working on this client's desk), half a setup/payoff pair, and Discount's road, name or legal name reused for another
  client.
- **Wording is house.** A change to a line is a template change: edit both files, bump `version`, and re-run the
  selftest. A new line goes in behind a flag that is false for Discount. A per-client voice spelling goes in
  `narration.speak`.

The rules the house script was written to, for any change to it:

- **Lens: money made or time saved.** Every line answers "what does this do for the dealer?" ("Fewer tire-kickers
  calling to ask what you have", "No calculator. No mistakes that come out of your pocket"), not a feature list.
- **Every claim is checked against the desk** (its code and a walk through it) on the day, and the script says so with
  the date. A line the desk cannot back is cut, not softened.
- **One picture per line, one key word per line** that the picture can show (the Camry, the odometer, "Spanish", the
  county, Hold To Confirm, the seller line). Lines that cannot be shown (a thought, a payoff) sit on an overlay or a
  held frame.
- **Pace:** about 140 words a minute, sentences short. 24 lines came to 3:13 of speech in a 3:50 film.
- **Two texts per line:** `text` is what is shown and documented; `speak` is what the voice is given, spelled as the
  dealer says it: `130-U` → `one-thirty-U` (line 17's `speak`). Numbers, form names and abbreviations are spelled out
  this way before voicing, never fixed after. A spoken variable is spelled for the voice in its value, so it reads
  right in both: line 20's `LEGAL_NAME_SAID` is "… And Trucks, L L C", exactly as the approved line has it.
- **Two "remember this" lines pay off later** (the signature, the county): they make a long tour feel built, and the
  payoff overlay shows the exact thing the earlier line pointed at.

## 2. The voice

- **Kokoro-82M**, voice `af_heart`, `speed=0.95`, `lang_code='a'`, 24 kHz, free and local on CPU. Chosen over
  `af_bella`, `af_nicole`, `af_sarah` and Chatterbox (exaggeration 0.5 / 0.7) from samples of the same line; the
  client approved the samples, then the full set. Another voice or speed is a client decision recorded in
  `client-inputs.json → voice {voice, speed, why}`; `voice.py` refuses anything else.
- **The venv** (runbook S1): `bash $S/scripts/setup.sh --voice` builds `$VOICE_VENV` (default
  `$HOME/.cache/recordly-demo/voice-venv`, outside any session) from `assets/voice/requirements.lock`, the frozen set
  that voiced Discount: torch 2.14.1+cpu from the PyTorch CPU index first (from PyPI pip pulls the CUDA build), then
  kokoro 0.9.4, misaki 0.9.4, espeakng-loader 0.2.4, spaCy 3.8.16 with en_core_web_sm 3.8.0 (a GitHub release wheel),
  faster-whisper 1.2.1. It fetches hexgrad/Kokoro-82M and Systran/faster-whisper-small.en into `$HF_HOME`, voices one
  sentence and transcribes it back. A system espeak-ng is not needed (misaki bundles espeakng-loader).
- **Line by line** (runbook N3): one WAV per line, so one line can be re-voiced without touching the others.

```bash
$VOICE_VENV/bin/python $S/scripts/voice/voice.py --project $P            # all lines; --only 09-car-c re-voices one
#   reads narration/lines.json; writes narration/vo/<id>.wav (from speak, else text), lines-timed.json
#   ({id, seg, text, speak?, sec}) and narration/preview.mp3 (the set with 0.6 s gaps, -16 LUFS): send it (N5)
```

- **Takes repeat in words and length, not in samples:** the same `speak` gives the same words and the same length to
  the sample, but the waveform differs slightly run to run (Kokoro's vocoder noise; re-voicing Discount's lines 01-02
  gave identical lengths, 8.20 s and 11.55 s). To change a take, change the punctuation or wording of `speak`.

## 3. The transcribe-back check

```bash
$VOICE_VENV/bin/python $S/scripts/voice/transcribe.py --project $P       # runbook N4; exit 2 = a difference with no decision
```

- **faster-whisper** `small.en`, `device='cpu'`, `compute_type='int8'`, `beam_size=5`, `language='en'`,
  `word_timestamps=True`, on every line's WAV. The words, normalised (lower case, no punctuation, hyphens as spaces,
  one-thirty-U = 130-U, L L C = LLC), are compared with `speak` (else `text`).
- **Outputs:** `narration/words.json` `[{id, sec, text, speak?, heard, words: [{w, s, e}]}]` (seconds in the raw take:
  the edit's anchors) and `narration/transcribe-diff.md` (every differing line, with its decision).
- **A difference means listen**, not re-voice blindly. A model that cannot listen takes a second opinion:
  `--model medium.en --only <ids>` (it never replaces words.json); if medium.en hears the line as written, record
  `--accept <id> --by medium.en --why "…"`. If both models hear the same difference, change only the punctuation of
  `speak` and re-voice that line (at most twice); else send the clip to the user and record their decision
  (`--by user`). Decisions live in `narration/transcribe-decisions.json`; copy them into the narration README. Whisper mishears too: in the Discount set it heard "walking
  and knowing" for "walking in knowing" and "the sales Spanish" for "the sale Spanish"; "130U" is "one-thirty-U".
  Kokoro can also swallow a short opening word: line 20 is heard as "The seller line" (its "And" is not heard).
  Each difference is listed in the project's narration README with what was decided.
- **The word timestamps are the edit's anchors** (`narration/words.json`): each line's key word is placed on its
  capture frame from them.

## 4. Levels and trimming

`python3 $S/scripts/voice/prepare-vo.py --project $P` (runbook N6) does all of this and writes
`src/narrated/vo-lines.ts` and `public/vo/<id>.wav`:

- **One gain for the whole set, computed:** −16 minus the integrated loudness of the raw takes played back to back,
  then corrected (at most three times) for what the limiter and the trim change, until the trimmed set reads −16.0
  ± 0.1. Resampled to 48 kHz, then a brick-wall limiter (`alimiter=limit=0.70:attack=2:release=50:level=disabled`).
  Discount's takes compute to +9.9 dB (its approved set was made at +10.1 dB by hand and reads −15.9 LUFS).
- **Gate:** the trimmed set **−16 ± 0.5 LUFS integrated, true peak ≤ −1.5 dBTP**, else exit 1 and nothing is written.
  `--gain-db X --why "…"` sets the gain by hand (printed into vo-lines.ts).
- **Trim each line to its speech:** `silencedetect=n=-42dB:d=0.12` finds the edges; keep 60 ms before the first sound
  and 120 ms after the last, with a 20 ms fade in and an 80 ms fade out. The words are re-timed to the trimmed start.
  Gaps between lines are then set by the plan, never by the TTS's own leading silence.

## 5. Storyboard against the voice

Write the timing table first (line, length, key word, the picture wanted), then storyboard the captures to it:

- **Each capture is scripted to the line's length.** Hovers carry the words that list things ("done, yours, or
  theirs": the pointer rests on Already Passed, We Are Doing It, The Customer Will in turn), then the click comes at
  the end of the thought. Timing the actions from the line's word times saves re-captures.
- **Only the new shots are captured;** part A and the desk's sign-in/onboarding are reused from the house storyboard.
  The house long-cut shots are `assets/storyboard-long.template.json` (20-car … 27-desk-stored, Discount's shipped
  shots with the client's values as placeholders and the run's as capture vars `{deal}`, `{sign}`, `{sign2}`):
  `fill-client.cjs long-storyboard $I --into $P/narration/storyboard-long.json` fills it and injects the stand-in menu
  (`assets/narrated/select-menu.{js,css}`, in the desk's font) and the camera feed carrying this client's demo card
  (`make-demo-card.mjs`). Filled for Discount it reproduces the shipped shots exactly, apart from the card images.
- **One whole sale on one fresh desk server**, captured in order by `scripts/capture-narrated.sh` (references/
  desk-capture.md §6); the steps the film does not show are answered off camera between captures.

## 6. The plan

`src/narrated/plan.ts` builds the whole film from three lists (the composition only draws it):

- **Segments** play in one `DesktopScene` window: a capture range (`cap(key, shot, from, to, opts)`), cut wherever the
  page is blank or loading (a jump-cut on the click, its ring running on: `edit.moveEvents` with `ringOn`), or a
  **hold** (`hold: true`): one capture frame kept still while an overlay plays over it. Cameras are per segment
  (`zoomFocus`, `zoomShift`); `edit.addZooms` starts a zoom before the segment's first frame so a camera can run on
  across a cut, and `edit.addEvents` adds events (e.g. hiding the pointer during a scripted scroll).
- **Overlays** over holds: documents (`NarratedDoc`: the deal's real PDF pages at 300 dpi in a Preview window, pushes
  as `keys` {at, x, y, ds, dur} and spotlights as `spots`, both timed to the line's words; privacy boxes; an optional
  caption) and the phone (`NarratedPhone`: ranges of phone captures joined by jump cuts, clicks drawn as taps, scripted
  inner scrolls drawn as flicks).
- **Lines**, each anchored by its key word: `{seg, capture}` (the word lands on that capture frame), `{overlay, at}`,
  `{gap}` (after the previous line) or `{outro}`. Hold and overlay lengths are computed from the lines that play over
  them, so re-voicing a line re-times the film.

The template's `src/narrated/plan.ts` is an empty skeleton (types, `cap` / `hold` / `ringOn` / `word`, and a generic
builder over SEGMENTS, LINES and OVERLAYS); `examples/discount-used-cars/plan.ts` is the worked one. Write this
client's from this run's captures: never copy Discount's frame numbers.

- `node $S/scripts/narrated-check.cjs --project $P` prints the running order, every line (start, end, gap, key word
  time, picture) and every cut's pointer and camera on both sides, and exits 1 on an overlap, a gap outside the §7
  rules or a failed cut.
- `node $S/scripts/narrated-plan.cjs --project $P --write` is the lip-to-picture gate: each line's key word against
  the action it names, from `client-inputs.json → narration.anchors` ({seg, event: click | type | hold | draw | scroll |
  zoom, nth} for a capture event, {overlay, event: doc, doc, key} for a document push, {…, event: frame} for "in frame")
  and the captures' own events; it writes `narration/lip-to-picture.md` and the README block, and fails a line outside
  its window unless `narration.exceptions` gives the reason. Discount's anchors (in the example inputs) pass with three
  recorded exceptions. It does not write plan.ts: plan.ts stays hand-written to the landing rules.
- `node $S/scripts/narrated-frames.cjs --project $P [--csv]` lists the frames to look at (segment firsts, zooms at
  full depth, document keys landed).

## 7. Landing rules and gaps

- **The word comes first, by 0–0.3 s.** A click, a menu opening, a press or a document push lands just after the word
  that names it; an action before its word reads as early, one more than about 0.5 s after it reads as late. Measure
  against the capture's real event frames (`cursor.json` events), not the storyboard's planned seconds.
- **Gaps:** 0.5–1.0 s between lines of one thought; 1–3 s where the picture has a beat of its own (taps shown in
  silence, a page landing, the phone coming in). Lines never overlap, and no line is cut. narrated-check enforces
  0.5–3.0 s (0.35–0.5 s only for a line listed in `narration.exceptions`, two halves of one sentence).
- **Landing windows** (narrated-plan.cjs): a pointer action 0 to +0.5 s after its word; a document push starts −0.6 to
  +0.1 s around its word (the page lands on it); a zoom ±0.5 s; "in frame": the picture is on screen at the word.
- **Frame the thing named.** Compute each zoom's view (viewport ÷ depth around the focus, clamped to the page) against
  the page's measured boxes: the usual misses are a sliver of a button at the bottom edge and a heading cut at the top.
  Check at full size: a contact-sheet thumbnail makes clean edges look cut.
- **Document keys closer together than their push time never land:** the camera passes through the first. Space keys
  by at least `dur` + 0.3 s, or accept it when the next framing also shows the thing named.

## 8. Sound under the voice

- No music. The film's own sounds play as in the house film, **6 dB lower while a line is speaking** (a cue that
  starts within a line ±0.12 s): `duckAt` in `Narrated.tsx`, passed to `DesktopScene` as `duckDb` and to the phone and
  document cues.
- The voice is the loudest thing and sits at about −16 LUFS integrated; the full mix stays at true peak ≤ −1.5 dBTP.

## 9. Showing it truthfully

What a line says must be what the desk does, on screen. Where a step cannot be filmed as a person would do it, film
the real desk doing it another way and say so in the project's narration README:

- **Licence scan:** a test camera feed (`getUserMedia` returns a canvas stream of a card printed "DEMO CARD" with a
  PDF417 AAMVA barcode made for the demo buyer); the desk's own scanner decodes it.
- **Native menus:** headless Chromium paints no `<select>` popup; a stand-in menu is drawn where the OS menu opens and
  the value is set on the real select.
- **Steps the film skips** (the licence review, name and phone) are done off camera and cut around, never faked.
- **Documents** are the deal's own PDFs, not mock-ups; values the owner has not set (the doc fee) are blurred, not
  invented.

## 10. Gates

All of `verification.md` §4–5 apply, with these changes:

| Gate | Pass |
|---|---|
| Plan | `narrated-check.cjs` prints PLAN OK: gaps 0.5–3.0 s (§7), no overlap, every cut's pointer ≤ 2 px (same capture) / 3.5 px, camera scale Δ ≤ 0.01, pan ≤ 3 px |
| Frame count | Equals the plan's total; 1920×1080, 30 fps, h264, AAC |
| Luma | No one-frame spike outside the planned cuts; the last frame black |
| Loudness | The voice set −16 ± 0.5 LUFS integrated; the mix −16 ± 1 LUFS; true peak ≤ −1.5 dBTP (`narrated-verify.cjs`) |
| Onset map | Every onset is a cue the composition plays or a line's start (speech onsets inside a line are expected) |
| Lip to picture | `narrated-plan.cjs` prints LIP-TO-PICTURE OK: every anchored line lands in its window or has a recorded exception |
| Stills | Every segment's first frame, every zoom at full depth, every document key landed, the phone's parts, the outro, the last frame |
| Chat copy | `share.sh`: ≤ 28 MB (the chat's upload limit is 30 MB), +faststart, the master's frame count. A 3:50 film comes to ~26 MB at ~830 kb/s video + AAC 128k |

## 11. Files in the worked example

The skill ships every script the worked example used: `scripts/voice/{voice,transcribe,prepare-vo}.py`,
`scripts/narrated-{check,frames,verify,plan}.cjs` (all `--project`), `scripts/capture-narrated.sh`,
`scripts/desk/*.cjs`, `scripts/make-demo-card.mjs`, and the template's `src/narrated/`. In the Discount project:

```
narration/script-v1.md          the script with its on-screen cues and the fact-check date
narration/lines.json, lines-timed.json, words.json, vo/   the approved lines, their lengths, words and takes
narration/storyboard-long.json  the new captures (20-27), their order and the off-camera set-up
narration/capture/              the off-camera sale scenario
narration/README.md             timing table, lip-to-picture table, what was shown instead of what, re-make steps
scripts/prepare-vo.py           levels, trimming, src/narrated/vo-lines.ts
scripts/narrated-check.cjs      the plan check; narrated-frames.cjs: the stills list
src/narrated/                   plan.ts, Narrated.tsx, NarratedDoc.tsx, NarratedPhone.tsx, vo-lines.ts
public/vo/, public/docs/narr-*  the trimmed voice; the deal's document pages
```

A new client's project has `narration/script.md` and `narration/lines.json` from `fill-narration.cjs` in place of a
hand-written `script-v1.md`. Discount's script came before the template: its `lines-timed.json` is what the template
reproduces (`examples/discount-used-cars/narration-lines.json` is that file without the lengths). Its older
`lines.json` differs only in lacking line 17's `speak`, which was added at voicing.
