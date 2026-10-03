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
 * - SIGN_IN (6 → 7): the sign-in card from "Team Access" to "Request Access" (logo and footer out) and the onboarding
 *   steps, between the frame's edges (was 1.5x on 720,470: it cut "Request Access"). 7's zooms leave at capture 182, so
 *   Handle A Sale (8) opens wide, its sidebar and header in frame.
 * - WIZARD (8b → 12's head): every sale step from its heading to its Next / Start Sale button (was 1.4x on 720,490: it
 *   cut "What Is The Buyer's Name?" and the Next button).
 * - READ_BACK (10): the read-back card, the dimmed form's heading out (was 720,450: it cut the heading).
 * - PACKET (12): the progress card, "Updates automatically", Bill Of Sale and Form 130-U rows, under the header's rule
 *   (was 1.8x on the progress card's centre: the edges cut the header and the Form 130-U row). Held to the Open / Print
 *   click: the camera never zooms away from a click target.
 */
const SIGN_IN = { point: [720, 482] as [number, number], depth: 1.45 };
const WIZARD = { point: [720, 490] as [number, number], depth: 1.32 };
const READ_BACK = { point: [720, 472] as [number, number], depth: 2.0 };
const PACKET = { point: [720, 356] as [number, number], depth: 1.62 };
/** shot 10: the hand presses Hold To Confirm 45 px right of where it was captured (over the button, off its label) */
const HOLD_NUDGE = { dx: 45, dy: 0, in: [44, 56] as [number, number], out: [154, 168] as [number, number] };

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
 * The Admin click, drawn on the menu (part A's last capture has the cursor resting on the row but no click): its ring,
 * bounce and tink land CUT_CLICK_LEAD frames before the cut, the desk capture's own copy of that click is moved so the
 * ring and bounce run on across the cut, and the desk opens on its first fully painted frame. Applied only with a part B.
 */
const CUT_CLICK_LEAD = 6;
const SHOT4_FRAMES = sec(6);
export const withCutClick = (a: DesktopSegment[]): DesktopSegment[] =>
  a.map((s) => (s.shot === "4-menu" ? { ...s, edit: { addClicks: [{ frame: SHOT4_FRAMES - CUT_CLICK_LEAD }] } } : s));

/** The desk captures' measured frames (project.partB.cuts); part B is empty without them. */
const CUTS = project.partB?.cuts;

/**
 * B1-B5, inserted at the cut point (same window, same 1440x900 DSF 2 captures). Capture frames are each capture's
 * cursor.json frames. Every cut is a jump-cut on a click's navigation, to the new page's first fully painted frame:
 * no blank frame, skeleton loader or dialog-close flash is ever shown. Where a capture holds a loading state in its
 * middle (8: the skeleton after Start A Sale; 10: the dialog closing after the hold), it is split into two segments
 * and the loading frames are cut out. Camera rule at a cut: the camera on the first frame shown equals the camera on
 * the last frame before it (zoomShift moves a move that fell inside a trimmed head or cut gap to start on the cut).
 */
const deskSegments = (C: NonNullable<typeof CUTS>): DesktopSegment[] => [
  // B1 · the Admin click (ring, bounce, tink on the menu, 6 frames before the cut) runs on into the painted sign-in
  // card; open_ui on the cut. The camera opens on shot 4's 1.8x and starts its pull back to SIGN_IN on the cut frame.
  // Then email (privacy-blurred), password, Sign In.
  {
    ...deskSegment("6-desk-signin", 4.1667, {
      headSec: C.signinPainted / theme.fps,
      zoomFocus: { 1: SIGN_IN },
      zoomShift: { 0: { outAtSec: C.signinPainted / theme.fps } },
      cues: [{ frame: 1, file: S.open.file, db: S.open.db }],
    }),
    edit: { moveEvents: [{ type: "click", index: 0, frame: C.signinPainted - CUT_CLICK_LEAD }] },
  },
  // B2 · first sign-in: name, the pen draws Maria's signature (1.8x on the pad, a felt-tip under each stroke), Save →
  // "You Are All Set" (ios_success as the done step appears, 4 frames after the Save click); the camera pulls all the
  // way out with the pad zoom (both leave at frame 182), so Start Working is clicked at 1.0 and Handle A Sale opens
  // at 1.0 (its sidebar and header in frame from the first frame)
  deskSegment("7-desk-onboard", 8.1667, {
    zoomFocus: { 0: SIGN_IN },
    zoomShift: { 0: { outAtSec: 182 / theme.fps } },
    // clicks: first name, last name, Next, Save Signature (index 3), Start Working (the pen is a draw, not a click)
    eventCues: [
      { type: "click", index: 3, file: S.success.file, db: S.success.db, offsetSec: 0.13 },
      { type: "draw", index: 0, perStroke: true, file: S.pen.file, db: S.pen.db, fadeSec: S.pen.fadeSec },
    ],
  }),
  // B3 · Handle A Sale (wide) → Start A Sale; the skeleton loader (capture frames 42-54) is cut out: 8a ends 3 frames
  // after the click, 8b opens on the painted "Which Car Is It?" with the click's ring running on and the WIZARD zoom
  // starting on the cut (its whoosh with it) → the Camry
  deskSegment("8-desk-sale-start", C.saleSkeleton[0] / theme.fps, { headSec: 12 / theme.fps, zoomFocus: { 0: { point: [720, 450], depth: 1 } } }),
  {
    ...deskSegment("8-desk-sale-start", 3.6667, {
      headSec: C.saleSkeleton[1] / theme.fps,
      zoomFocus: { 0: { point: [720, 450], depth: 1 }, 1: WIZARD },
      zoomShift: { 1: { startSec: 12 / theme.fps } },
    }),
    edit: { moveEvents: [{ type: "click", index: 0, frame: C.saleSkeleton[1] - 3 }] },
  },
  deskSegment("9-desk-buyer", 3.2, { headSec: 0.167, zoomFocus: { 0: WIZARD } }),
  // the read-back and Hold To Confirm: a tink at the press and a soft rise under the fill; 10a ends 0.4 s into the
  // 100% "Release To Confirm" (the release drawn on its second-last frame, its tink with it; 10b starts one frame further into the release), 10b opens on the painted
  // "How Are They Paying?" (the dialog's close and the blank frames, capture 108-133, are cut out) and pulls back from
  // READ_BACK to WIZARD from the cut → Cash. The pointer presses 45 px right of the label's centre, so the hand never
  // covers "Release To Confirm" (nudge: eased in on the approach, out on the way to Cash).
  {
    ...deskSegment("10-desk-readback", C.readbackRelease[0] / theme.fps, {
      headSec: 0.233,
      zoomFocus: { 0: WIZARD, 1: READ_BACK },
      eventCues: [
        { type: "hold", index: 0, file: S.click.file, db: S.click.db, offsetSec: -S.click.leadSec },
        { type: "hold", index: 0, file: S.holdRise.file, db: S.holdRise.db },
        { type: "hold", index: 0, at: "end", file: S.tap.file, db: S.tap.db, offsetSec: -S.tap.leadSec },
      ],
    }),
    edit: { nudge: HOLD_NUDGE, moveEvents: [{ type: "hold", index: 0, endFrame: C.readbackRelease[0] - 2 }] },
  },
  {
    ...deskSegment("10-desk-readback", 5.8, {
      headSec: C.readbackRelease[1] / theme.fps,
      zoomFocus: { 0: WIZARD, 1: READ_BACK },
      zoomShift: { 1: { outAtSec: C.readbackRelease[1] / theme.fps } },
    }),
    edit: { nudge: HOLD_NUDGE, moveEvents: [{ type: "hold", index: 0, endFrame: C.readbackRelease[1] - 1 }] },
  },
  // B4 · the guided sale: We Do → No plate yet → The Buyer, Here Today
  deskSegment("11-desk-guide", 3.5667, { headSec: 0.233, zoomFocus: { 0: WIZARD } }),
  // B5 · the packet of the sale completed off camera: the push onto "Ready To Print · 2 / 2 signed" (ios_success as it
  // lands); PACKET is held (no pull-out) since it already frames the Form 130-U row and its Open / Print button, which
  // is clicked: the cut to B6
  deskSegment("12-desk-signed", 3.3667, {
    headSec: 0.267,
    zoomShift: { 0: { outSec: 0.267 }, 1: { startSec: 0.267, outAtSec: null } },
    zoomFocus: { 0: WIZARD, 1: PACKET },
    eventCues: [{ type: "zoom", index: 1, at: "end", file: S.success.file, db: S.success.db, offsetSec: -0.2 }],
  }),
];

export const partBSegments: DesktopSegment[] = CUTS ? deskSegments(CUTS) : [];

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

/**
 * B6's push whoosh, in frames of the window's DesktopScene (which plays it, so its variant continues the rotation over
 * the whooshes heard): placed so its peak lands just before the push's fastest frame. Empty without a part B.
 */
export const docWhooshAfter = (T: Timeline): { frame: number }[] => {
  if (!T.doc.durationInFrames) return [];
  const S = theme.sfx;
  const R = theme.recordly;
  // the zoom-in ease's fastest frame (Sfx.peakVelocityFrame, inlined: timeline.ts stays free of components)
  const inF = sec(R.zoomInSec);
  let peak = 0;
  let best = -1;
  for (let i = 0; i < inF; i++) {
    const v = R.zoomInEase((i + 1) / inF) - R.zoomInEase(i / inF);
    if (v > best) [best, peak] = [v, i];
  }
  return [{ frame: T.doc.from - T.desktopA.from + sec(theme.doc.push.atSec) + peak - sec(S.zoomIn.peakSec) - sec(S.zoomIn.leadSec) }];
};
