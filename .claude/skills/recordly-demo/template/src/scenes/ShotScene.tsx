// A single desktop shot: backdrop (wallpaper, grade, vignette) → macOS window (springs in) with the zooming capture
// inside → cursor → SFX → a whisper of grain. Put scene-specific titles in `children` (above the window).
// For a film of several captures in one window use DesktopScene; this is the one-capture preview.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { shotFile, useShotData, useTracks } from "../lib/shot";
import { Backdrop } from "../components/Wallpaper";
import { MacWindow, windowLayout } from "../components/MacWindow";
import { CameraView, cameraAt } from "../components/Camera";
import { Cursor } from "../components/Cursor";
import { Cue, Sfx, shotCues } from "../components/Sfx";
import { Finish } from "../components/Overlays";
import { windowPose } from "./DesktopScene";

export type ShotSceneProps = {
  shot: string;
  url: string;
  /** seconds of the capture skipped at the start of this scene */
  trimSec?: number;
  /** window springs in (first desktop scene) */
  enter?: boolean;
  /** window leaves over the last exitSec */
  exit?: boolean;
  exitSec?: number;
  /** derive click / typing / zoom sounds from the capture */
  autoSfx?: boolean;
  cues?: Cue[];
  lights?: "mono" | "color";
  children?: React.ReactNode;
};

export const ShotScene: React.FC<ShotSceneProps> = ({ shot, url, trimSec = 0, enter = false, exit = false, exitSec = 0.33, autoSfx = true, cues = [], lights, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const data = useShotData(shot);
  const tracks = useTracks(data);
  if (!data || !tracks) return <AbsoluteFill style={{ background: theme.colors.bg }} />;

  const trimFrames = Math.round(trimSec * fps);
  const L = windowLayout(data.viewport.width, data.viewport.height, width, height);
  const box = { left: L.contentLeft, top: L.contentTop, width: L.contentW, height: L.contentH };
  const exitFrames = Math.max(1, toFrames(exitSec, fps));
  const x = exit ? interpolate(frame, [durationInFrames - exitFrames, durationInFrames], [0, 1], { easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const cam = cameraAt(data, tracks, frame + trimFrames, L.contentW, L.contentH);
  const pose = windowPose(frame, fps, { enter, camScale: cam.s });
  const allCues = [...(autoSfx ? shotCues(data, { trimFrames, durationInFrames }) : []), ...cues];

  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill
        style={{
          opacity: pose.opacity * (1 - x),
          transformOrigin: `${L.left + L.contentW / 2}px ${L.top + (L.contentH + L.T) / 2}px`,
          transform: `translateY(${pose.ty - x * 20}px) scale(${pose.scale * (1 - 0.04 * x)})`,
        }}
      >
        <MacWindow width={L.contentW} height={L.contentH} url={url} lights={lights} style={{ left: L.left, top: L.top }}>
          <CameraView data={data} tracks={tracks} src={shotFile(shot)} trimFrames={trimFrames} width={L.contentW} height={L.contentH} />
        </MacWindow>
        <Cursor data={data} tracks={tracks} trimFrames={trimFrames} box={box} />
      </AbsoluteFill>
      {children}
      <Sfx cues={allCues} />
      <Finish />
    </AbsoluteFill>
  );
};
