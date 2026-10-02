// The phone cut: whatever is behind (e.g. the desktop window) recedes and blurs while an iPhone slides in holding the
// phone capture, with touch indicators instead of a cursor. The phone is opaque within two frames (the desktop never
// shows through it), enters with a spring slide + scale + tilt and a motion blur that follows its speed, and leaves the
// same way it came: it drops out of frame, accelerating, blurred by its speed.
import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { shotFile, useShotData } from "../lib/shot";
import { Backdrop } from "../components/Wallpaper";
import { IPhone, iphoneLayout } from "../components/IPhone";
import { TapRipple } from "../components/TapRipple";
import { Cue, Sfx, shotCues } from "../components/Sfx";
import { Finish } from "../components/Overlays";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Entrance (e, spring 0 → 1) and exit (x, 0 → 1 over the last exitSec) progress of the phone at a scene frame. */
export const phoneProgress = (frame: number, fps: number, durationInFrames: number, exit: boolean) => {
  const e = spring({ frame, fps, config: theme.spring.window });
  const exitFrames = Math.max(1, toFrames(theme.phone.exitSec, fps));
  const x = exit ? interpolate(frame, [durationInFrames - exitFrames, durationInFrames - 1], [0, 1], { easing: theme.ease.in, ...CLAMP }) : 0;
  return { e, x };
};

/**
 * How whatever is behind the phone recedes: it scales down, blurs and dims as the phone arrives, and fades as the phone
 * leaves. Exported so a film can keep its own desktop instance running under the phone (no remount at the cut)
 * instead of passing `behind`.
 */
export const phoneBehindStyle = (frame: number, fps: number, durationInFrames: number, exit: boolean): React.CSSProperties => {
  const { e, x } = phoneProgress(frame, fps, durationInFrames, exit);
  return {
    transform: `scale(${(1 - 0.1 * e) * (1 - 0.03 * x)})`,
    filter: `blur(${Math.max(0, e * 10 + x * 6).toFixed(2)}px)`,
    opacity: Math.max(0, (1 - 0.5 * Math.min(1, e)) * (1 - x)),
  };
};

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
  const P = theme.phone;
  const trimFrames = Math.round(trimSec * fps);
  const L = iphoneLayout(phoneHeight);
  const k = L.pageWidth / data.viewport.width;

  // entrance: spring slide from the right + scale + tilt; exit: an accelerating drop with a little counter-tilt
  const pose = (f: number) => {
    const { e, x } = phoneProgress(f, fps, durationInFrames, exit);
    return {
      e,
      x,
      tx: interpolate(e, [0, 1], [width * 0.45, 0]),
      ty: x * (height * 0.5 + L.height),
      rot: interpolate(e, [0, 1], [7, 0]) - 5 * x,
      scale: interpolate(Math.min(1, e), [0, 1], [0.92, 1], CLAMP) * (1 - 0.04 * x),
    };
  };
  const now = pose(frame);
  const prev = pose(frame - 1);
  const speed = Math.hypot(now.tx - prev.tx, now.ty - prev.ty); // px per frame
  const blur = Math.min(P.maxMotionBlurPx, speed * 0.06);
  const opacity = interpolate(frame, [0, Math.max(1, toFrames(P.enterOpaqueSec, fps))], [0, 1], CLAMP);
  const float = Math.sin((2 * Math.PI * frame) / (P.floatPeriodSec * fps)) * P.floatPx; // idle breathing
  const fi = Math.max(0, Math.min(data.frames.length - 1, frame + trimFrames));
  const edges = data.screenEdges;
  const allCues = [...(autoSfx ? shotCues(data, { trimFrames, durationInFrames }) : []), ...cues];
  return (
    <AbsoluteFill>
      {!bare && <Backdrop />}
      {behind && <AbsoluteFill style={phoneBehindStyle(frame, fps, durationInFrames, exit)}>{behind}</AbsoluteFill>}
      <IPhone
        k={L.k}
        topColor={edges?.top[fi]}
        bottomColor={edges?.bottom[fi]}
        style={{
          left: width * centerX - L.width / 2,
          top: (height - L.height) / 2 + float,
          opacity,
          transform: `translate(${now.tx}px, ${now.ty}px) rotate(${now.rot}deg) scale(${now.scale})`,
          filter: blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        <div style={{ position: "relative", width: L.pageWidth, height: L.pageHeight }}>
          <OffthreadVideo src={shotFile(shot)} trimBefore={trimFrames} muted style={{ width: L.pageWidth, height: L.pageHeight, objectFit: "cover", objectPosition: "top", display: "block" }} />
          <TapRipple data={data} trimFrames={trimFrames} k={k} />
        </div>
      </IPhone>
      {children}
      <Sfx cues={allCues} />
      {!bare && <Finish />}
    </AbsoluteFill>
  );
};
