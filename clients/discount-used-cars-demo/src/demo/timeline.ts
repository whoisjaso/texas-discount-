// The film's running order (storyboard.json), in frames derived from fps.
//
//   Intro sting ⇢ (match cut onto the site's loader) [window] 1-hero → 2-scroll → 3-buy → 4-menu → ‖ CUT POINT ‖
//   → B1-B5 the sale desk, same window (6-desk-signin … 12-desk-signed) → B6 the 130-U in a Preview window
//   → [iPhone] 5-phone → Outro
//
// Part B goes in at the cut point: shot 4 ends held at 1.8x on the drawer's Admin row and 6-desk-signin opens on that
// click, in the same window and the same camera. Every cut inside part B is a jump-cut on a click's navigation frame
// (the capture ends on the frame before the page changes, the next one opens on the new page with the cursor and the
// camera where they were), so they are HARD cuts like part A's (theme.transition.xfadeSec 0), never a dissolve.
import { theme } from "../theme";
import { project } from "../project";
import { DesktopSegment, desktopLength } from "../scenes/DesktopScene";

const sec = (s: number) => Math.round(s * theme.fps);

const S = theme.sfx;

// The window starts when the sting begins its hand-off and the sting lands on the loader handoffSec later: start the
// capture so that landing falls one frame after the loader's word has finished rising (it must be at rest to match).
const shot1TrimFrames = sec(project.loader.wordDoneSec) - sec(theme.sting.handoffSec) + 1;

/** Shots 1–4 share one window. Lengths from storyboard.json (shot.durationSec); every cut is pixel-matched. */
export const partASegments: DesktopSegment[] = [
  { shot: "1-hero", trimSec: shot1TrimFrames / theme.fps, durationInFrames: sec(7.6) - shot1TrimFrames },
  { shot: "2-scroll", durationInFrames: sec(17) },
  { shot: "3-buy", durationInFrames: sec(5.7) },
  // the drawer opens on the first click: open_ui on top of the click's tink
  { shot: "4-menu", durationInFrames: sec(6), eventCues: [{ type: "click", index: 0, file: S.open.file, db: S.open.db, offsetSec: 1 / theme.fps }] },
];

/** The URL pill from the first desk frame. */
const DESK = project.partBDomain ?? project.domain;

/**
 * Part B's static cameras, re-aimed in the composition (zoomFocus) so no frame edge runs through text, and kept
 * identical on both sides of every cut (CSS px of the 1440x900 page; the capture's own values are in its cursor.json):
 * - SIGN_IN (6 → 7 → 8's head): the sign-in card from "Team Access" to "Request Access" (logo and footer out), the
 *   onboarding steps, and Handle A Sale's "Marcus Reed" row, all between the frame's edges (was 1.5x on 720,470: it cut
 *   "Request Access" and the row's name).
 * - WIZARD (8 → 12's head): every sale step from its heading to its Next / Start Sale button (was 1.4x on 720,490: it
 *   cut "What Is The Buyer's Name?" and the Next button).
 * - READ_BACK (10): the read-back card, the dimmed form's heading out (was 720,450: it cut the heading).
 * - PACKET (12): the progress card, "Updates automatically", Bill Of Sale and Form 130-U rows, under the header's rule
 *   (was 1.8x on the progress card's centre: the edges cut the header and the Form 130-U row).
 */
const SIGN_IN = { point: [720, 482] as [number, number], depth: 1.45 };
const WIZARD = { point: [720, 490] as [number, number], depth: 1.32 };
const READ_BACK = { point: [720, 472] as [number, number], depth: 2.0 };
const PACKET = { point: [720, 356] as [number, number], depth: 1.62 };

/**
 * A part B capture: its length is the storyboard's durationSec (each capture already ends on the frame before its
 * click's navigation, cutFrames in the storyboard). `headSec` trims the capture's still head (page drawn, cursor and
 * camera at rest): it is cut so the cursor sets off about 0.1 s after the cut, as in the capture after its first frame.
 */
const deskSegment = (shot: string, captureSec: number, more: Partial<DesktopSegment> & { headSec?: number } = {}): DesktopSegment => {
  const { headSec = 0, ...rest } = more;
  return { shot, url: DESK, trimSec: headSec, durationInFrames: sec(captureSec) - sec(headSec), ...rest };
};

/**
 * B1-B5, inserted at the cut point (same window, same 1440x900 DSF 2 captures). Capture times are seconds of each
 * capture (its cursor.json). Head trims: 8 sets off at 0.47 s, 9 at 0.27, 10 and 11 at 0.33, 12 at 0.37 (smoothed
 * cursor); 6 (the Admin click lands on its frame 0) and 7 (the onboarding page's own entrance) are not trimmed. Where a
 * zoom moved inside the trimmed head (8's pull-back, 12's push onto the progress), zoomShift moves it by the trim, so
 * the first frame shown has the camera the previous capture ended on.
 */
export const partBSegments: DesktopSegment[] = [
  // B1 · the Admin click lands on frame 0 (its tink falls 2 frames before the cut, in shot 4), the desk's open_ui on
  // top of it; email (privacy-blurred), password, Sign In
  deskSegment("6-desk-signin", 4.1667, {
    zoomFocus: { 1: SIGN_IN },
    cues: [{ frame: -sec(S.click.leadSec), file: S.click.file, db: S.click.db }],
    eventCues: [{ type: "click", index: 0, file: S.open.file, db: S.open.db, offsetSec: 1 / theme.fps }],
  }),
  // B2 · first sign-in: name, the pen draws Maria's signature (1.8x on the pad), Save → "You Are All Set" (ios_success
  // as the done step appears, 4 frames after the Save click), Start Working
  deskSegment("7-desk-onboard", 8.1667, {
    zoomFocus: { 0: SIGN_IN },
    // clicks: first name, last name, Next, Save Signature (index 3), Start Working (the pen is a draw, not a click)
    eventCues: [{ type: "click", index: 3, file: S.success.file, db: S.success.db, offsetSec: 0.13 }],
  }),
  // B3 · Handle A Sale → Start A Sale → the Camry; the buyer's name; the read-back and Hold To Confirm (a tink at the
  // press, a softer one at the release) → "How Are They Paying?" → Cash
  // (8's pull-back from the onboarding camera starts 2 frames after the cut, so Handle A Sale is revealed at once)
  deskSegment("8-desk-sale-start", 3.6667, { headSec: 0.367, zoomShift: { 0: { outSec: 0.267 } }, zoomFocus: { 0: SIGN_IN, 1: WIZARD } }),
  deskSegment("9-desk-buyer", 3.2, { headSec: 0.167, zoomFocus: { 0: WIZARD } }),
  deskSegment("10-desk-readback", 5.8, {
    headSec: 0.233,
    zoomFocus: { 0: WIZARD, 1: READ_BACK },
    eventCues: [
      { type: "hold", index: 0, file: S.click.file, db: S.click.db, offsetSec: -S.click.leadSec },
      { type: "hold", index: 0, at: "end", file: S.tap.file, db: S.tap.db, offsetSec: -S.tap.leadSec },
    ],
  }),
  // B4 · the guided sale: We Do → No plate yet → The Buyer, Here Today
  deskSegment("11-desk-guide", 3.5667, { headSec: 0.233, zoomFocus: { 0: WIZARD } }),
  // B5 · the packet of the sale completed off camera: the push onto "Ready To Print · 2 / 2 signed" (ios_success as it
  // lands), then Open / Print on the 130-U: the cut to B6
  deskSegment("12-desk-signed", 3.3667, {
    headSec: 0.267,
    zoomShift: { 0: { outSec: 0.267 }, 1: { startSec: 0.267 } },
    zoomFocus: { 0: WIZARD, 1: PACKET },
    eventCues: [{ type: "zoom", index: 1, at: "end", file: S.success.file, db: S.success.db, offsetSec: -0.2 }],
  }),
];

export const buildTimeline = (partB: DesktopSegment[] = partBSegments) => {
  // the sting holds until handoffAt, then shrinks onto the loader inside the springing window (landAt) and dissolves
  // into it over fadeFrames; the loader underneath is identical, so there is one logo on screen at every frame
  const handoffAt = sec(theme.sting.handoffAtSec);
  const landAt = handoffAt + sec(theme.sting.handoffSec);
  const intro = { from: 0, handoffAt, landAt, fadeFrames: sec(theme.sting.fadeSec), durationInFrames: landAt + sec(theme.sting.fadeSec) + 1 };
  const desktopA = { from: handoffAt, durationInFrames: desktopLength(partASegments) };
  const cutPoint = desktopA.from + desktopA.durationInFrames;
  const desktopB = { from: cutPoint, durationInFrames: desktopLength(partB) };
  // B6: the 130-U opens over the desk held on its last frame (only with a part B)
  const doc = { from: desktopB.from + desktopB.durationInFrames, durationInFrames: partB.length ? sec(theme.doc.durationSec) : 0 };
  const phone = { from: doc.from + doc.durationInFrames, durationInFrames: sec(9) };
  // the outro's logo starts under the phone as it drops away (the outro is drawn beneath the phone scene)
  const outro = { from: phone.from + phone.durationInFrames - sec(0.2), durationInFrames: sec(3.8) };
  const total = outro.from + outro.durationInFrames;
  return { intro, desktopA, cutPoint, desktopB, doc, phone, outro, total };
};

export type Timeline = ReturnType<typeof buildTimeline>;
