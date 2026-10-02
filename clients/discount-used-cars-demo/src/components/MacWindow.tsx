// A macOS window (dark appearance): 12 px radius, hairline border, large soft shadow,
// title bar with three traffic lights and a centred URL pill showing the real domain.
import React from "react";
import { theme } from "../theme";

const Lock: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size * 0.72} height={size} viewBox="0 0 10 14" style={{ flex: "none" }}>
    <rect x="0.5" y="6" width="9" height="7.5" rx="1.6" fill={theme.colors.urlText} />
    <path d="M2.6 6V4.2a2.4 2.4 0 0 1 4.8 0V6" fill="none" stroke={theme.colors.urlText} strokeWidth="1.4" />
  </svg>
);

export const MacWindow: React.FC<{
  /** Content box (the page) in display px; the title bar is added on top. */
  width: number;
  height: number;
  url: string;
  lights?: "mono" | "color";
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ width, height, url, lights = theme.window.lights, style, children }) => {
  const T = theme.window.titleBar;
  const r = theme.window.radius;
  const dot = 12;
  const lightColors = lights === "color" ? theme.colors.lightsColor : [theme.colors.lightsMono, theme.colors.lightsMono, theme.colors.lightsMono];
  return (
    <div
      style={{
        position: "absolute",
        width,
        height: height + T,
        borderRadius: r,
        overflow: "hidden",
        background: theme.colors.chrome,
        // hairline, a large soft shadow offset downward (the window floats above the desk), a tighter contact shadow
        boxShadow: `0 0 0 1px ${theme.colors.chromeHairline}, 0 70px 150px -20px ${theme.colors.shadowDeep}, 0 30px 60px -28px ${theme.colors.shadow}`,
        ...style,
      }}
    >
      {/* title bar */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          height: T,
          background: `linear-gradient(180deg, ${theme.colors.chromeTop}, ${theme.colors.chrome})`,
          borderBottom: `1px solid ${theme.colors.chromeHairline}`,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
          {lightColors.map((c, i) => (
            <div key={i} style={{ width: dot, height: dot, borderRadius: "50%", background: c, boxShadow: `inset 0 0 0 0.5px ${theme.colors.lightsMonoEdge}` }} />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: (T - 24) / 2,
            transform: "translateX(-50%)",
            height: 24,
            minWidth: Math.min(520, width * 0.36),
            padding: "0 18px",
            borderRadius: 7,
            background: theme.colors.urlPill,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: theme.colors.urlText,
            fontFamily: theme.fonts.stack,
            fontWeight: 500,
            fontSize: 14.5,
            letterSpacing: 0.2,
          }}
        >
          <Lock size={12} />
          {url}
        </div>
      </div>
      {/* content */}
      <div style={{ position: "absolute", left: 0, top: T, width, height, overflow: "hidden", background: theme.colors.ink }}>{children}</div>
      {/* 1 px highlight along the top edge (light catching the chrome) */}
      <div style={{ position: "absolute", inset: 0, borderRadius: r, boxShadow: `inset 0 1px 0 ${theme.colors.chromeBorder}`, pointerEvents: "none" }} />
    </div>
  );
};

/** Window geometry centred in the frame for a viewport aspect (content fills the height between margins). */
export const windowLayout = (vw: number, vh: number, frameW: number = theme.width, frameH: number = theme.height) => {
  const T = theme.window.titleBar;
  const contentH = frameH - 2 * theme.window.marginY - T;
  const contentW = Math.round((contentH * vw) / vh);
  const left = Math.round((frameW - contentW) / 2);
  const top = Math.round((frameH - contentH - T) / 2);
  return { contentW, contentH, left, top, contentLeft: left, contentTop: top + T, T };
};
