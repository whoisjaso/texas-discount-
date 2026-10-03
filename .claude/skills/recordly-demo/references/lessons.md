# Lessons: what broke, and the rule that fixed it

Part A of the Discount film went through a toolkit pass, a capture pass and a compose pass. Two independent critics
then reviewed it (LOOK: does it pass as a Screen Studio / Recordly export? RULES: Remotion rules, brand, facts, sound),
and a polish pass followed. Every rule below is something that went wrong once. They are written so the reason travels
with the rule: if a new site seems to need an exception, the **why** tells you whether it really does.

IDs in "Source": F1–F20 are critic LOOK round 2, F21–F34 critic RULES round 2, R1-n critic RULES round 1.

## Contents

- [Capture](#capture) (C1–C16)
- [Staging: what the camera may see](#staging-what-the-camera-may-see) (S1–S5)
- [Composition](#composition) (P1–P13)
- [Cursor](#cursor) (K1–K3)
- [Sound](#sound) (A1–A5)
- [Code](#code) (D1–D5)
- [Review](#review) (R1–R7)
- [Operations](#operations) (O1–O2)
- [Part B: the desk](#part-b-the-desk) (B1–B13)
- [The narrated long cut](#the-narrated-long-cut) (N1–N12)
- [Decisions kept: do not "fix" these](#decisions-kept-do-not-fix-these)
- [Open items](#open-items)

## Capture

**C1. Render every frame through BeginFrameControl.**
- *Rule:* Launch the headless shell with `--deterministic-mode`. Create the page with
  `Target.createTarget({url:'about:blank', enableBeginFrameControl:true})`. Render each frame with
  `HeadlessExperimental.beginFrame` at `virtualTimeTicksBase + elapsed`. Never use `Page.captureScreenshot` while
  virtual time is paused.
- *Why:* Screenshots under paused virtual time deadlock intermittently. BeginFrameControl is Chromium's own path for
  deterministic rendering; no hangs since.
- *Symptom:* The 12th mouse move deadlocked a frame request, a drawer transition hung at frame 130, and async image
  decodes stalled.

**C2. Advance virtual time on an exact 1/30 s grid, and pin the clock.**
- *Rule:* Use policy `pause`, then budgets of 1000/30 ms with `pauseIfNetworkFetchesPending`, repaying any watchdog
  nudge from the next budget. Pin the page's wall clock with `initialVirtualTime` from the storyboard's `clock`.
- *Rule:* Run `capture.cjs --selftest --dsf 1,2` before capturing a new site. The page clock must step 33.333 ms per
  frame, and a repeat capture must give an identical cursor track and frames with min PSNR ≥ 50 dB. 55 dB was
  observed: 91/120 frames byte-identical.
- *Why:* Frames must land on the film's grid however slow rendering is. Anything time-based ("Open Now") must render
  the same in every capture, or the cuts cannot match.
- *Symptom:* Without the pinned clock, "Open Now" depends on when you capture, and timing drift breaks cut matching.

**C3. Set DSF with both switches, at 2.**
- *Rule:* Set both Playwright's `deviceScaleFactor` and `--force-device-scale-factor=<dsf>`. Use DSF 2 for desktop
  (1440×900 → 2880×1800) and phone (390×797 → 780×1594).
- *Why:* Under BeginFrameControl the emulated DSF sets `devicePixelRatio` but not the surface size. The window shows
  the page about 1490 px wide and zooms to 1.8–2.0×, where DSF 1 text is soft. DSF 3 adds nothing to a phone drawn
  about 430 px wide.
- *Symptom:* With one switch only you get a 1× picture or a 1× page (`dsf-compare-at-1.8x.png`).

**C4. Queue input, render, then await the acks.**
- *Rule:* Each frame: queue mouse and key input, advance time, render the frame, and only then await the input acks.
  Expect `:hover` to begin on the frame where the move lands.
- *Why:* Chromium delivers mouse moves aligned to requestAnimationFrame, with the next rendered frame. An ack awaited
  before that frame never arrives.
- *Symptom:* The capture hung after about 11 mouse moves.

**C5. Move the pointer like a hand.**
- *Rule:* Use a minimum-jerk path, `s = t³(10 − 15t + 6t²)`, slightly bowed, with peak speed 1.875× the mean. Fail
  the self-test on any cursor-speed spike.
- *Why:* That is how a hand moves a mouse. Other eases produce jumps the spring-smoothed cursor cannot hide.
- *Symptom:* The self-test failed smoothness at 68.5 px/frame with the earlier ease.

**C6. Scroll with eased `scrollTo`, and hide with `visibility`.**
- *Rule:* Scroll only with an eased `window.scrollTo` to selector anchors (selector + align + offset), never the
  wheel. Hide page content with `visibility: hidden`, never `display: none`.
- *Why:* Selector anchors survive copy changes. `visibility` keeps the layout, so scroll targets and cuts do not move.
- *Symptom:* `display: none` on the fine print would have shifted every later section, scroll target and cut.

**C7. Check every cut numerically.**
- *Rule:* At every cut, check from both cursor.json files that the two captures sit at the same scrollY and cursor
  point. A matching selector is not enough. `verify-film.cjs` does this.
- *Why:* Two shots can scroll to "the same" section and still land a few to a hundred pixels apart.
- *Symptom:* There was a 100 px scroll jump at the 3→4 cut.

**C8. Let reveals finish first.**
- *Rule:* Let scroll-reveal transitions finish before frame 0 and before any set-up click. Put the set-up scroll in the
  preroll at least the reveal's duration plus about 0.5 s before frame 0.
- *Why:* A reveal (translateY 28 px over 0.9 s here) moves the click target and every pixel under it.
- *Symptom:* Shot 3's set-up click landed mid-reveal, putting the cursor 4.7 px low. Shot 4 opened on half-faded
  tiles. A 1 device-px reveal tail cut a PSNR to 30.5 dB.

**C9. Rebuild the previous shot's exact state in the preroll.**
- *Rule:* Use negative action times to repeat the last scroll, and re-click and re-type the field so typing ends in the
  same caret blink phase. Jiggle the mouse a few px after an instant set-up scroll so the element under it takes
  `:hover`.
- *Why:* Hard cuts need pixel-matched frames. Chromium re-evaluates `:hover` only on mouse moves, and the caret blink
  is visible.
- *Symptom:* Without it, the tile is not hovered and the caret blinks out of phase at frame 0.

**C10. Capture in order, from the previous cursor.**
- *Rule:* Capture shots in storyboard order and start each with `cursor.start.fromShot`, so its cursor begins exactly
  where the previous capture ended.
- *Why:* The cursor is the one object that crosses every cut.
- *Symptom:* A 4.7 px cursor jump at the 2→3 cut.

**C11. Park the real mouse in a gutter while the cursor is hidden.**
- *Rule:* While the drawn cursor is hidden during self-scrolls, park the REAL mouse in an empty page gutter (x 64).
  Move it onto a hover target only when the story wants that hover, ideally with the zoom-in.
- *Why:* The real pointer keeps hovering whatever scrolls under it, even while Remotion hides the drawn cursor.
- *Symptom:* A card lit up mid-scroll, and the Trucks card was already hovered before the visible cursor reached it.

**C12. Keep rotating content away from cuts and holds.**
- *Rule:* Keep carousels, review rotators and tickers out of frame at cut points and during holds.
- *Why:* Their phase depends on time since page load, and every capture has a different preroll.
- *Symptom:* The review carousel (6 s cycle) swapped its quote mid-hold, right on a cut.

**C13. Record what macOS and iOS would show.**
- *Rule:* Record per frame the computed CSS cursor (`c`: arrow / hand / I-beam). Set `cursor.hiddenAtStart` when the
  preroll ended with typing. For phone shots, record `screenEdges` top and bottom.
- *Why:* Remotion draws the right pointer, hides it after typing as macOS does, and tints the iOS status bar.
- *Symptom:* The arrow showed over every link and beside typed text, and the status bar was a black strip over a white
  header.

**C14. Capture the phone at 390×797.**
- *Rule:* Capture the phone at 390×797 CSS px (isMobile, hasTouch, DSF 2), not 390×844.
- *Why:* Under the 47 pt iOS status bar this fills the iPhone 14's 390×844 pt screen exactly.
- *Symptom:* 844 tall stretches the phone or hides the header under the Dynamic Island.

**C15. Make phone scrolls real iOS swipes.**
- *Rule:* The finger drags 1:1 for `dragSec` (0.25–0.3 s), lets go, and the page coasts with exponential decay
  (`tauSec` 0.32). The touch point rides with the content.
- *Why:* An eased `scrollTo` with a separate finger dot reads as fake.
- *Symptom:* The touch disc moved a third of the scroll distance while the content glided on an ease.

**C16. Play the loader once.**
- *Rule:* Show the site's intro loader only in shot 1 (`presetIntroSeen: false`). Preset the intro's sessionStorage
  key in every other shot.
- *Why:* The loader plays once per session and must never replay mid-film. `capture.cjs` refuses a
  `presetIntroSeen` shot with no `introKey`, because the old Discount default would silently replay another client's
  loader.
- *Symptom:* Without the preset, the loader replays at the start of a later shot.

## Staging: what the camera may see

**S1. Re-stage, never blur.**
- *Rule:* Content outside the confirmed fact list never enters the frame: end the shot on a clean section, or stop the
  phone one swipe earlier. Be consistent: if a rating is out, a testimonial is out too.
- *Why:* A blur reads as a rendering fault or as hidden prices, and pulls the eye to exactly what you hid.
- *Symptom:* Blurred Discover tiles ("$205/mo", "4.8/5", "24 Google reviews") sat centre-frame for 3.5 s next to a
  sharp testimonial. The phone first ended on finance fine print (F5, F25).

**S2. Brand fixes go in `captureCss`.**
- *Rule:* Put video-only brand fixes in the storyboard's `captureCss` (injected into every shot by `capture.cjs`): the
  status dot in `currentColor`, the native search-cancel × hidden, the hours pill aligned. List them in the README and
  tell the owner the same rules fix the live site.
- *Why:* The brand allows black, white and the logo colour only. The site source is off limits while making the demo,
  and a 1.8–2.0× zoom magnifies small misalignments.
- *Symptom:* A green dot centred in the 1.8× hours zoom, a blue × in the finder zoom, and "Open Now" 6 px low (F24,
  F15).

**S3. Confirm a hover reads before relying on it.**
- *Rule:* Before relying on a hover to read on camera, check the target's actual hover style in the site CSS, and
  confirm it in a 1:1 crop.
- *Why:* Some hovers are tiny. The Admin row only nudges its arrow about 4 px.
- *Symptom:* Two crops of the Admin row looked identical until the arrow was compared.

**S4. End the last site shot on the app's entry row.**
- *Rule:* End the last site shot before an app segment held at 1.8× on the row that enters the app, with the cursor
  resting on it and no click. The next segment starts its cursor from that capture (`fromShot`). Leave the segment
  itself to its own recipe.
- *Why:* It gives a clean, documented cut point, and part B inserts without re-cutting part A.

**S5. Keep the film moving.**
- *Rule:* Nothing is still for more than about 4 s. Each zoom-out lands and holds at 1× for at least 0.3 s (8–10
  frames) before the next scroll. Trim dead holds. Show the product within about 3 s.
- *Why:* A demo needs a hook and beats; a camera that never rests exhausts the viewer, and long holds lose them.
- *Symptom:* The camera moved non-stop for 3 s, and the product appeared at 4.3 s (F19, F4).

## Composition

**P1. Never grade the recording.**
- *Rule:* Draw grade, vignette, dither and heavy grain on the backdrop only, UNDER the window and the phone. Only
  overlay grain ≤ 0.03 (0.025 shipped) may sit over the UI. Check that a white page reads 255 at the window's edges.
- *Why:* A screen recording is never graded or vignetted. This deliberately overrides the remotion skill's "vignette
  on top" rule.
- *Symptom:* Page whites dropped to 187–228 in the corners. Identical values at three frames proved it was an overlay
  (F1, F23).

**P2. Cut hard inside the window.**
- *Rule:* Cut HARD between captures inside the window (`xfadeSec 0, blurPx 0`), staged for PSNR ≥ 45 dB. Use a
  dissolve only between captures that genuinely differ.
- *Why:* On identical content a blur or dissolve does not hide a seam; it creates one.
- *Symptom:* A 6-frame crossfade with a 6 px blur read as a focus hiccup at every cut (F2).

**P3. Use one persistent window.**
- *Rule:* Play every desktop capture in ONE `DesktopScene`: it springs in once and breathes. Map capture frames with
  `<Freeze>`. Draw the wallpaper once at the root.
- *Why:* Per-shot scenes re-spring the window and restart the wallpaper drift at every cut.
- *Symptom:* The drift restarted at each cut. A wrong frame mapping showed as a stutter.

**P4. Keep the last desktop mounted under the phone.**
- *Rule:* Keep the last desktop sequence MOUNTED under the phone, frozen on its last frame and receding
  (`HoldUnderPhone`). Never mount a fresh copy of a capture on a cut frame.
- *Why:* A capture mounted on the cut frame has nothing decoded yet, so a full render shows black there. Single stills
  never show it.
- *Symptom:* One black frame at f1099 in the first v1 render.

**P5. Lean the window in with zoom depth.**
- *Rule:* The whole window leans in with zoom depth (`pushScale` 0.10), filling the frame top to bottom at ≥ 1.8×.
- *Why:* Screen Studio and Recordly zoom the whole canvas; a fixed window with scaling content reads as a page zoom.
- *Symptom:* At 0.035 the push was invisible (F8).

**P6. Frame every zoom by hand.**
- *Rule:* When the captured focus cuts text, use a fixed point (`follow: false`). No frame edge runs through text or a
  pill. A neighbour's label is fully in or fully out, and frame edges fall in the gutters. At most one logo-colour
  element per frame. Go to 2.0 rather than recapture. Write each focus point's `why` and its `frame` rules into the
  storyboard, so `measure-site.cjs` can check them and suggest a passing focus.
- *Why:* A zoom is the close-up, so every slice is magnified.
- *Symptom:* The Trucks card was cut through "Ask About Availability"; a label read "ars →"; an 80 px grey strip of the
  next section showed; a red Coupe sliver sat at the edge; the hours zoom was aimed low (F13–F15).

**P7. Give the wallpaper a neutral grey mesh.**
- *Rule:* A neutral grey mesh (R=G=B) with a mean of about 40/255, a static dither, and CRF 16. The window gets a 1 px
  top highlight and a large offset shadow.
- *Why:* The window has to float, and h264 bands dark gradients without dither.
- *Symptom:* A near-black (mean 20) violet wallpaper with banding rings, and the window's edge vanished (F7).

**P8. Match-cut the intro onto the site's loader.**
- *Rule:* When shot 1 shows the site's loader, the intro sting is a MATCH CUT onto it, laid out from the loader's rects
  (measured by `measure-site.cjs`) × 600/360. The window starts at the hand-off (1.4 s), the sting shrinks onto the
  loader over 0.47 s, a cover hides the loader's logo until it lands, then a 0.13 s dissolve. Re-measure whenever the
  loader changes.
- *Why:* The loader continues the sting instead of repeating it. One logo is on screen at every frame, and the product
  appears sooner.
- *Symptom:* "DISCOUNT" showed twice at f85; later, about 4 s of logo played before the product (F4, R1-5).

**P9. Derive every hand-off frame.**
- *Rule:* Derive every hand-off frame in `timeline.ts` from the previous element's exit or landing. For example,
  shot-1 trim = `wordDoneSec − handoffSec + 1 frame`.
- *Why:* Typed offsets break silently when an animation length changes, and a match cut only works on a loader at
  rest.
- *Symptom:* A doubled logo, and the suggested `trimSec 0.8` did not land on a resting loader.

**P10. Draw the outro under the phone.**
- *Rule:* Draw the outro UNDER the phone: its Sequence comes before the phone's in `Demo.tsx`.
- *Why:* A later Sequence paints on top. The outro starts 0.2 s before the phone ends.
- *Symptom:* The red logo double-exposed across the exiting phone (F3, F21, R1-2).

**P11. Make the phone an object.**
- *Rule:* The phone is opaque within 2 frames. It enters on a spring slide with scale, tilt and speed-proportional
  motion blur (max 5 px), and leaves as an accelerating drop with blur. The desktop behind recedes and fades with it.
- *Why:* Anything over about 30 px/frame without blur judders, and a see-through phone reads as a dissolve.
- *Symptom:* The desktop showed through the phone, and the phone moved 113–133 px/frame unblurred (F16, R1-1).

**P12. Keep the iPhone realistic.**
- *Rule:* Tint the status bar every frame from the capture's top-edge colour, with glyphs chosen by luminance. Draw the
  134×5 pt home indicator, 55 pt corners and the Dynamic Island, and set the clock to 9:41.
- *Why:* These details make a phone mock read as a real iOS recording.
- *Symptom:* A black strip sat over a white header, and there was no home indicator (F17).

**P13. End on facts and black.**
- *Rule:* The outro is the logo, then ONLY confirmed facts (URL 42 px; other lines 30 px at ≥ 75% white, 82% shipped),
  word-staggered, on a slow push 1.00 → 1.03. Then the logo exits, the frame fades, and the last frame is black.
- *Why:* It must read on a phone and end cleanly.
- *Symptom:* 28/23 px dim lines, and a 3 s dead still that ended on a hard cut (F18, F27, R1-4).

The indicators follow the same thinking: the click ring and the touch disc carry a dark edge, so they read on white
pages and on black bands (F22).

## Cursor

**K1. Hide the cursor while the page scrolls itself.**
- *Rule:* Fade AND shrink the drawn cursor to 0.85 around its tip (0.17 s) while the page scrolls by itself. Merge
  self-scrolls less than 0.67 s apart into one hidden stretch.
- *Why:* A real user's pointer does not wander during a scripted scroll, and reappearing between two quick scrolls
  looks like a glitch.
- *Symptom:* The cursor blinked in the gutter between two scrolls (F10, F30).

**K2. Draw the shape macOS would show.**
- *Rule:* Draw the recorded macOS shape: the arrow by default, the hand over links, and the I-beam ONLY in editable
  fields. Hide the pointer from the first keystroke until the next mouse move, and from frame 0 after a typing
  preroll.
- *Why:* This is what macOS does, and it is what makes the recording read as real.
- *Symptom:* An arrow over Menu, the cards and Admin, and an arrow beside the typed query (F12).

**K3. Rest the cursor beside the text.**
- *Rule:* Rest the cursor in empty space beside the target text, never on its glyphs. Place it with the hover anchor.
- *Why:* A cursor parked on a letter covers it in the close-up and looks aimless.
- *Symptom:* It covered the full stop of "For Less." for 3.7 s in the 1.5× zoom (F11).

## Sound

**A1. Ship the processed sound files.**
- *Rule:* Use the processed files in `assets/sfx/`: `open_ui` cut to 0.6 s with a fade, 7 single keystrokes, and
  `whoosh_short` with `_lo` / `_hi` ±1.5 semitones. `new-project.sh` copies them.
- *Why:* The kit's `open_ui` ends in a lone tick; typing needs one real hit per character; repeated zooms need
  different samples.
- *Symptom:* A 20 ms tick about 0.97 s after each `open_ui` sounded like a click with nothing on screen (F6).

**A2. Peak the whoosh with the camera.**
- *Rule:* Place each zoom whoosh so its peak (0.3 s into the sample) lands one frame before the camera's fastest frame,
  computed from `zoomInEase`. With bezier(0.65, 0, 0.2, 1) over 1.5 s the fastest frame is zoom start + 19, so the cue
  goes at zoom start + 9. Rotate the three variants.
- *Why:* The sound should peak with the motion, and one sample six times sounds canned.
- *Symptom:* Cued at start − 2, the peak landed while the camera had barely moved (F9).

**A3. Lead the sound slightly.**
- *Rule:* Clicks and taps lead by 2 frames, keys by 1. Click = `ios_tink` −12 dB. Type = one key per character at
  −18 dB ±1.5. The menu's `open_ui` plays 1 frame after its click; the phone's `open_ui` is at −16 dB.
- *Why:* Slightly early feels in sync; late feels broken.
- *Symptom:* Clicks led by only 1 frame and keys by 0 (F33, R1-13).

**A4. Set the level for an SFX-only mix.**
- *Rule:* For an SFX-only mix, master +10 dB. True peak stays under −1 dBTP (shipped −4.8 dBTP, −17.3 LUFS). Music is
  the user's.
- *Why:* The kit is about −27 LUFS bare, which is inaudible on phone speakers.
- *Symptom:* −14.9 dBFS peak and −27.4 LUFS; clicks nearly inaudible (F20).

**A5. Map every onset to the picture.**
- *Rule:* Run a per-frame onset map: peak per video frame, onsets ≥ 9 dB above the previous 3 frames, and an
  isolated-blip detector. Every onset must sit on an on-screen event. `verify-film.cjs` does this against the cues the
  composition itself computes.
- *Why:* volumedetect and listening at speaker level miss quiet stray ticks.
- *Symptom:* The `open_ui` tail tick passed the peak check and was caught only by the onset scan.

## Code

**D1. Keep timings in seconds.**
- *Rule:* Every timing lives in `theme.ts` in SECONDS and is converted with `toFrames`. Letters and words are
  staggered ≥ 3 frames.
- *Why:* Magic frame numbers break at any other fps, and a 2-frame stagger reads as a block.
- *Symptom:* About 20 hard-coded frame counts, and words arriving as one block (F28, R1-8, R1-10).

**D2. Clamp what a spring drives.**
- *Rule:* Clamp opacity, scale and blur from springs and interpolations, and wrap every blur in `Math.max(0, …)`. A
  translate may overshoot when wanted.
- *Why:* Underdamped springs overshoot, and a negative blur is invalid CSS.
- *Symptom:* `blur(-0.15px)`, and the browser dropped the whole filter (F29, R1-7).

**D3. Pair every fade with a scale.**
- *Rule:* Never animate opacity alone: the cursor goes 0.85 → 1, the touch disc 0.8 → 1.
- *Why:* This is the remotion rule against lone fades; it makes the change read as deliberate.
- *Symptom:* Opacity-only cursor and finger fades (F30, R1-6).

**D4. Read colours and gains from the theme.**
- *Rule:* Never inline colours or gains in components; read them from `theme` (`colors.*`, `shade()`, `theme.sfx.*`).
- *Why:* There is one source of truth, so a re-skin is a theme edit.
- *Symptom:* `rgba()` literals in three components, and a stray `S.open.db − 2` (F31, R1-9). That one remains inline
  in `Demo.tsx` as the phone's −16 dB; it is documented in house-recipe §11.

**D5. Fail loudly on fonts, and gate the desk host.**
- *Rule:* `cancelRender` when a font face fails, and set every `fontFamily` from `theme.fonts.stack`. Keep
  `project.partBDomain` null until the owner confirms the desk host.
- *Why:* A missing face must fail loudly, not ship in serif. The desk host is not a confirmed fact.
- *Symptom:* A failed font load would have rendered silently in serif (F32, F34).

## Review

**R1. Extract the right frame.**
- *Rule:* Extract film frame f with `ffmpeg -ss (f − 0.5)/fps`. Check once against `select=eq(n,f)`, which should give
  PSNR inf. Grab the last frame with `-sseof`.
- *Why:* `-ss` returns the first frame at or after t.
- *Symptom:* (f + 0.5)/30 always returned frame f + 1. Plain f/30 returned f or f + 1 depending on how the time was
  rounded (36.6667 → f1101, 36.666667 → f1100). A seek at the very end returned nothing.

**R2. Scan the luma of every full render.**
- *Rule:* After every full render, scan the MP4's per-frame YAVG for one-frame spikes, and explain or fix each one.
- *Why:* Mount, decode and remount glitches appear only in a full render.
- *Symptom:* One black frame at the phone cut.

**R3. Look at the moments defects hide in.**
- *Rule:* Check stills at every hand-off, cut (−0.3 s, last, first, +0.3 s), zoom at full depth, click ring, typing
  moment, drawer, phone entry frames 0/2/5, swipe, phone exit, outro and last frame (about 46; `verify-film.cjs`
  derives them). Look at every one.
- *Why:* Each defect in this film sat on one of those moments.
- *Symptom:* The doubled logo, the outro double exposure, the see-through phone and the invisible ring were each
  visible on only 3–5 frames.

**R4. Prove whether a tone change is an overlay.**
- *Rule:* Prove it numerically: read the same pixel in the raw capture and the render, across several frames.
- *Why:* An overlay gives identical values in every frame; page content does not.

**R5. Measure fast moves.**
- *Rule:* Measure fast moves in px/frame. Over about 30 px/frame needs motion blur.
- *Why:* Judder shows as separate sharp copies, easy to miss at speed.

**R6. Check your own crop before reporting a slice.**
- *Rule:* Before reporting a sliced element, confirm the crop coordinates (CSS px × DSF for captures; film px × window
  scale for renders). Look at the diff image and the printed changed region before chasing a low cut number: a
  site's own small looping animation can hold a cut near 45 dB. Under 45 it passes only with `--allow-cut`, which
  verify-film grants when PSNR ≥ 40 and the change fits in one 64 × 64 CSS px box.
- *Symptom:* A reported "slice" was the reviewer's own crop box. Cut 1 is 45.1 dB because of the site's bobbing
  scroll arrow (changed region 16 × 10 px).

**R7. Use two critics, one merged list.**
- *Rule:* Review each render with two independent critics, LOOK and RULES. Merge their findings into one numbered list.
  The polish pass returns every id as fixed or rejected with a reason, re-renders and re-verifies, then diffs every
  still against the previous render.
- *Why:* One critic missed what the other caught (only RULES caught the invisible ring; only LOOK caught the tick), and
  explicit rejections become decisions to keep.

## Operations

**O1. Run heavy work politely in a shared container.**
- *Rule:* Run renders with `nice -n 15` (about 11–12 min for about 1500 frames at concurrency 3). Run the typecheck in
  the foreground BEFORE backgrounding a render. Capture with `--clean`, since a 15 s DSF 2 shot is about 2.5 GB of PNG.
  Delete the `/tmp/remotion-webpack-bundle-*` your runs created. Never run `playwright install`.
- *Rule:* Serve the demo build on its own port (5183) with `./node_modules/.bin/vite preview`, started through `exec`
  after writing `$BASHPID` (in a subshell) to the pid file, so the PID kept is vite's own, and kill it by that PID. An
  `npx` wrapper's PID leaves vite running, and `$$` in a subshell is the parent's PID. Never touch other workflows'
  ports.
- *Symptom:* A backgrounded `tsc && render &` hid the typecheck result, and frame folders filled the disk.

**O2. Write the browser path so bash expands it.**
- *Rule:* Pass Remotion's browser as `--browser-executable=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux)/headless_shell`.
- *Why:* Bash does not expand a glob glued to `--flag=`, so Remotion would receive a literal `*` path.

## Part B: the desk

Part B (the sale desk) went through a desk build/verify pass, captures 6-12, two compose passes, a critic round
(LOOK + RULES) and a finish pass. Source IDs: B-F1…B-F16 are that critic round's findings, by film second.

**B1. Cut onto the first fully painted frame, never a blank page.**
- *Rule:* A part-B segment opens on the new page's first frame whose content is painted (`partB.cuts`, the
  `first frame painted` gate: edge density ≥ 11). The click that caused the navigation is drawn before the cut and its
  ring runs on across it (`withCutClick`, `edit.moveEvents`).
- *Why:* The desk's pages paint in a few frames (6's card fades in over frames 4–12). A camera still on the previous
  page's aim over an empty grey page flashes white (mean luma 130 → 198) and the click lands on nothing.
- *Symptom (B-F 36.6 s):* frames 1099–1101 a blank grey page, then the card slid in half off-frame while the camera
  hunted for it.

**B2. A loading state is cut out by splitting the capture.**
- *Rule:* Where a capture shows a skeleton loader, a dialog's close or a blank page between two painted states, play the
  capture as two segments of the same shot (8a/8b, 10a/10b) with the gap cut out; start the next camera move on the cut
  (`zoomShift`).
- *Why:* Screen Studio never shows a loading state; a jump-cut on the click reads as the app being instant.
- *Symptom (B-F 50.0 s, 59.2 s):* half a second of skeleton with a whoosh over it after Start A Sale; after the hold's
  release, two frames of un-dimmed form (a flicker) and six of blank page, with the release tink on the blank.

**B3. The camera is matched across a cut, or it moves before the click, never after on empty ground.**
- *Rule:* At every B cut the camera is identical on both sides (gate: scale Δ ≤ 0.01, pan ≤ 3 px). When the next page
  needs a different framing, the camera moves on the outgoing page before the click (7's zooms leave at 182 so Start
  Working is clicked at 1.0) or from the cut frame on.
- *Symptom (B-F 49.0 s):* Handle A Sale opened at the onboarding's 1.45x: the Marcus Reed row floated top-left over
  empty grey and the sidebar "popped in" as the camera pulled back. It was the camera, not the page (the capture has
  the sidebar from frame 0).

**B4. Never zoom away from the click target.**
- *Rule:* Before a click, hold the framing (if the target is in it) or reframe toward it. 12 holds PACKET to the end
  (`outAtSec: null`): it already frames the Form 130-U row and its button.
- *Symptom (B-F 66.4 s):* a pull-out from 1.62x to 1.0x just before Open / Print: a soft, small frame at the click.

**B5. The pointer never covers the word the beat is about.**
- *Rule:* For a press-and-hold, press off the label (`edit.nudge` dx 45 on 10, eased in on the approach and out on the
  way to Cash). The pointer is drawn by the composition, so this changes no captured pixel.
- *Symptom (B-F 58.4 s):* "Release To Confir" with the hand over the m at 2.0x.

**B6. The document's payoff is centred, lit and held.**
- *Rule:* Push to the deepest scale that keeps the line's ends in frame (0.8), centre the certification block, put the
  top edge in a text-free gap, dim the rest with a spotlight, sit the caption over the dimmed lower rows, and hold the
  caption readable ≥ 1.5 s (B6 is 4.3 s).
- *Symptom (B-F 69.5 s):* the tax table cropped mid-line at the top, the seller line at 38% of the frame, a dead dark
  band under the page and the pill readable 1.1 s.

**B7. Identity on a document is blurred like money.**
- *Rule:* `project.doc.privacy` covers box 14 (licence number), box 1 (VIN) and box 38(a) (money), with `padPx` 4 so no
  blur runs into a header. Demo data that looks real (an 8-digit licence, a check-digit-valid VIN) is treated as real.
- *Symptom (B-F 67.7 s, 68.3 s):* a paused frame read "41927365" and the VIN; the 10 px pad frosted "SALES AND USE TAX
  COMPUTATION".

**B8. The hand-made gestures have a sound.**
- *Rule:* A felt-tip under each pen stroke (`pen_scratch`, cut per stroke with a 0.06 s fade) and a soft rise under the
  hold's fill (`hold_rise`), ending into the release tink.
- *Symptom (B-F 43.6 s):* 3.7 s of silent signature and 2.2 s of silent hold, the film's two hand-made moments.

**B9. The phone does not open over a tax form.**
- *Rule:* With a part B, the held desk and document dissolve to the wallpaper over the phone's first 0.4 s
  (`theme.doc.phoneDissolveSec`).
- *Symptom (B-F 71 s):* the public site on the phone over a blurred 130-U read as a leftover.

**B10. One cue function for the scene and the verifier.**
- *Rule:* `desktopCues` (DesktopScene) is the only place the window's sounds are derived; `verify-film.cjs` calls it
  with the same edited data (`prepareData`), and B6's push whoosh goes through it (`docWhooshAfter`) so its variant
  continues the rotation.
- *Symptom (B-F RULES):* the verifier missed the zoom-end ios_success and the hold-end tink, labelled whoosh variants
  differently, and Demo.tsx hard-coded the doc push to `files[1]`.

**B11. Render with a capped video cache.**
- *Rule:* `--concurrency 3 --offthreadvideo-cache-size-in-bytes 1500000000` for the 2474-frame film.
- *Symptom:* the compositor was OOM-killed at frame 2129 (7.9 GB RSS) while other workflows ran.

**B12. The self-test determinism check needs an idle machine.**
- *Rule:* Run `capture.cjs --selftest` when the load average is low; on a determinism FAIL under load, re-run once
  before investigating.
- *Symptom:* DSF 1 repeat min PSNR 39.1 dB at load ≈ 10; 69.4 dB on a re-run at low load, same file.

**B13. Check a demo address does not exist.**
- *Rule:* A fictional buyer address on screen must not be a real household: search it before capture.
- *Note:* 1418 Belrose Dr, Houston 77034 was checked (the real Belrose Dr is in 77035 and numbered 55xx–59xx).

## The narrated long cut

The narrated variant (`references/narration.md`) for Discount: 24 voice lines, captures 20-27 on one fresh desk, a
plan that anchors each line's key word on its picture, then a stills pass and a timing pass.

**N1. The address lookup needs the proxy env on the desk server.**
- *Rule:* Start the desk's `next dev` with `NODE_USE_ENV_PROXY=1` when outbound HTTPS goes through an agent proxy.
- *Why:* The street autofill (city, ZIP, county) calls the Census geocoder from the server; Node's fetch ignores
  `HTTPS_PROXY` without it.
- *Symptom:* "Filled in from …" never appears; the city, ZIP and county stay empty and the line "the desk looks up the
  city, the ZIP and the county" has nothing to show.

**N2. The demo address must be one the geocoder knows, and must not be a household.**
- *Rule:* Pick a real street the Census geocoder resolves (Discount: 10418 Almeda Genoa Rd, Houston 77034, Harris
  County), and check it is not a listed home (B13).
- *Why:* An invented address is not found, so the autofill the line promises does not happen.

**N3. A licence scan is filmed through a test camera feed, never a photo of a real licence.**
- *Rule:* Override `getUserMedia` with a canvas stream drawing a card printed "DEMO CARD" (front, then back on
  `window.__cam.side = 'back'`). Its PDF417 is a generated AAMVA payload for the demo buyer; click the shutter rather
  than waiting for the scanner's quality gate.
- *Why:* The desk's decoder is real, so the name and number really fill in; the gate never passes on synthetic frames.
- *Symptom:* Not decoded when the barcode is small or flattened in the strip; `DAQ` (the number) not parsed without a
  line feed after the `DL` subfile designator. Leave out the address elements when the film types the address.

**N4. Headless Chromium paints no native select popup.**
- *Rule:* Intercept the select's mousedown, draw a stand-in menu where the OS menu opens, set the value on the real
  select; say so in the README.
- *Symptom:* The click opens nothing, then the value changes by magic.

**N5. A second phone session needs a different drawing.**
- *Rule:* When the ceremony is captured in two sessions, the second draws the same hand slightly changed (Discount:
  ×0.95, +9, +4 px).
- *Why:* A fresh session offers no earlier stroke to reuse, and the server refuses a pixel-identical one (reuse
  consent).
- *Symptom:* Sign And Finish errors with the reuse-consent message.

**N6. A failed capture changes the mock: restart, re-onboard, rebuild.**
- *Rule:* After any capture that fails part way, restart the desk (by PID), onboard the member again off camera and
  rebuild the deal with the scenario before the next capture.
- *Symptom:* Later captures open on a half-finished deal or skip the onboarding the film needs.

**N7. The mock keeps no uploaded files.**
- *Rule:* The licence review page (which shows the scan's images) is confirmed off camera and cut around.
- *Symptom:* Broken image boxes on "Check What The Card Says".

**N8. The word comes just before the action, measured on real event frames.**
- *Rule:* Anchor a line's key word 0–0.3 s before the click, press or menu it names, from `cursor.json` events.
- *Why:* The storyboard's planned seconds drift by the page's own timing; anchoring on a hover start left "hold" 0.7 s
  before the press and "done, yours, theirs" 0.5 s before each hover.

**N9. Frame every zoom against measured boxes, and judge edges at full size.**
- *Rule:* Compute the view (viewport ÷ depth around the focus) against the page's boxes before rendering; look at
  doubtful edges in a full-size crop.
- *Symptom:* A 6 px sliver of a black button along the bottom; a dimmed heading half in frame over a dialog. The
  contact-sheet thumbnails made clean edges look cut, and one "fix" from a thumbnail would have made the frame worse.

**N10. Keys closer than their push never land.**
- *Rule:* Space document keys at least `dur` + 0.3 s apart, or accept that the camera passes through the first.
- *Symptom:* The bill of sale's total row is held for 5 frames before the camera moves on to the lien section.

**N11. The transcribe-back check is a prompt to listen.**
- *Rule:* Every difference between `speak` and what faster-whisper heard is listed and decided.
- *Symptom:* Whisper heard "walking and", "the sales Spanish"; Kokoro's line 20 is heard without its opening "And".

**N12. A cut between two zoom states needs a camera on both sides.**
- *Rule:* Where a camera must run on across a jump cut, start the next segment's zoom before its first frame
  (`edit.addZooms`, negative `startFrame`) or shift the outgoing zoom (`zoomShift`); the check compares a moving camera
  with its next frame.
- *Symptom:* A 2.0x read-back cut onto a 1.0x page: the pointer and the page jumped at the cut.

## Decisions kept: do not "fix" these

Reviewers proposed each of these, and each was rejected with a reason. They are part of "exactly this way".

- **Trucks zoom:** a 2.0× re-aim on the existing scroll, not a recapture lower on the page (F13). A lower scroll brings
  in more of the next section, and no 1.5× framing fits.
- **Grade and vignette:** stay under the window (F23 → F1). A screen recording is never graded.
- **Site copy in zooms:** the site's own claim-like copy ("Easy Financing…", "Every Price Is Shown Plainly") is left to
  the owner (F26 / R1-12). It is listed in the README under decisions.
- **The site source:** not edited; fixes are video-only `captureCss` (F24), and the README tells the owner.
- **Clamping:** only opacity, scale and blur are clamped; spring translates may overshoot (F29).
- **Cursor shape over static text:** the arrow; the I-beam appears only over editable fields. Shapes come from the
  recorded CSS cursor (F12).
- **Desk host:** not shown in the URL pill until the owner confirms it (F34). Discount's was confirmed
  (desk.discountusedcarsandtrucks.com).
- **Part B cuts are jump-cuts, not pixel-matched:** the page changes on a click, so the gate is pointer + camera + a
  painted first frame, not PSNR.
- **10b opens at READ_BACK's 2.0x:** the camera is matched at the cut and pulls back from it; cutting the camera too
  would move the pointer on screen at the cut.
- **The 6→7 cut keeps the onboarding page's own entrance** (capture frame 0, edge density 11.4): it is the page's
  designed fade, not a loading state.
- **Phone travel:** the 0.45×W spring slide stays, carried by speed blur and 2-frame opacity, rather than a shorter
  slide (R1-1 alternative).
- **Intro sting:** the match cut onto the loader replaced the "full-colour logo sting" and "shorter sting" options. The
  full-colour logo is reserved for the outro.
- **Recolouring the navy/amber Discover tiles** and the 14 px privacy blur: replaced by re-staging on the service band
  (F25, F5).
- **Scrolling back up before Menu:** not used; the story keeps moving down the page (F5 alternative).
- **Outro double exposure:** fixed by layer order, not by delaying the logo or shortening the overlap (F3 / F21).
- **Masking the window's rect out of the grade:** not used; the grade simply moved to the backdrop (F1 alternative).
- **Seams:** cuts stay hard on pixel-matched frames, not moved inside a scroll or zoom to hide a seam (F2 alternative).
- **Phone exit:** an accelerating drop with blur, not a mirrored spring slide (F16).
- **Whoosh cue:** derived from the ease (start + 9 at 1.5 s), not a fixed "+10". The variants are pre-pitched files
  (F9).
- **Chromium's blue search ×:** hidden (F24 overruled the capture pass's "leave it").
- **Crossfade between in-window captures:** replaced by hard cuts (F2).
- **Traffic lights:** mono grey; `color` only on request.
- **Visit card copy** (zip, cross streets) and a few pixels of the next card under the phone's dock: site rendering,
  left as is.
- **Admin hold framing:** the 1.8× follow zoom on `.drawer__link--admin` is not moved up about 45 px to push the
  "Open Now" row out of frame (R1-11 alternative). The green dot is recoloured by `captureCss` instead, which also
  fixes the header and the hours zoom.
- **Cut 1's scroll arrow:** the hero's bobbing arrow is not hidden or phase-matched to lift cut 1 above 45.1 dB; it is
  the site's own motion, and the cut passes.

## Open items

These are not decisions.

- **`ease.in` is expo-like.** The final fade reaches black in what reads as a ~3-frame pop (YAVG 27.1 at f1475, black
  at f1476). The critic's fix was a cubic-in `bezier(0.32, 0, 0.67, 0)` for exits. The user approved the film as it
  is, so change it only on request.
- **No SFX stem** exists for when music is added.
