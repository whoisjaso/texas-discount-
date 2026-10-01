// The film's running order (storyboard.json, part A), in frames derived from fps.
//
//   Intro → [window] 1-hero → 2-scroll → 3-buy → 4-menu → ‖ CUT POINT ‖ → [iPhone] 5-phone → Outro
//
// Part B (the sale desk) goes in at the cut point: give `partB` its segments (same 1440x900 window, DSF 2,
// opening on the Admin click) and everything after the cut moves back by its length. Nothing overlaps the cut:
// shot 4 is shown whole, held at 1.8x on the Admin row, and the phone scene starts fresh on the next frame.
import { theme } from "../theme";
import { DesktopSegment, desktopLength } from "../scenes/DesktopScene";

const sec = (s: number) => Math.round(s * theme.fps);

const S = theme.sfx;

/** Shots 1–4 share one window. Lengths and trims from storyboard.json (scene.trimSec / scene.durationSec). */
export const partASegments: DesktopSegment[] = [
  { shot: "1-hero", trimSec: 0.8, durationInFrames: sec(8.2) },
  // Trucks card (572 px tall) under 1.8x (a 500 px view): aim at y 360 so both frame edges fall in the photo
  // (the gap above the card, the floor below the truck) instead of through the "Ask About Availability" pill.
  { shot: "2-scroll", durationInFrames: sec(16), zoomFocus: { 0: { point: [418.5, 360] } } },
  // "We Buy Trucks": at the captured 1.5x the view is clamped at the page bottom (y 300–900) and its top edge
  // slices the "Go To We Buy Cars" link (x 132–285, y 286–308); no 1.5x framing both clears the link and fits the
  // three tiles (x 242–1198). 1.55x, bottom-clamped (x 255–1185, y 319–900): link out, all tile labels and arrows
  // in with ~23 px to spare, only ~13 px of photo trimmed off the outer tiles.
  { shot: "3-buy", durationInFrames: sec(7.6), zoomFocus: { 0: { point: [720, 612], depth: 1.55 } } },
  // the drawer opens on the first click: open_ui on top of the click's tink
  { shot: "4-menu", durationInFrames: sec(6), eventCues: [{ type: "click", index: 0, file: S.open.file, db: S.open.db, offsetFrames: 1 }] },
];

/** Part B (sale desk) segments, inserted at the cut point. Empty in part A. */
export const partBSegments: DesktopSegment[] = [];

export const buildTimeline = (partB: DesktopSegment[] = partBSegments) => {
  // the sting leaves fast (blur + fade) from 2.55 s; the window's spring starts on the sting's last exit frame
  // (where the window is still at 0 opacity), so there is no empty frame between them and no overlap. Overlapping
  // them more doubled the logo: the site's own loader shows the same mark and DISCOUNT at nearly the same spot.
  const intro = { from: 0, durationInFrames: sec(3), exitAt: sec(2.55), exitFrames: Math.round(0.3 * theme.fps) };
  const desktopA = { from: intro.exitAt + intro.exitFrames - 1, durationInFrames: desktopLength(partASegments) };
  const cutPoint = desktopA.from + desktopA.durationInFrames;
  const desktopB = { from: cutPoint, durationInFrames: desktopLength(partB) };
  const phone = { from: desktopB.from + desktopB.durationInFrames, durationInFrames: sec(9) };
  // the outro's logo starts while the phone leaves (its exit is the last 10 frames)
  const outro = { from: phone.from + phone.durationInFrames - sec(0.2), durationInFrames: sec(4) };
  const total = outro.from + outro.durationInFrames;
  return { intro, desktopA, cutPoint, desktopB, phone, outro, total };
};

export type Timeline = ReturnType<typeof buildTimeline>;
