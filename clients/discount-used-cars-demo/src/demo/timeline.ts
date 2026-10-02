// The film's running order (storyboard.json, part A), in frames derived from fps.
//
//   Intro sting ⇢ (match cut onto the site's loader) [window] 1-hero → 2-scroll → 3-buy → 4-menu → ‖ CUT POINT ‖
//   → [iPhone] 5-phone → Outro
//
// Part B (the sale desk) goes in at the cut point: give `partBSegments` its segments (same 1440x900 window, DSF 2,
// opening on the Admin click) and everything after the cut moves back by its length. Nothing overlaps the cut:
// shot 4 is shown whole, held at 1.8x on the Admin row, and the phone scene starts fresh on the next frame.
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

/** Part B (sale desk) segments, inserted at the cut point. Empty in part A. Give them `url` once the owner confirms
 *  the desk host may be shown (project.partBDomain); until then the pill keeps the public domain. */
export const partBSegments: DesktopSegment[] = [];

export const buildTimeline = (partB: DesktopSegment[] = partBSegments) => {
  // the sting holds until handoffAt, then shrinks onto the loader inside the springing window (landAt) and dissolves
  // into it over fadeFrames; the loader underneath is identical, so there is one logo on screen at every frame
  const handoffAt = sec(theme.sting.handoffAtSec);
  const landAt = handoffAt + sec(theme.sting.handoffSec);
  const intro = { from: 0, handoffAt, landAt, fadeFrames: sec(theme.sting.fadeSec), durationInFrames: landAt + sec(theme.sting.fadeSec) + 1 };
  const desktopA = { from: handoffAt, durationInFrames: desktopLength(partASegments) };
  const cutPoint = desktopA.from + desktopA.durationInFrames;
  const desktopB = { from: cutPoint, durationInFrames: desktopLength(partB) };
  const phone = { from: desktopB.from + desktopB.durationInFrames, durationInFrames: sec(9) };
  // the outro's logo starts under the phone as it drops away (the outro is drawn beneath the phone scene)
  const outro = { from: phone.from + phone.durationInFrames - sec(0.2), durationInFrames: sec(3.8) };
  const total = outro.from + outro.durationInFrames;
  return { intro, desktopA, cutPoint, desktopB, phone, outro, total };
};

export type Timeline = ReturnType<typeof buildTimeline>;
