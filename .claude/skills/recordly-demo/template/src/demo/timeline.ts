// The film's running order, in frames derived from fps. Fill in the segments from storyboard.json:
//
//   Intro sting ⇢ [window] desktop segments (hard, pixel-matched cuts) → ‖ CUT POINT ‖ part B → [iPhone] → Outro
//
// With project.loader set, the window starts when the sting begins its hand-off and the first desktop segment must
// start (trimSec) so that the sting lands one frame after the loader is at rest. Without a loader the sting exits
// (theme.sting.exitSec) and the window springs in on its last exit frame.
import { theme } from "../theme";
import { project } from "../project";
import { DesktopSegment, desktopLength } from "../scenes/DesktopScene";

const sec = (s: number) => Math.round(s * theme.fps);

/** Trim for the first desktop capture when it opens on the site's loader (match cut). */
export const loaderTrimSec = project.loader ? (sec(project.loader.wordDoneSec) - sec(theme.sting.handoffSec) + 1) / theme.fps : 0;

/** e.g. { shot: "1-hero", trimSec: loaderTrimSec, durationInFrames: sec(7.6) - sec(loaderTrimSec) }, … */
export const partASegments: DesktopSegment[] = [];
/** inserted at the cut point (same window); give them `url` once the client confirms the host may be shown */
export const partBSegments: DesktopSegment[] = [];
/** the phone capture (public/shots/<id>), or null for no phone cut */
export const phoneShot: string | null = null;
export const phoneSec = 9;
export const outroSec = 3.8;

export const buildTimeline = (partB: DesktopSegment[] = partBSegments) => {
  const handoffAt = project.loader ? sec(theme.sting.handoffAtSec) : sec(theme.sting.handoffAtSec + 0.4);
  const landAt = project.loader ? handoffAt + sec(theme.sting.handoffSec) : handoffAt;
  const exitFrames = sec(project.loader ? theme.sting.fadeSec : theme.sting.exitSec);
  const intro = { from: 0, handoffAt, landAt, fadeFrames: exitFrames, durationInFrames: landAt + exitFrames + 1 };
  // match cut: the window starts with the hand-off; plain sting: on the sting's last exit frame
  const desktopA = { from: project.loader ? handoffAt : handoffAt + exitFrames - 1, durationInFrames: desktopLength(partASegments) };
  const cutPoint = desktopA.from + desktopA.durationInFrames;
  const desktopB = { from: cutPoint, durationInFrames: desktopLength(partB) };
  const phone = { from: desktopB.from + desktopB.durationInFrames, durationInFrames: phoneShot ? sec(phoneSec) : 0 };
  // the outro's logo starts under the phone as it drops away (the outro is drawn beneath the phone scene)
  const outro = { from: Math.max(0, phone.from + phone.durationInFrames - (phoneShot ? sec(0.2) : 0)), durationInFrames: sec(outroSec) };
  const total = outro.from + outro.durationInFrames;
  return { intro, desktopA, cutPoint, desktopB, phone, outro, total };
};

export type Timeline = ReturnType<typeof buildTimeline>;
