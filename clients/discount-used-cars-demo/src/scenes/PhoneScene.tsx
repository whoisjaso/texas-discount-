// The phone cut: whatever is behind (e.g. the desktop window) recedes and blurs while an iPhone slides in
// holding the phone capture, with tap ripples instead of a cursor.
import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { shotFile, useShotData } from "../lib/shot";
import { Wallpaper } from "../components/Wallpaper";
import { IPhone, iphoneLayout } from "../components/IPhone";
import { TapRipple } from "../components/TapRipple";
import { Cue, Sfx, shotCues } from "../components/Sfx";
import { Finish } from "../components/Overlays";

export type PhoneSceneProps = {
  shot: string;
  trimSec?: number;
  /** phone height in frame px */
  phoneHeight?: number;
  /** horizontal centre of the phone, 0–1 of the frame width */
  centerX?: number;
  /** drawn behind the phone, receding (scale down, blur, dim) as the phone arrives */
  behind?: React.ReactNode;
  exit?: boolean;
  /** no wallpaper / grain (the film draws them once, globally) */
  bare?: boolean;
  autoSfx?: boolean;
  cues?: Cue[];
  children?: React.ReactNode;
};

export const PhoneScene: React.FC<PhoneSceneProps> = ({ shot, trimSec = 0, phoneHeight = 960, centerX = 0.5, behind, exit = false, bare = false, autoSfx = true, cues = [], children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const data = useShotData(shot);
  if (!data) return bare ? null : <AbsoluteFill style={{ background: theme.colors.bg }} />;
  const trimFrames = Math.round(trimSec * fps);
  const P = iphoneLayout(phoneHeight);
  const k = P.pageWidth / data.viewport.width;
  const e = spring({ frame, fps, config: theme.spring.window });
  const x = exit ? interpolate(frame, [durationInFrames - 10, durationInFrames], [0, 1], { easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const float = Math.sin(frame / 30) * 4; // idle breathing
  const allCues = [...(autoSfx ? shotCues(data, { trimFrames, durationInFrames }) : []), ...cues];
  return (
    <AbsoluteFill>
      {!bare && <Wallpaper />}
      {behind && (
        <AbsoluteFill style={{ transform: `scale(${(1 - 0.1 * e) * (1 - 0.03 * x)})`, filter: `blur(${(e * 10 + x * 6).toFixed(2)}px)`, opacity: (1 - 0.5 * e) * (1 - x) }}>{behind}</AbsoluteFill>
      )}
      <IPhone
        k={P.k}
        style={{
          left: width * centerX - P.width / 2,
          top: (height - P.height) / 2 + float,
          opacity: Math.min(1, e * 1.3) * (1 - x),
          transform: `translateX(${interpolate(e, [0, 1], [width * 0.45, 0]) + x * 60}px) rotate(${interpolate(e, [0, 1], [7, 0])}deg) scale(${interpolate(e, [0, 1], [0.92, 1]) * (1 - 0.04 * x)})`,
        }}
      >
        <div style={{ position: "relative", width: P.pageWidth, height: P.pageHeight }}>
          <OffthreadVideo src={shotFile(shot)} trimBefore={trimFrames} muted style={{ width: P.pageWidth, height: P.pageHeight, objectFit: "cover", objectPosition: "top", display: "block" }} />
          <TapRipple data={data} trimFrames={trimFrames} k={k} />
        </div>
      </IPhone>
      {children}
      <Sfx cues={allCues} />
      {!bare && <Finish />}
    </AbsoluteFill>
  );
};
