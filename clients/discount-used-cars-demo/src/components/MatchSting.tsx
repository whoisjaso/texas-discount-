// Intro sting built as a MATCH CUT onto the site's own loader. It is laid out exactly like the loader (same mark,
// same word, same letter-spacing, same gaps), only `scale` times larger and centred in the frame. The parent moves
// and shrinks the whole group (`pose`) onto where the loader sits in the window as the window springs in; once it has
// landed, the sting dissolves into the identical loader underneath, so the loader continues the sting instead of
// repeating it.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const S = theme.sting;

export type Rect = readonly [number, number, number, number];
export type LoaderGeometry = {
  /** the loader's stage, mark image and word box, in the site's CSS px at the capture viewport */
  stage: Rect;
  mark: Rect;
  word: Rect;
  wordFont: { size: number; lineHeight: number; weight: number; trackingEm: number; color: string };
};
/** The group transform about the frame centre: translate(dx, dy) scale(scale). */
export type Pose = { scale: number; dx: number; dy: number };

export const MatchSting: React.FC<{
  mark: string;
  word: string;
  loader: LoaderGeometry;
  /** how many times larger than the site's loader the sting is drawn at rest */
  scale: number;
  pose?: Pose;
  opacity?: number;
  /** 0 → 1 while handing off: the sting's own breathing dies away so it lands exactly */
  handoff?: number;
}> = ({ mark, word, loader, scale: k, pose = { scale: 1, dx: 0, dy: 0 }, opacity = 1, handoff = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cx = loader.stage[0] + loader.stage[2] / 2;
  const cy = loader.stage[1] + loader.stage[3] / 2;
  const place = (r: Rect) => ({ left: width / 2 + k * (r[0] - cx), top: height / 2 + k * (r[1] - cy), width: k * r[2], height: k * r[3] });

  const p = spring({ frame, fps, config: theme.spring.smooth });
  const pc = Math.min(1, p);
  const wipe = interpolate(frame, [0, toFrames(S.wipeSec, fps)], [0, 100], { easing: theme.ease.out, ...CLAMP });
  const breathe = 1 + Math.sin((2 * Math.PI * frame) / (S.breathePeriodSec * fps)) * S.breatheAmp * (1 - handoff);
  const delay = toFrames(S.wordDelaySec, fps);
  const per = Math.max(1, toFrames(S.letterStaggerSec, fps));
  const F = loader.wordFont;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transformOrigin: `${width / 2}px ${height / 2}px`,
        transform: `translate(${pose.dx}px, ${pose.dy}px) scale(${pose.scale * breathe})`,
      }}
    >
      <Img
        src={staticFile(mark)}
        style={{
          position: "absolute",
          ...place(loader.mark),
          clipPath: `inset(0 ${100 - wipe}% 0 0)`,
          transform: `translateX(${interpolate(p, [0, 1], [-60, 0])}px) scale(${interpolate(pc, [0, 1], [0.92, 1], CLAMP)})`,
          filter: `blur(${Math.max(0, (1 - pc) * 8).toFixed(2)}px)`,
          opacity: Math.min(1, pc * 1.4),
        }}
      />
      <div
        style={{
          position: "absolute",
          ...place(loader.word),
          fontFamily: theme.fonts.stack,
          fontWeight: F.weight,
          fontSize: F.size * k,
          lineHeight: `${F.lineHeight * k}px`,
          letterSpacing: `${F.trackingEm}em`,
          color: F.color,
          whiteSpace: "pre",
        }}
      >
        {Array.from(word).map((ch, i) => {
          const s = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
          const sc = Math.min(1, s);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: sc,
                transform: `translateY(${interpolate(s, [0, 1], [F.size * k * 0.45, 0])}px)`,
                filter: `blur(${Math.max(0, (1 - sc) * F.size * k * 0.08).toFixed(2)}px)`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
