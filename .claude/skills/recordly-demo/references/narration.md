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

- **Lens: money made or time saved.** Every line answers "what does this do for the dealer?" ("Fewer tire-kickers
  calling to ask what you have", "No calculator. No mistakes that come out of your pocket"), not a feature list.
- **Every claim is checked against the desk** (its code and a walk through it) on the day, and the script says so with
  the date. A line the desk cannot back is cut, not softened.
- **One picture per line, one key word per line** that the picture can show (the Camry, the odometer, "Spanish", the
  county, Hold To Confirm, the seller line). Lines that cannot be shown (a thought, a payoff) sit on an overlay or a
  held frame.
- **Pace:** about 140 words a minute, sentences short. 24 lines came to 3:13 of speech in a 3:50 film.
- **Two texts per line:** `text` is what is shown and documented; `speak` is what the voice is given, spelled as the
  dealer says it: `130-U` → `one-thirty-U`, `LLC` → `L L C`. Numbers, form names and abbreviations are spelled out
  this way before voicing, never fixed after.
- **Two "remember this" lines pay off later** (the signature, the county): they make a long tour feel built, and the
  payoff overlay shows the exact thing the earlier line pointed at.

## 2. The voice

- **Kokoro-82M**, voice `af_heart`, `speed=0.95`, `lang_code='a'`, 24 kHz, free and local on CPU (a venv with
  `kokoro` 0.9.4, `soundfile` and CPU `torch`; pip brings `misaki` and `espeakng-loader`; `faster-whisper` 1.2.1 in
  the same venv for §3). Chosen over `af_bella`, `af_nicole`, `af_sarah` and Chatterbox (exaggeration 0.5 / 0.7)
  from samples of the same line; the client approved the samples, then the full set.
- **Line by line:** one WAV per line (`narration/vo/<id>.wav`), so one line can be re-voiced without touching the
  others. Kokoro is deterministic for a given text: to vary a take, change the punctuation or wording of `speak`.

```python
from kokoro import KPipeline
import numpy as np, soundfile as sf
p = KPipeline(lang_code='a')
for l in lines:   # narration/lines.json: {id, text, speak?}
    a = np.concatenate([x for _, _, x in p(l.get('speak', l['text']), voice='af_heart', speed=0.95)])
    sf.write(f"vo/{l['id']}.wav", a, 24000)
```

## 3. The transcribe-back check

- **faster-whisper** `small.en`, `compute_type='int8'`, `beam_size=5`, `word_timestamps=True`, on every line's WAV.
  The words, normalised (lower case, no punctuation, hyphens as spaces), are compared with `speak`.
- **A difference means listen**, not re-voice blindly. Whisper mishears too: in the Discount set it heard "walking
  and knowing" for "walking in knowing" and "the sales Spanish" for "the sale Spanish"; "130U" is "one-thirty-U".
  Kokoro can also swallow a short opening word: line 20 is heard as "The seller line" (its "And" is not heard).
  Each difference is listed in the project's narration README with what was decided.
- **The word timestamps are the edit's anchors** (`narration/words.json`): each line's key word is placed on its
  capture frame from them.

## 4. Levels and trimming

`scripts/prepare-vo.py` in the worked example does all of this and writes `src/narrated/vo-lines.ts`:

- **One gain for the whole set** (+10.1 dB for Discount), resampled to 48 kHz, then a brick-wall limiter
  (`alimiter=limit=0.70:attack=2:release=50:level=disabled`). Check the set concatenated with
  `ffmpeg -af ebur128=peak=true`: about **−16 LUFS integrated, true peak ≤ −1.5 dBTP** (Discount: −1.8 dBTP).
- **Trim each line to its speech:** `silencedetect=n=-42dB:d=0.12` finds the edges; keep 60 ms before the first sound
  and 120 ms after the last, with a 20 ms fade in and an 80 ms fade out. The words are re-timed to the trimmed start.
  Gaps between lines are then set by the plan, never by the TTS's own leading silence.

## 5. Storyboard against the voice

Write the timing table first (line, length, key word, the picture wanted), then storyboard the captures to it:

- **Each capture is scripted to the line's length.** Hovers carry the words that list things ("done, yours, or
  theirs": the pointer rests on Already Passed, We Are Doing It, The Customer Will in turn), then the click comes at
  the end of the thought. Timing the actions from the line's word times saves re-captures.
- **Only the new shots are captured;** part A and the desk's sign-in/onboarding are reused from the house storyboard.
  The Discount long cut's new shots are in `narration/storyboard-long.json` (20-car … 27-desk-stored), with the order
  and the off-camera set-up between them in its `notes`.
- **One whole sale on one fresh desk server**, captured in order; the steps the film does not show are answered off
  camera between captures (a scenario file for desk-walk's `sale.cjs`), and the deal id is passed with `--var deal=`.

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

`scripts/narrated-check.cjs` prints the running order, every line (start, end, gap, key word time, picture) and every
cut's pointer and camera on both sides, and exits 1 on an overlap, a gap outside 0.35–3.0 s or a failed cut.
`scripts/narrated-frames.cjs` lists the frames to look at (segment firsts, zooms at full depth, document keys landed).

## 7. Landing rules and gaps

- **The word comes first, by 0–0.3 s.** A click, a menu opening, a press or a document push lands just after the word
  that names it; an action before its word reads as early, one more than about 0.5 s after it reads as late. Measure
  against the capture's real event frames (`cursor.json` events), not the storyboard's planned seconds.
- **Gaps:** 0.5–1.0 s between lines of one thought; 1–3 s where the picture has a beat of its own (taps shown in
  silence, a page landing, the phone coming in). Lines never overlap, and no line is cut.
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
| Plan | `narrated-check.cjs` prints PLAN OK: gaps 0.35–3.0 s, no overlap, every cut's pointer ≤ 2 px (same capture) / 3.5 px, camera scale Δ ≤ 0.01, pan ≤ 3 px |
| Frame count | Equals the plan's total; 1920×1080, 30 fps, h264, AAC |
| Luma | No one-frame spike outside the planned cuts; the last frame black |
| Loudness | Voice-led mix about −16 LUFS integrated, true peak ≤ −1.5 dBTP |
| Onset map | Every onset is a cue the composition plays or a line's start (speech onsets inside a line are expected) |
| Lip to picture | The key-noun table (word, film second, what is on screen) is written in the narration README, and every row lands |
| Stills | Every segment's first frame, every zoom at full depth, every document key landed, the phone's parts, the outro, the last frame |
| Share copy | Under 40 MB, +faststart |

## 11. Files in the worked example

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
