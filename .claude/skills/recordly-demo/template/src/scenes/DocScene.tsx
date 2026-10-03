// B6 · the deal's real Form 130-U. The Open / Print click that ends the packet capture opens the filled page 1 in a
// macOS Preview window (dark appearance) that springs up over the desk, which stays held on its last frame and settles
// back, dimmed. Then the camera pushes in on the seller band, with Recordly's zoom-in time and ease: Maria Lopez's
// drawn signature (the same strokes she drew on camera in B2) beside "Discount Used Cars And Trucks, LLC (Maria Lopez)".
// Money on the page sits under a privacy blur at every frame. One Title Case caption on a dark pill, then it leaves
// before the phone comes in.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { project } from "../project";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type Box = readonly [number, number, number, number];

/** The Preview window and the page at rest (frame px), and the page's scale (frame px per page px). */
export const docLayout = (frameW: number, frameH: number) => {
  const W = theme.doc.window;
  const [pw, ph] = project.doc.size;
  const contentH = W.height - W.toolbar;
  const pageH = contentH - 2 * W.pageMargin;
  const s0 = pageH / ph;
  const pageW = pw * s0;
  const width = pageW + 2 * W.sideMargin;
  const left = (frameW - width) / 2 + W.offsetX;
  const top = (frameH - W.height) / 2;
  return { left, top, width, height: W.height, s0, pageW, pageH, pageLeft: left + W.sideMargin, pageTop: top + W.toolbar + W.pageMargin };
};

/** The scene's motion at a frame: window entrance (e), push progress (w) and the camera (scale S about the band). */
export const docMotion = (frame: number, fps: number, frameW: number, frameH: number) => {
  const D = theme.doc;
  const R = theme.recordly;
  const L = docLayout(frameW, frameH);
  const e = spring({ frame, fps, config: theme.spring.window });
  const atF = toFrames(D.push.atSec, fps);
  const inF = Math.max(1, toFrames(R.zoomInSec, fps));
  const w = R.zoomInEase(clamp01((frame - atF) / inF));
  const [, by, , bh] = project.doc.sellerBand;
  // the band's centre row, on the form's centre column
  const c: [number, number] = [L.pageLeft + D.push.focusX * L.s0, L.pageTop + (by + bh / 2) * L.s0];
  const q: [number, number] = [frameW / 2, D.push.landY];
  const S1 = D.push.displayScale / L.s0;
  const S = Math.exp(Math.log(S1) * w); // log-space: one even push
  // a point p (frame px at rest) appears at mix(c, q, w) + S (p − c)
  const at = [mix(c[0], q[0], w), mix(c[1], q[1], w)] as const;
  return { L, e, w, S, c, at };
};

/** How the held desk behind the Preview window recedes: settles back, softens and dims as the window opens. */
export const docBehind = (frame: number, fps: number, frameW: number, frameH: number) => {
  const B = theme.doc.behind;
  const { e, w } = docMotion(frame, fps, frameW, frameH);
  const k = clamp01(e);
  return {
    style: {
      transform: `scale(${(1 - (1 - B.scale) * k) * (1 + B.pushParallax * w)})`,
      filter: `blur(${Math.max(0, B.blurPx * k).toFixed(2)}px)`,
    } as React.CSSProperties,
    dim: B.dim * k,
  };
};

// ---- toolbar glyphs (Preview's dark toolbar, brand-safe grey)
const Glyph: React.FC<{ d: string; size?: number }> = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: "block", flex: "none" }}>
    <path d={d} fill="none" stroke={theme.colors.docIcon} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GLYPHS = {
  sidebar: "M2.5 3.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 1 13V5a1.5 1.5 0 0 1 1.5-1.5zM6.5 3.5v11",
  zoomOut: "M7.5 2.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM11.2 11.2L16 16M5.2 7.5h4.6",
  zoomIn: "M7.5 2.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM11.2 11.2L16 16M5.2 7.5h4.6M7.5 5.2v4.6",
  share: "M6 6.5H4.5v9h9v-9H12M9 1.8v9M6.3 4.4L9 1.8l2.7 2.6",
  markup: "M9 1.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 0 1 0-15zM6.2 11.8l1.1-3.6 4.4-4.4 2.5 2.5-4.4 4.4z",
  search: "M7.5 2.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM11.2 11.2L16 16",
};

/** A privacy blur over a page box (page px): the page under it, blurred, with a frosted wash (Screen Studio style). */
const PrivacyBlur: React.FC<{ box: Box; s0: number; pageW: number; pageH: number }> = ({ box, s0, pageW, pageH }) => {
  const P = theme.doc.privacy;
  const [x, y, w, h] = [box[0] - P.padPx, box[1] - P.padPx, box[2] + 2 * P.padPx, box[3] + 2 * P.padPx];
  const m = 2 * P.blurPx; // margin so the blur has page to draw from at its edges
  return (
    <div style={{ position: "absolute", left: x * s0, top: y * s0, width: w * s0, height: h * s0, overflow: "hidden", borderRadius: P.radiusPx * s0, boxShadow: `inset 0 0 0 ${Math.max(0.5, s0)}px ${theme.colors.privacyEdge}` }}>
      <div style={{ position: "absolute", left: -m * s0, top: -m * s0, width: (w + 2 * m) * s0, height: (h + 2 * m) * s0, overflow: "hidden", filter: `blur(${(P.blurPx * s0).toFixed(3)}px)` }}>
        <Img src={staticFile(project.doc.src)} style={{ position: "absolute", left: -(x - m) * s0, top: -(y - m) * s0, width: pageW, height: pageH, maxWidth: "none" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: theme.colors.privacyTint }} />
    </div>
  );
};

/** Screen Studio spotlight: the page outside `box` (page px) dims with `level` (the push's progress). */
const Spotlight: React.FC<{ box: Box; s0: number; level: number }> = ({ box, s0, level }) => {
  const P = theme.doc.spotlight;
  if (level <= 0.001) return null;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: box[0] * s0,
          top: box[1] * s0,
          width: box[2] * s0,
          height: box[3] * s0,
          borderRadius: P.radiusPx * s0,
          boxShadow: `0 0 0 ${Math.ceil(4000 * s0)}px rgba(${theme.colors.shadeRgb},${(P.dim * level).toFixed(3)})`,
        }}
      />
    </div>
  );
};

/** The Title Case caption: a dark pill rises in, its words stagger in, and it leaves (faster) before the phone. */
const Caption: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
  const { fps, width } = useVideoConfig();
  const C = theme.doc.caption;
  const at = toFrames(C.atSec, fps);
  const p = spring({ frame: frame - at, fps, config: theme.spring.smooth });
  const exitF = Math.max(1, toFrames(C.exitSec, fps));
  const x = interpolate(frame, [toFrames(C.exitAtSec, fps), toFrames(C.exitAtSec, fps) + exitF], [0, 1], { easing: theme.ease.in, ...CLAMP });
  if (frame < at) return null;
  const words = text.split(" ");
  const stagger = toFrames(C.wordStaggerSec, fps);
  const wordDelay = toFrames(C.wordDelaySec, fps);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        width,
        top: C.centerY,
        display: "flex",
        justifyContent: "center",
        // the spring may overshoot a little on the rise: extend on the right on purpose
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
          const q = spring({ frame: frame - at - wordDelay - i * stagger, fps, config: theme.spring.snappy });
          // the snappy spring's small overshoot is kept on the rise (extend), the scale is clamped
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

export const DocScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const D = theme.doc;
  const W = D.window;
  const R = theme.recordly;
  const { L, e, w, S, c, at } = docMotion(frame, fps, width, height);
  const prev = docMotion(frame - 1, fps, width, height);

  // camera: the band's centre c moves to `at` while everything scales by S about it
  const tx = at[0] - S * c[0];
  const ty = at[1] - S * c[1];
  // light motion blur while the camera moves fast (Recordly: speed × 0.035, at most maxBlurPx)
  const speed = Math.hypot(at[0] - prev.at[0], at[1] - prev.at[1]) + Math.abs(S - prev.S) * (L.width / 2);
  const blur = speed < D.motionBlur.minSpeed ? 0 : Math.min(R.maxBlurPx, speed * R.motionBlur * D.motionBlur.gain);

  // the window's entrance: spring scale + rise + opacity (a new window opening over the desk)
  const winScale = interpolate(e, [0, 1], [D.entrance.scaleFrom, 1], CLAMP);
  const winY = interpolate(e, [0, 1], [D.entrance.rise, 0], CLAMP);
  const winOpacity = clamp01(e * D.entrance.fadeInRate);
  const fileTitle = project.doc.fileName;
  const subtitle = `Page ${project.doc.page} of ${project.doc.pages}`;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${S})`, filter: blur > 0.05 ? `blur(${(blur / S).toFixed(3)}px)` : undefined }}>
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
          {/* unified toolbar: lights, sidebar button, file name over "Page 1 of 2", Preview's tools */}
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
              <Glyph d={GLYPHS.sidebar} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, fontFamily: theme.fonts.stack, lineHeight: 1.15 }}>
              <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: 14.5, letterSpacing: 0.15 }}>{fileTitle}</div>
              <div style={{ color: theme.colors.docTitleSub, fontWeight: 500, fontSize: 11.5, letterSpacing: 0.2 }}>{subtitle}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Glyph d={GLYPHS.zoomOut} />
              <Glyph d={GLYPHS.zoomIn} />
              <Glyph d={GLYPHS.share} />
              <Glyph d={GLYPHS.markup} />
              <Glyph d={GLYPHS.search} />
            </div>
          </div>
          {/* the page */}
          <div
            style={{
              position: "absolute",
              left: W.sideMargin,
              top: W.toolbar + W.pageMargin,
              width: L.pageW,
              height: L.pageH,
              background: theme.colors.docPage,
              boxShadow: `0 2px 14px ${theme.colors.docPageShadow}`,
            }}
          >
            <Img src={staticFile(project.doc.src)} style={{ position: "absolute", left: 0, top: 0, width: L.pageW, height: L.pageH }} />
            {project.doc.privacy.map((b, i) => (
              <PrivacyBlur key={i} box={b as unknown as Box} s0={L.s0} pageW={L.pageW} pageH={L.pageH} />
            ))}
            <Spotlight box={project.doc.spotlight as unknown as Box} s0={L.s0} level={w} />
          </div>
          {/* 1 px highlight along the top edge, as on the browser window */}
          <div style={{ position: "absolute", inset: 0, borderRadius: theme.window.radius, boxShadow: `inset 0 1px 0 ${theme.colors.chromeBorder}`, pointerEvents: "none" }} />
        </div>
      </AbsoluteFill>
      <Caption text={project.doc.caption} frame={frame} />
    </AbsoluteFill>
  );
};
