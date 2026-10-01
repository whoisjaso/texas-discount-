import React from "react";
import { AbsoluteFill, CalculateMetadataFunction, Composition } from "remotion";
import "./lib/fonts";
import { theme } from "./theme";
import { project } from "./project";
import { loadShot } from "./lib/shot";
import { Wallpaper } from "./components/Wallpaper";
import { LogoSting } from "./components/LogoSting";
import { Sfx } from "./components/Sfx";
import { Finish } from "./components/Overlays";
import { ShotScene, ShotSceneProps } from "./scenes/ShotScene";
import { PhoneScene, PhoneSceneProps } from "./scenes/PhoneScene";

const { fps, width, height } = theme;

/** Intro: dark wallpaper, the mark draws in, the word staggers in beneath it (ios_note), fast exit. */
export const Intro: React.FC = () => (
  <AbsoluteFill>
    <Wallpaper />
    <LogoSting mark={project.mark} markWidth={project.markWidth} word={project.word} exitAt={Math.round(2.55 * fps)} />
    <Sfx cues={[{ frame: 1, file: theme.sfx.intro.file, db: theme.sfx.intro.db }]} />
    <Finish />
  </AbsoluteFill>
);

/** Outro: full-colour logo on dark, then the web address and contact line (ios_received). */
export const Outro: React.FC = () => (
  <AbsoluteFill>
    <Wallpaper />
    <LogoSting logo={project.logoReverse} logoWidth={project.logoWidth} lines={project.outroLines} linesDelay={20} />
    <Sfx cues={[{ frame: 18, file: theme.sfx.outro.file, db: theme.sfx.outro.db }]} />
    <Finish />
  </AbsoluteFill>
);

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
    <Composition id="Intro" component={Intro} durationInFrames={3 * fps} fps={fps} width={width} height={height} />
    <Composition id="Outro" component={Outro} durationInFrames={4 * fps} fps={fps} width={width} height={height} />
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
