// One short line in the brand face, Title Case, words staggering in (opacity + rise + de-blur),
// a faster exit. Use sparingly: few titles, one line each.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const Title: React.FC<{
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  /** letter-spacing in em */
  tracking?: number;
  /** frames */
  delay?: number;
  /** frames between words (or letters with `by="letter"`) */
  per?: number;
  by?: "word" | "letter";
  /** frame at which the exit starts (exit lasts 8 frames) */
  exitAt?: number;
  style?: React.CSSProperties;
}> = ({ text, size = 64, weight = 600, color = theme.colors.text, tracking = 0, delay = 0, per = 3, by = "word", exitAt, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = by === "word" ? text.split(" ") : Array.from(text);
  const exit = exitAt === undefined ? 0 : interpolate(frame, [exitAt, exitAt + 8], [0, 1], { easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: by === "word" ? size * 0.26 : 0,
        fontFamily: theme.fonts.display,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: `${tracking}em`,
        color,
        whiteSpace: "pre",
        ...style,
      }}
    >
      {parts.map((p, i) => {
        const s = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: s * (1 - exit),
              transform: `translateY(${interpolate(s, [0, 1], [size * 0.45, 0]) - exit * size * 0.3}px) scale(${interpolate(s, [0, 1], [0.96, 1])})`,
              filter: `blur(${((1 - s) * size * 0.08 + exit * 6).toFixed(2)}px)`,
            }}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
};
