// The buyer signs on their own phone (narrated cut): the iPhone slides in over the held desk (the desk recedes), plays
// the signing ceremony as a few ranges of two phone captures (26-phone-sign: Begin, the bill of sale read and signed;
// 26b-phone-sign: the 130-U signed, Sign And Finish, All Signed.) joined by jump-cuts, holds on All Signed., then drops
// out of frame. The captures used a pointer (the pad needs a pen), so their clicks are drawn as taps and the pen as the
// finger; where a sheet was scrolled by script (an inner scroller), a finger flick is drawn. Sounds: taps, the
// felt-tip under each stroke, ios_success on All Signed.
import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, interpolate, OffthreadVideo, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { ShotData, ShotEvent, shotFile, useShotsData } from "../lib/shot";
import { IPhone, iphoneLayout } from "../components/IPhone";
import { TapRipple } from "../components/TapRipple";
import { Cue, Sfx } from "../components/Sfx";
import type { PhoneSpec } from "./plan";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** a phone capture as the composition draws it: clicks become taps, flicks become a touch drag */
export const asTouch = (d: ShotData, flicks: PhoneSpec["flicks"]): ShotData => {
  const frames = d.frames.map((f) => ({ ...f }));
  const events: ShotEvent[] = d.events.map((e) => (e.type === "click" ? ({ ...e, type: "tap" } as ShotEvent) : e));
  for (const [shot, at, n, x, y0, y1] of flicks) {
    if (shot !== d.id) continue;
    events.push({ frame: at, endFrame: at + n, type: "touch", x, y: y0 });
    for (let i = 0; i <= n; i++) {
      const f = frames[at + i];
      if (!f) continue;
      const u = theme.ease.inOut(i / n);
      frames[at + i] = { ...f, x: x + 6 * u, y: y0 + (y1 - y0) * u, down: i < n };
    }
  }
  events.sort((a, b) => a.frame - b.frame);
  return { ...d, frames, events };
};

/** the parts laid end to end: [shot, first, last exclusive, overlay frame where the part starts] */
export const phoneParts = (spec: PhoneSpec) => {
  let at = 0;
  return spec.parts.map(([shot, a, b]) => {
    const p = { shot, a, b, start: at };
    at += b - a;
    return p;
  });
};

/**
 * The phone's sounds, in overlay frames, before ducking (data: the phone shots as touch, in first-use order):
 * open_ui as it slides in, a tap per tap, the felt-tip under each stroke, ios_success on All Signed. (the receipt
 * paints 7 frames after the last part's Sign And Finish tap).
 */
export const phoneCues = (spec: PhoneSpec, data: ShotData[], fps: number): Cue[] => {
  const S = theme.sfx;
  const plan = phoneParts(spec);
  const ids = [...new Set(spec.parts.map((p) => p[0]))];
  const out: Cue[] = [{ frame: -toFrames(S.open.leadSec, fps), file: S.open.file, db: S.open.db - 2 }];
  plan.forEach((p) => {
    const d = data[ids.indexOf(p.shot)];
    for (const e of d.events) {
      if (e.frame < p.a || e.frame >= p.b) continue;
      const f = p.start + e.frame - p.a;
      if (e.type === "tap") out.push({ frame: f - toFrames(S.tap.leadSec, fps), file: S.tap.file, db: S.tap.db });
      if (e.type === "draw") for (const [a, b] of e.strokes) if (a >= p.a && a < p.b) out.push({ frame: p.start + a - p.a, file: S.pen.file, db: S.pen.db, maxSec: (Math.min(b, p.b) - a) / fps, fadeSec: S.pen.fadeSec });
    }
  });
  const last = plan[plan.length - 1];
  const dl = data[ids.indexOf(last.shot)];
  const fin = dl.events.filter((e) => e.type === "tap" && e.frame >= last.a && e.frame < last.b).pop();
  if (fin) out.push({ frame: last.start + fin.frame - last.a + 7, file: S.success.file, db: S.success.db });
  return out;
};

/** where the phone is at a frame of the overlay: entrance spring, idle float, accelerating drop over the last exitSec */
export const phonePose = (frame: number, fps: number, durationInFrames: number, width: number, height: number, phoneH: number) => {
  const e = spring({ frame, fps, config: theme.spring.window });
  const exitF = Math.max(1, toFrames(theme.phone.exitSec, fps));
  const x = interpolate(frame, [durationInFrames - exitF, durationInFrames - 1], [0, 1], { easing: theme.ease.in, ...CLAMP });
  return {
    e,
    x,
    tx: interpolate(e, [0, 1], [width * 0.45, 0]),
    ty: x * (height * 0.5 + phoneH),
    rot: interpolate(e, [0, 1], [7, 0]) - 5 * x,
    scale: interpolate(Math.min(1, e), [0, 1], [0.92, 1], CLAMP) * (1 - 0.04 * x),
  };
};

export const NarratedPhone: React.FC<{ spec: PhoneSpec; duckDb?: (frame: number) => number }> = ({ spec, duckDb }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const ids = useMemo(() => [...new Set(spec.parts.map((p) => p[0]))], [spec]);
  const raw = useShotsData(ids);
  const data = useMemo(() => (raw ? raw.map((d) => asTouch(d, spec.flicks)) : null), [raw, spec]);

  // overlay frame -> [part index, capture frame]
  const plan = useMemo(() => phoneParts(spec), [spec]);
  const partsEnd = plan.length ? plan[plan.length - 1].start + (plan[plan.length - 1].b - plan[plan.length - 1].a) : 0;

  const cues = useMemo(
    () => (data ? phoneCues(spec, data, fps).map((c) => ({ ...c, db: c.db + (duckDb ? duckDb(c.frame) : 0) })) : ([] as Cue[])),
    [data, spec, fps, duckDb],
  );

  if (!data) return null;
  const k0 = 960;
  const L = iphoneLayout(k0);
  const pf = Math.min(frame, partsEnd - 1);
  let pi = 0;
  plan.forEach((p, i) => {
    if (pf >= p.start) pi = i;
  });
  const part = plan[pi];
  const capFrame = part.a + (pf - part.start);
  const d = data[ids.indexOf(part.shot)];
  const kk = L.pageWidth / d.viewport.width;
  const now = phonePose(frame, fps, durationInFrames, width, height, L.height);
  const prev = phonePose(frame - 1, fps, durationInFrames, width, height, L.height);
  const speed = Math.hypot(now.tx - prev.tx, now.ty - prev.ty);
  const blur = Math.min(theme.phone.maxMotionBlurPx, speed * 0.06);
  const opacity = interpolate(frame, [0, Math.max(1, toFrames(theme.phone.enterOpaqueSec, fps))], [0, 1], CLAMP);
  const float = Math.sin((2 * Math.PI * frame) / (theme.phone.floatPeriodSec * fps)) * theme.phone.floatPx;
  const edges = d.screenEdges;
  const fi = Math.max(0, Math.min(d.frames.length - 1, capFrame));
  return (
    <AbsoluteFill>
      <IPhone
        k={L.k}
        topColor={edges?.top[fi]}
        bottomColor={edges?.bottom[fi]}
        style={{
          left: width / 2 - L.width / 2,
          top: (height - L.height) / 2 + float,
          opacity,
          transform: `translate(${now.tx}px, ${now.ty}px) rotate(${now.rot}deg) scale(${now.scale})`,
          filter: blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        <div style={{ position: "relative", width: L.pageWidth, height: L.pageHeight }}>
          {ids.map((id) => (
            <div key={id} style={{ position: "absolute", inset: 0, opacity: id === part.shot ? 1 : 0 }}>
              <Freeze frame={id === part.shot ? capFrame : plan.find((p) => p.shot === id)!.a}>
                <OffthreadVideo src={shotFile(id)} muted style={{ width: L.pageWidth, height: L.pageHeight, objectFit: "cover", objectPosition: "top", display: "block" }} />
              </Freeze>
            </div>
          ))}
          <Freeze frame={capFrame}>
            <TapRipple data={d} k={kk} />
          </Freeze>
        </div>
      </IPhone>
      <Sfx cues={cues} />
    </AbsoluteFill>
  );
};
