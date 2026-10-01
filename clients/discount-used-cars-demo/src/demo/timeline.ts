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
  // "We Buy Trucks" under 1.5x: the captured focus is clamped at the page bottom (view 300–900), whose top edge
  // slices the "Go To We Buy Cars" link; view 275–875 keeps the link whole and the three tiles still fit the width.
  { shot: "3-buy", durationInFrames: sec(7.6), zoomFocus: { 0: { point: [720, 575] } } },
  // the drawer opens on the first click: open_ui on top of the click's tink
  { shot: "4-menu", durationInFrames: sec(6), eventCues: [{ type: "click", index: 0, file: S.open.file, db: S.open.db, offsetFrames: 1 }] },
];

/** Part B (sale desk) segments, inserted at the cut point. Empty in part A. */
export const partBSegments: DesktopSegment[] = [];

export const buildTimeline = (partB: DesktopSegment[] = partBSegments) => {
  const intro = { from: 0, durationInFrames: sec(3) };
  // the window starts rising while the intro sting blurs out
  const desktopA = { from: intro.durationInFrames - sec(0.2), durationInFrames: desktopLength(partASegments) };
  const cutPoint = desktopA.from + desktopA.durationInFrames;
  const desktopB = { from: cutPoint, durationInFrames: desktopLength(partB) };
  const phone = { from: desktopB.from + desktopB.durationInFrames, durationInFrames: sec(9) };
  // the outro's logo starts while the phone leaves (its exit is the last 10 frames)
  const outro = { from: phone.from + phone.durationInFrames - sec(0.2), durationInFrames: sec(4) };
  const total = outro.from + outro.durationInFrames;
  return { intro, desktopA, cutPoint, desktopB, phone, outro, total };
};

export type Timeline = ReturnType<typeof buildTimeline>;
