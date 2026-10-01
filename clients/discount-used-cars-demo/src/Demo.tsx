// The film: Intro → macOS window (shots 1–4, one window, blur crossfades) → CUT POINT (part B) → iPhone
// (shot 5, the desktop recedes behind it) → Outro. Five layers: one continuous wallpaper at the bottom, the
// scenes, then grade, grain and vignette once on top. Sound: the scenes' auto cues (clicks, keys, zoom
// whooshes) plus the manual cues of storyboard.json's sound map.
import React from "react";
import { AbsoluteFill, Freeze, Sequence, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { project } from "./project";
import { Wallpaper } from "./components/Wallpaper";
import { LogoSting } from "./components/LogoSting";
import { Cue, Sfx } from "./components/Sfx";
import { Finish } from "./components/Overlays";
import { DesktopScene, DesktopSegment } from "./scenes/DesktopScene";
import { PhoneScene } from "./scenes/PhoneScene";
import { buildTimeline, partASegments, partBSegments } from "./demo/timeline";

export const demoTimeline = buildTimeline(partBSegments);

/** The desktop as it stands on its last frame, for the phone scene to push back and blur. */
const DesktopHeld: React.FC<{ segments: DesktopSegment[]; frame: number }> = ({ segments, frame }) => (
  <Freeze frame={frame}>
    <DesktopScene segments={segments} url={project.domain} bare autoSfx={false} />
  </Freeze>
);

export const Demo: React.FC = () => {
  const { fps } = useVideoConfig();
  const T = demoTimeline;
  const S = theme.sfx;
  const hasB = partBSegments.length > 0;
  const lastDesktop = hasB ? { segments: partBSegments, frame: T.desktopB.durationInFrames - 1 } : { segments: partASegments, frame: T.desktopA.durationInFrames - 1 };

  // storyboard.json → sfx.manual (frames are film frames; SFX lead the visual by 2 frames)
  const cues: Cue[] = [
    { frame: T.intro.from + 1, file: S.intro.file, db: S.intro.db }, // ios_note: the mark draws in
    { frame: T.desktopA.from - 2, file: S.open.file, db: S.open.db }, // open_ui: the window springs in
    { frame: T.phone.from - 2, file: S.open.file, db: S.open.db - 2 }, // open_ui −16 dB: the phone slides in
    { frame: T.outro.from + Math.round(0.6 * fps), file: S.outro.file, db: S.outro.db }, // ios_received: outro lines
  ];

  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Wallpaper />

      {/* 0 · Intro: the red mark draws in, DISCOUNT staggers in under it, fast exit */}
      <Sequence from={T.intro.from} durationInFrames={T.intro.durationInFrames} name="0 Intro">
        <LogoSting mark={project.mark} markWidth={project.markWidth} word={project.word} exitAt={Math.round(2.55 * fps)} />
      </Sequence>

      {/* 1–4 · one macOS window: hero → scroll → we buy → menu (ends held on the Admin row) */}
      <Sequence from={T.desktopA.from} durationInFrames={T.desktopA.durationInFrames} name="1-4 Desktop">
        <DesktopScene segments={partASegments} url={project.domain} enter bare />
      </Sequence>

      {/* ‖ CUT POINT ‖ part B (sale desk) slots in here, in the same window */}
      {hasB && (
        <Sequence from={T.desktopB.from} durationInFrames={T.desktopB.durationInFrames} name="Part B Desk">
          <DesktopScene segments={partBSegments} url={project.domain} bare />
        </Sequence>
      )}

      {/* 5 · iPhone: the desktop recedes and blurs while the phone slides in */}
      <Sequence from={T.phone.from} durationInFrames={T.phone.durationInFrames} name="5 Phone">
        <PhoneScene shot="5-phone" bare exit behind={<DesktopHeld segments={lastDesktop.segments} frame={lastDesktop.frame} />} />
      </Sequence>

      {/* 6 · Outro: full-colour logo, then the web address and contact line */}
      <Sequence from={T.outro.from} durationInFrames={T.outro.durationInFrames} name="6 Outro">
        <LogoSting logo={project.logoReverse} logoWidth={project.logoWidth} lines={project.outroLines} linesDelay={20} />
      </Sequence>

      <Sfx cues={cues} />
      <Finish />
    </AbsoluteFill>
  );
};
