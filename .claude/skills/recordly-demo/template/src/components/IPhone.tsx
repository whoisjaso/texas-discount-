// iPhone frame drawn in SVG + CSS: titanium edge, black bezel, 55 pt corner radius, Dynamic Island,
// side buttons, iOS status bar. The page sits under the status bar (390 × 797 pt of a 390 × 844 pt screen).
import React from "react";
import { theme } from "../theme";

const StatusBar: React.FC<{ k: number }> = ({ k }) => {
  const P = theme.phone;
  const c = theme.colors.statusText;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: P.screen.width * k, height: P.statusBar * k, background: theme.colors.statusBar }}>
      <div style={{ position: "absolute", left: 0, width: 130 * k, top: 15 * k, textAlign: "center", color: c, fontFamily: theme.fonts.display, fontWeight: 600, fontSize: 17 * k, letterSpacing: 0.2 * k }}>{P.time}</div>
      <svg style={{ position: "absolute", right: 26 * k, top: 18 * k }} width={78 * k} height={13 * k} viewBox="0 0 78 13">
        {/* signal */}
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 5} y={9 - i * 2.6} width={3.2} height={3.4 + i * 2.6} rx={0.9} fill={c} />
        ))}
        {/* wi-fi */}
        <path d="M31.5 4.2a9.4 9.4 0 0 1 12.6 0" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
        <path d="M33.8 6.9a5.9 5.9 0 0 1 8 0" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
        <circle cx={37.8} cy={10.4} r={1.6} fill={c} />
        {/* battery */}
        <rect x={51} y={1} width={23} height={11} rx={3.2} fill="none" stroke={c} strokeOpacity={0.45} strokeWidth={1} />
        <rect x={53} y={3} width={17} height={7} rx={1.8} fill={c} />
        <path d="M75.6 4.6v3.8a2 2 0 0 0 0-3.8z" fill={c} fillOpacity={0.45} />
      </svg>
    </div>
  );
};

export const IPhone: React.FC<{
  /** display px per iOS point */
  k: number;
  statusBar?: boolean;
  style?: React.CSSProperties;
  /** the page, sized pageWidth × pageHeight (see iphoneLayout) */
  children: React.ReactNode;
}> = ({ k, statusBar = true, style, children }) => {
  const P = theme.phone;
  const b = P.bezel;
  const W = (P.screen.width + 2 * b) * k;
  const H = (P.screen.height + 2 * b) * k;
  const top = statusBar ? P.statusBar : 0;
  return (
    <div style={{ position: "absolute", width: W, height: H, ...style }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 ${40 * k}px ${60 * k}px ${theme.colors.shadow})` }}>
        <defs>
          <linearGradient id="phone-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={theme.colors.phoneEdgeHi} />
            <stop offset="0.35" stopColor={theme.colors.phoneEdge} />
            <stop offset="0.7" stopColor={theme.colors.phoneEdge} />
            <stop offset="1" stopColor={theme.colors.phoneEdgeHi} />
          </linearGradient>
        </defs>
        {/* side buttons: action, volume up/down (left), side button (right) */}
        <rect x={-2.6 * k} y={118 * k} width={4 * k} height={30 * k} rx={1.6 * k} fill={theme.colors.phoneButton} />
        <rect x={-2.6 * k} y={176 * k} width={4 * k} height={58 * k} rx={1.6 * k} fill={theme.colors.phoneButton} />
        <rect x={-2.6 * k} y={248 * k} width={4 * k} height={58 * k} rx={1.6 * k} fill={theme.colors.phoneButton} />
        <rect x={W - 1.4 * k} y={196 * k} width={4 * k} height={92 * k} rx={1.6 * k} fill={theme.colors.phoneButton} />
        <rect x={0} y={0} width={W} height={H} rx={P.radius * k} fill="url(#phone-edge)" />
        <rect x={2.4 * k} y={2.4 * k} width={W - 4.8 * k} height={H - 4.8 * k} rx={(P.radius - 2.4) * k} fill={theme.colors.phoneBezel} />
      </svg>
      <div style={{ position: "absolute", left: b * k, top: b * k, width: P.screen.width * k, height: P.screen.height * k, borderRadius: P.screenRadius * k, overflow: "hidden", background: theme.colors.statusBar }}>
        {statusBar && <StatusBar k={k} />}
        <div style={{ position: "absolute", left: 0, top: top * k, width: P.screen.width * k, height: (P.screen.height - top) * k, overflow: "hidden" }}>{children}</div>
      </div>
      {/* Dynamic Island */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - (P.island.width * k) / 2,
          top: (b + P.island.top) * k,
          width: P.island.width * k,
          height: P.island.height * k,
          borderRadius: (P.island.height * k) / 2,
          background: theme.colors.phoneBezel,
        }}
      />
      {/* glass: a faint diagonal reflection */}
      <div style={{ position: "absolute", left: b * k, top: b * k, width: P.screen.width * k, height: P.screen.height * k, borderRadius: P.screenRadius * k, background: "linear-gradient(125deg, rgba(255,255,255,0.07) 0%, transparent 30%)", pointerEvents: "none" }} />
    </div>
  );
};

/** Phone geometry for a given phone height in frame px. */
export const iphoneLayout = (phoneHeight: number, statusBar = true) => {
  const P = theme.phone;
  const k = phoneHeight / (P.screen.height + 2 * P.bezel);
  const top = statusBar ? P.statusBar : 0;
  return {
    k,
    width: (P.screen.width + 2 * P.bezel) * k,
    height: phoneHeight,
    pageWidth: P.screen.width * k,
    pageHeight: (P.screen.height - top) * k,
    /** offset of the page box inside the phone */
    pageLeft: P.bezel * k,
    pageTop: (P.bezel + top) * k,
  };
};
