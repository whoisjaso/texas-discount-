// One short line in the brand face, Title Case, words (or letters) staggering in (opacity + rise + de-blur),
// a faster exit. Use sparingly: few titles, one line each.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Title: React.FC<{
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  /** letter-spacing in em */
  tracking?: number;
  /** seconds before the first word */
  delaySec?: number;
  /** seconds between words (or letters with `by="letter"`); 3–6 frames */
  staggerSec?: number;
  by?: "word" | "letter";
  /** frame at which the exit starts */
  exitAt?: number;
  /** seconds the exit takes */
  exitSec?: number;
  style?: React.CSSProperties;
}> = ({ text, size = 64, weight = 600, color = theme.colors.text, tracking = 0, delaySec = 0, staggerSec = 0.1, by = "word", exitAt, exitSec = 0.27, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = by === "word" ? text.split(" ") : Array.from(text);
  const delay = toFrames(delaySec, fps);
  const per = Math.max(1, toFrames(staggerSec, fps));
  const exit = exitAt === undefined ? 0 : interpolate(frame, [exitAt, exitAt + Math.max(1, toFrames(exitSec, fps))], [0, 1], { easing: theme.ease.in, ...CLAMP });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: by === "word" ? size * 0.26 : 0,
        fontFamily: theme.fonts.stack,
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
        // the snappy spring overshoots a little: clamp what must not overshoot (opacity, blur)
        const s = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
        const sc = Math.min(1, s);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: sc * (1 - exit),
              transform: `translateY(${interpolate(s, [0, 1], [size * 0.45, 0]) - exit * size * 0.3}px) scale(${interpolate(sc, [0, 1], [0.96, 1], CLAMP)})`,
              filter: `blur(${Math.max(0, (1 - sc) * size * 0.08 + exit * 6).toFixed(2)}px)`,
            }}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
};
