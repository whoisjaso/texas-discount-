// A filed document of the narrated cut's deal, opened over the held desk in a macOS Preview window (dark), as B6 does,
// but with a camera that follows the voice: a list of pushes (DocKey: a page point brought to the frame's centre at a
// display scale, each with Recordly's zoom-in ease) and a Screen Studio spotlight that moves with them (DocSpot, the
// box morphs from one to the next). Identity on the page sits under a privacy blur at every frame. Seconds are
// relative to the overlay's first frame. The window springs in at openAt and leaves (fades, sinks, shrinks) at closeAt.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import type { DocSpec } from "./plan";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type Box = readonly [number, number, number, number];

export const docWindow = (spec: DocSpec, frameW: number, frameH: number) => {
  const W = theme.doc.window;
  const [pw, ph] = spec.size;
  const contentH = W.height - W.toolbar;
  const pageH = contentH - 2 * W.pageMargin;
  const s0 = pageH / ph;
  const pageW = pw * s0;
  const width = pageW + 2 * W.sideMargin;
  const [ox, oy] = spec.offset ?? [0, 0];
  const left = (frameW - width) / 2 + W.offsetX + ox;
  const top = (frameH - W.height) / 2 + oy;
  return { left, top, width, height: W.height, s0, pageW, pageH, pageLeft: left + W.sideMargin, pageTop: top + W.toolbar + W.pageMargin };
};

/** The camera at t seconds: page point c is drawn at frame point q, everything scaled by S about it. */
export const docCamera = (spec: DocSpec, t: number, frameW: number, frameH: number) => {
  const L = docWindow(spec, frameW, frameH);
  const rest = (p: readonly [number, number]): [number, number] => [L.pageLeft + p[0] * L.s0, L.pageTop + p[1] * L.s0];
  const centre: [number, number] = [spec.size[0] / 2, spec.size[1] / 2];
  let c: [number, number] = centre;
  let q: [number, number] = rest(centre);
  let S = 1;
  let moving = 0;
  for (const k of spec.keys) {
    if (t < k.at) break;
    const dur = k.dur ?? theme.recordly.zoomInSec;
    const w = theme.recordly.zoomInEase(clamp01((t - k.at) / dur));
    const tc: [number, number] = [k.x, k.y];
    const tq: [number, number] = [frameW / 2, k.landY ?? frameH / 2];
    const tS = k.ds / L.s0;
    c = [mix(c[0], tc[0], w), mix(c[1], tc[1], w)];
    q = [mix(q[0], tq[0], w), mix(q[1], tq[1], w)];
    S = Math.exp(mix(Math.log(S), Math.log(tS), w));
    moving = w > 0 && w < 1 ? 1 : moving;
  }
  const rc = rest(c);
  return { L, S, tx: q[0] - S * rc[0], ty: q[1] - S * rc[1], moving };
};

/** The spotlight box and its level at t (the box morphs between consecutive spots, fades in from none and out to none). */
const spotAt = (spec: DocSpec, t: number): { box: Box; level: number } | null => {
  const M = 0.6;
  const spots = spec.spots;
  const i = spots.findIndex((sp) => t >= sp.from && t < sp.to);
  if (i < 0) {
    const last = [...spots].reverse().find((sp) => t >= sp.to);
    if (last && t < last.to + M) return { box: last.box, level: 1 - theme.ease.inOut(clamp01((t - last.to) / M)) };
    return null;
  }
  const sp = spots[i];
  const u = theme.ease.inOut(clamp01((t - sp.from) / M));
  const prev = i > 0 && Math.abs(spots[i - 1].to - sp.from) < 0.05 ? spots[i - 1] : null;
  if (!prev) return { box: sp.box, level: u };
  const b = sp.box.map((v, j) => mix(prev.box[j], v, u)) as unknown as Box;
  return { box: b, level: 1 };
};

const Glyph: React.FC<{ d: string }> = ({ d }) => (
  <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: "block", flex: "none" }}>
    <path d={d} fill="none" stroke={theme.colors.docIcon} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GLYPHS = [
  "M7.5 2.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM11.2 11.2L16 16M5.2 7.5h4.6",
  "M7.5 2.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM11.2 11.2L16 16M5.2 7.5h4.6M7.5 5.2v4.6",
  "M6 6.5H4.5v9h9v-9H12M9 1.8v9M6.3 4.4L9 1.8l2.7 2.6",
  "M9 1.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 0 1 0-15zM6.2 11.8l1.1-3.6 4.4-4.4 2.5 2.5-4.4 4.4z",
  "M7.5 2.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM11.2 11.2L16 16",
];
const SIDEBAR = "M2.5 3.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 1 13V5a1.5 1.5 0 0 1 1.5-1.5zM6.5 3.5v11";

const PrivacyBlur: React.FC<{ src: string; box: Box; s0: number; pageW: number; pageH: number }> = ({ src, box, s0, pageW, pageH }) => {
  const P = theme.doc.privacy;
  const [x, y, w, h] = [box[0] - P.padPx, box[1] - P.padPx, box[2] + 2 * P.padPx, box[3] + 2 * P.padPx];
  const m = 2 * P.blurPx;
  return (
    <div style={{ position: "absolute", left: x * s0, top: y * s0, width: w * s0, height: h * s0, overflow: "hidden", borderRadius: P.radiusPx * s0, boxShadow: `inset 0 0 0 ${Math.max(0.5, s0)}px ${theme.colors.privacyEdge}` }}>
      <div style={{ position: "absolute", left: -m * s0, top: -m * s0, width: (w + 2 * m) * s0, height: (h + 2 * m) * s0, overflow: "hidden", filter: `blur(${(P.blurPx * s0).toFixed(3)}px)` }}>
        <Img src={staticFile(src)} style={{ position: "absolute", left: -(x - m) * s0, top: -(y - m) * s0, width: pageW, height: pageH, maxWidth: "none" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: theme.colors.privacyTint }} />
    </div>
  );
};

const Caption: React.FC<{ text: string; t: number; at: number; exitAt: number }> = ({ text, t, at, exitAt }) => {
  const { fps, width } = useVideoConfig();
  const C = theme.doc.caption;
  const f = Math.round((t - at) * fps);
  if (f < 0) return null;
  const p = spring({ frame: f, fps, config: theme.spring.smooth });
  const x = interpolate(t, [exitAt, exitAt + C.exitSec], [0, 1], { easing: theme.ease.in, ...CLAMP });
  const words = text.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        width,
        top: C.centerY + 70,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(-50%) translateY(${interpolate(p, [0, 1], [C.rise, 0], { extrapolateLeft: "clamp", extrapolateRight: "extend" }) + C.exitDrop * x}px) scale(${interpolate(clamp01(p), [0, 1], [C.scaleFrom, 1], CLAMP) * (1 - C.exitScale * x)})`,
        opacity: clamp01(p * C.fadeInRate) * (1 - x),
        filter: x > 0.01 ? `blur(${Math.max(0, C.exitBlur * x).toFixed(2)}px)` : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "14px 30px 15px",
          borderRadius: 999,
          background: theme.colors.captionPill,
          boxShadow: `0 0 0 1px ${theme.colors.captionEdge}, 0 18px 40px -12px ${theme.colors.shadowDeep}`,
          color: theme.colors.text,
          fontFamily: theme.fonts.stack,
          fontWeight: 600,
          fontSize: C.size,
          lineHeight: 1.1,
          letterSpacing: 0.2,
          whiteSpace: "nowrap",
        }}
      >
        {words.map((word, i) => {
          const q = spring({ frame: f - toFrames(C.wordDelaySec, fps) - i * toFrames(C.wordStaggerSec, fps), fps, config: theme.spring.snappy });
          const rise = interpolate(q, [0, 1], [C.wordRise, 0], { extrapolateLeft: "clamp", extrapolateRight: "extend" });
          return (
            <span key={i} style={{ display: "inline-block", opacity: clamp01(q), transform: `translateY(${rise}px) scale(${interpolate(clamp01(q), [0, 1], [C.wordScaleFrom, 1], CLAMP)})` }}>
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** open (0-1, a spring from openAt) and close (0-1, eased in over closeSec from closeAt) at a frame of the overlay */
export const docOpenClose = (spec: DocSpec, frame: number, fps: number) => {
  const e = spring({ frame: frame - toFrames(spec.openAt, fps), fps, config: theme.spring.window });
  const x = interpolate(frame / fps, [spec.closeAt, spec.closeAt + 0.4], [0, 1], { easing: theme.ease.in, ...CLAMP });
  return { e: frame < toFrames(spec.openAt, fps) ? 0 : e, x };
};

export const NarratedDoc: React.FC<{ spec: DocSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const D = theme.doc;
  const R = theme.recordly;
  const W = D.window;
  const { e, x } = docOpenClose(spec, frame, fps);
  if (e <= 0.001 || x >= 0.999) return null;
  const cam = docCamera(spec, t, width, height);
  const prev = docCamera(spec, t - 1 / fps, width, height);
  const L = cam.L;
  const speed = Math.hypot(cam.tx - prev.tx, cam.ty - prev.ty) + Math.abs(cam.S - prev.S) * (L.width / 2);
  const blur = speed < D.motionBlur.minSpeed ? 0 : Math.min(R.maxBlurPx, speed * R.motionBlur * D.motionBlur.gain);
  const winScale = interpolate(e, [0, 1], [D.entrance.scaleFrom, 1], CLAMP) * (1 - 0.04 * x);
  const winY = interpolate(e, [0, 1], [D.entrance.rise, 0], CLAMP) + 24 * x;
  const winOpacity = clamp01(e * D.entrance.fadeInRate) * (1 - x);
  const spot = spotAt(spec, t);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.S})`, filter: blur > 0.05 ? `blur(${(blur / cam.S).toFixed(3)}px)` : undefined }}>
        <div
          style={{
            position: "absolute",
            left: L.left,
            top: L.top,
            width: L.width,
            height: L.height,
            borderRadius: theme.window.radius,
            overflow: "hidden",
            background: theme.colors.docCanvas,
            opacity: winOpacity,
            transformOrigin: "50% 50%",
            transform: `translateY(${winY}px) scale(${winScale})`,
            boxShadow: `0 0 0 1px ${theme.colors.chromeHairline}, 0 70px 150px -20px ${theme.colors.shadowDeep}, 0 30px 60px -28px ${theme.colors.shadow}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              height: W.toolbar,
              background: `linear-gradient(180deg, ${theme.colors.chromeTop}, ${theme.colors.chrome})`,
              borderBottom: `1px solid ${theme.colors.chromeHairline}`,
              display: "flex",
              alignItems: "center",
              padding: "0 16px 0 18px",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: theme.colors.lightsMono, boxShadow: `inset 0 0 0 0.5px ${theme.colors.lightsMonoEdge}` }} />
              ))}
            </div>
            <div style={{ marginLeft: 10 }}>
              <Glyph d={SIDEBAR} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, fontFamily: theme.fonts.stack, lineHeight: 1.15 }}>
              <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: 14.5, letterSpacing: 0.15 }}>{spec.fileName}</div>
              <div style={{ color: theme.colors.docTitleSub, fontWeight: 500, fontSize: 11.5, letterSpacing: 0.2 }}>{`Page ${spec.page} of ${spec.pages}`}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {GLYPHS.map((d, i) => (
                <Glyph key={i} d={d} />
              ))}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: W.sideMargin,
              top: W.toolbar + W.pageMargin,
              width: L.pageW,
              height: L.pageH,
              background: theme.colors.docPage,
              boxShadow: `0 2px 14px ${theme.colors.docPageShadow}`,
              overflow: "hidden",
            }}
          >
            <Img src={staticFile(spec.src)} style={{ position: "absolute", left: 0, top: 0, width: L.pageW, height: L.pageH }} />
            {spec.privacy.map((b, i) => (
              <PrivacyBlur key={i} src={spec.src} box={b} s0={L.s0} pageW={L.pageW} pageH={L.pageH} />
            ))}
            {spot && spot.level > 0.001 ? (
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute",
                    left: spot.box[0] * L.s0,
                    top: spot.box[1] * L.s0,
                    width: spot.box[2] * L.s0,
                    height: spot.box[3] * L.s0,
                    borderRadius: D.spotlight.radiusPx * L.s0,
                    boxShadow: `0 0 0 ${Math.ceil(4000 * L.s0)}px rgba(${theme.colors.shadeRgb},${(D.spotlight.dim * spot.level).toFixed(3)})`,
                  }}
                />
              </div>
            ) : null}
          </div>
          <div style={{ position: "absolute", inset: 0, borderRadius: theme.window.radius, boxShadow: `inset 0 1px 0 ${theme.colors.chromeBorder}`, pointerEvents: "none" }} />
        </div>
      </AbsoluteFill>
      {spec.caption ? <Caption text={spec.caption.text} t={t} at={spec.caption.at} exitAt={spec.caption.exitAt} /> : null}
    </AbsoluteFill>
  );
};
