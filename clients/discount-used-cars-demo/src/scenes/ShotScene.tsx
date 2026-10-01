// A desktop shot: wallpaper → macOS window (springs in) with the zooming capture inside → cursor → SFX →
// grain + vignette. Put scene-specific titles in `children` (drawn above the window, below the grain).
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { shotFile, useShotData, useTracks } from "../lib/shot";
import { Wallpaper } from "../components/Wallpaper";
import { MacWindow, windowLayout } from "../components/MacWindow";
import { CameraView, cameraAt } from "../components/Camera";
import { Cursor } from "../components/Cursor";
import { Cue, Sfx, shotCues } from "../components/Sfx";
import { Finish } from "../components/Overlays";

export type ShotSceneProps = {
  shot: string;
  url: string;
  /** seconds of the capture skipped at the start of this scene */
  trimSec?: number;
  /** window springs in (first desktop scene) */
  enter?: boolean;
  /** window leaves over the last 10 frames */
  exit?: boolean;
  /** derive click / typing / zoom sounds from the capture */
  autoSfx?: boolean;
  cues?: Cue[];
  lights?: "mono" | "color";
  children?: React.ReactNode;
};

export const ShotScene: React.FC<ShotSceneProps> = ({ shot, url, trimSec = 0, enter = false, exit = false, autoSfx = true, cues = [], lights, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const data = useShotData(shot);
  const tracks = useTracks(data);
  if (!data || !tracks) return <AbsoluteFill style={{ background: theme.colors.bg }} />;

  const trimFrames = Math.round(trimSec * fps);
  const L = windowLayout(data.viewport.width, data.viewport.height, width, height);
  const box = { left: L.contentLeft, top: L.contentTop, width: L.contentW, height: L.contentH };
  const e = enter ? spring({ frame, fps, config: theme.spring.window }) : 1;
  const x = exit ? interpolate(frame, [durationInFrames - 10, durationInFrames], [0, 1], { easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const cam = cameraAt(data, tracks, frame + trimFrames, L.contentW, L.contentH);
  const push = 1 + Math.min(1, (cam.s - 1) / (theme.recordly.defaultDepth - 1)) * theme.window.pushScale;
  const scale = interpolate(e, [0, 1], [0.94, 1]) * push * (1 - 0.04 * x);
  const allCues = [...(autoSfx ? shotCues(data, { trimFrames, durationInFrames }) : []), ...cues];

  return (
    <AbsoluteFill>
      <Wallpaper />
      <AbsoluteFill
        style={{
          opacity: Math.min(1, e * 1.2) * (1 - x),
          transformOrigin: `${L.left + L.contentW / 2}px ${L.top + (L.contentH + L.T) / 2}px`,
          transform: `translateY(${interpolate(e, [0, 1], [30, 0]) - x * 20}px) scale(${scale})`,
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
