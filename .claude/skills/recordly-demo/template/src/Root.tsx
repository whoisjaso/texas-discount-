import React from "react";
import { AbsoluteFill, CalculateMetadataFunction, Composition, useCurrentFrame, useVideoConfig } from "remotion";
import "./lib/fonts";
import { theme, toFrames } from "./theme";
import { project } from "./project";
import { loadShot } from "./lib/shot";
import { Backdrop } from "./components/Wallpaper";
import { LogoSting } from "./components/LogoSting";
import { MatchSting, Rect } from "./components/MatchSting";
import { Sfx } from "./components/Sfx";
import { FadeOut, Finish } from "./components/Overlays";
import { ShotScene, ShotSceneProps } from "./scenes/ShotScene";
import { PhoneScene, PhoneSceneProps } from "./scenes/PhoneScene";
import { Demo, demoTimeline } from "./Demo";

const { fps, width, height } = theme;
const L = project.loader;

/** Intro on its own: the sting in the loader's layout (in the film it hands off to the loader in the window). */
export const Intro: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <MatchSting
      mark={project.mark}
      word={project.word}
      loader={{ stage: L.stage as Rect, mark: L.mark as Rect, word: L.word as Rect, wordFont: L.wordFont }}
      scale={project.stingMarkWidth / L.mark[2]}
    />
    <Sfx cues={[{ frame: 1, file: theme.sfx.intro.file, db: theme.sfx.intro.db }]} />
    <Finish />
  </AbsoluteFill>
);

/** Outro: full-colour logo on dark, then the web address, contact and hours lines (ios_received); fade to black. */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const F = toFrames(theme.outro.fadeSec, fps);
  return (
    <AbsoluteFill>
      <Backdrop />
      <LogoSting
        logo={project.logoReverse}
        logoWidth={theme.outro.logoWidth}
        lines={[...project.outroLines]}
        lineSizes={theme.outro.lineSizes}
        linesDelaySec={theme.outro.linesDelaySec}
        lineStaggerSec={theme.outro.lineStaggerSec}
        pushTo={theme.outro.pushTo}
        exitAt={durationInFrames - F}
        exitSec={theme.outro.exitSec}
      />
      <Sfx cues={[{ frame: toFrames(theme.outro.linesDelaySec - theme.sfx.click.leadSec, fps), file: theme.sfx.outro.file, db: theme.sfx.outro.db }]} />
      <Finish />
      <FadeOut progress={(frame - (durationInFrames - F)) / F} />
    </AbsoluteFill>
  );
};

const shotLength: CalculateMetadataFunction<ShotSceneProps> = async ({ props }) => {
  const d = await loadShot(props.shot);
  return { durationInFrames: Math.max(1, d.frameCount - Math.round((props.trimSec ?? 0) * fps)) };
};
const phoneLength: CalculateMetadataFunction<PhoneSceneProps> = async ({ props }) => {
  const d = await loadShot(props.shot);
  return { durationInFrames: Math.max(1, d.frameCount - Math.round((props.trimSec ?? 0) * fps)) };
};

export const Root: React.FC = () => (
  <>
    {/* The film (part A; part B slots in at demoTimeline.cutPoint, see src/demo/timeline.ts) */}
    <Composition id="Demo" component={Demo} durationInFrames={demoTimeline.total} fps={fps} width={width} height={height} />
    <Composition id="Intro" component={Intro} durationInFrames={toFrames(2, fps)} fps={fps} width={width} height={height} />
    <Composition id="Outro" component={Outro} durationInFrames={toFrames(3.8, fps)} fps={fps} width={width} height={height} />
    {/* Any capture in public/shots/<id>/ in the window: --props='{"shot":"<id>","url":"<domain>"}' */}
    <Composition
      id="ShotPreview"
      component={ShotScene}
      durationInFrames={120}
      fps={fps}
      width={width}
      height={height}
      defaultProps={{ shot: project.sampleShot, url: project.domain, trimSec: 0, enter: true } as ShotSceneProps}
      calculateMetadata={shotLength}
    />
    <Composition
      id="PhonePreview"
      component={PhoneScene}
      durationInFrames={120}
      fps={fps}
      width={width}
      height={height}
      defaultProps={{ shot: project.samplePhoneShot, trimSec: 0 } as PhoneSceneProps}
      calculateMetadata={phoneLength}
    />
  </>
);
