// Intro / outro sting: brand mark draws in (wipe + slide + de-blur), a wide-tracked word staggers in letter by
// letter beneath it, optional detail lines follow; everything leaves faster than it came.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { Title } from "./Title";

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
  lineSize?: number;
  /** frames */
  wordDelay?: number;
  linesDelay?: number;
  exitAt?: number;
}> = ({ mark, markWidth = 560, logo, logoWidth = 760, word, wordSize = 46, lines = [], lineSize = 40, wordDelay = 14, linesDelay = 24, exitAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.smooth });
  const wipe = interpolate(frame, [0, 22], [0, 100], { easing: theme.ease.out, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = exitAt === undefined ? 0 : interpolate(frame, [exitAt, exitAt + 9], [0, 1], { easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = 1 + Math.sin(frame / 22) * 0.006;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
          opacity: 1 - exit,
          transform: `scale(${(1 + exit * 0.04) * breathe})`,
          filter: exit > 0 ? `blur(${exit * 8}px)` : undefined,
        }}
      >
        {mark && (
          <Img
            src={staticFile(mark)}
            style={{
              width: markWidth,
              clipPath: `inset(0 ${100 - wipe}% 0 0)`,
              transform: `translateX(${interpolate(p, [0, 1], [-60, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1])})`,
              filter: `blur(${(1 - p) * 8}px)`,
              opacity: Math.min(1, p * 1.4),
            }}
          />
        )}
        {logo && (
          <Img
            src={staticFile(logo)}
            style={{
              width: logoWidth,
              transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px) scale(${interpolate(p, [0, 1], [0.9, 1])})`,
              filter: `blur(${(1 - p) * 10}px)`,
              opacity: p,
            }}
          />
        )}
        {word && <Title text={word} by="letter" per={2} delay={wordDelay} size={wordSize} weight={600} tracking={0.5} style={{ marginRight: "-0.5em" }} />}
        {lines.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            {lines.map((l, i) => (
              <Title key={l} text={l} delay={linesDelay + i * 6} per={2} size={i === 0 ? lineSize : lineSize * 0.72} weight={i === 0 ? 600 : 500} color={i === 0 ? theme.colors.text : theme.colors.textDim} tracking={0.01} />
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
