// Intro / outro sting: brand mark draws in (wipe + slide + de-blur) or a full logo scales in, a wide-tracked word
// staggers in letter by letter beneath it, optional detail lines follow word by word; a slow push while it holds;
// everything leaves faster than it came (blur + scale + fade).
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { Title } from "./Title";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const S = theme.sting;

export const LogoSting: React.FC<{
  /** public/ path of a wide mark (drawn in with a left-to-right wipe) */
  mark?: string;
  markWidth?: number;
  /** public/ path of a full logo (scaled in instead of wiped) */
  logo?: string;
  logoWidth?: number;
  word?: string;
  wordSize?: number;
  lines?: string[];
  /** font size per line (the last value repeats) */
  lineSizes?: readonly number[];
  /** seconds */
  wordDelaySec?: number;
  linesDelaySec?: number;
  lineStaggerSec?: number;
  /** frame at which the exit starts (omit for no exit) */
  exitAt?: number;
  exitSec?: number;
  /** slow push: scale reached at the end of the sequence (1 = none) */
  pushTo?: number;
}> = ({
  mark,
  markWidth = 560,
  logo,
  logoWidth = 760,
  word,
  wordSize = 46,
  lines = [],
  lineSizes = [40, 29],
  wordDelaySec = S.wordDelaySec,
  linesDelaySec = 0.8,
  lineStaggerSec = 0.2,
  exitAt,
  exitSec = S.exitSec,
  pushTo = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.smooth });
  const pc = Math.min(1, p);
  const wipe = interpolate(frame, [0, toFrames(S.wipeSec, fps)], [0, 100], { easing: theme.ease.out, ...CLAMP });
  const exit = exitAt === undefined ? 0 : interpolate(frame, [exitAt, exitAt + Math.max(1, toFrames(exitSec, fps))], [0, 1], { easing: theme.ease.in, ...CLAMP });
  const breathe = 1 + Math.sin((2 * Math.PI * frame) / (S.breathePeriodSec * fps)) * S.breatheAmp;
  const push = interpolate(frame, [0, durationInFrames], [1, pushTo], { easing: theme.ease.soft, ...CLAMP });
  const sizeOf = (i: number) => lineSizes[Math.min(i, lineSizes.length - 1)];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
          opacity: 1 - exit,
          transform: `scale(${(1 + exit * 0.04) * breathe * push})`,
          filter: exit > 0 ? `blur(${(exit * 8).toFixed(2)}px)` : undefined,
        }}
      >
        {mark && (
          <Img
            src={staticFile(mark)}
            style={{
              width: markWidth,
              clipPath: `inset(0 ${100 - wipe}% 0 0)`,
              transform: `translateX(${interpolate(p, [0, 1], [-60, 0])}px) scale(${interpolate(pc, [0, 1], [0.92, 1], CLAMP)})`,
              filter: `blur(${Math.max(0, (1 - pc) * 8).toFixed(2)}px)`,
              opacity: Math.min(1, pc * 1.4),
            }}
          />
        )}
        {logo && (
          <Img
            src={staticFile(logo)}
            style={{
              width: logoWidth,
              transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px) scale(${interpolate(pc, [0, 1], [0.9, 1], CLAMP)})`,
              filter: `blur(${Math.max(0, (1 - pc) * 10).toFixed(2)}px)`,
              opacity: pc,
            }}
          />
        )}
        {word && <Title text={word} by="letter" staggerSec={S.letterStaggerSec} delaySec={wordDelaySec} size={wordSize} weight={600} tracking={0.5} style={{ marginRight: "-0.5em" }} />}
        {lines.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: theme.outro.gap }}>
            {lines.map((l, i) => (
              <Title
                key={l}
                text={l}
                delaySec={linesDelaySec + i * lineStaggerSec}
                staggerSec={theme.outro.wordStaggerSec}
                size={sizeOf(i)}
                weight={i === 0 ? 600 : 500}
                color={i === 0 ? theme.colors.text : theme.colors.textSoft}
                tracking={0.01}
              />
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
