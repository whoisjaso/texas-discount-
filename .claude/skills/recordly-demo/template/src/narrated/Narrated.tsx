// The narrated long cut ("Narrated"): the approved film's look, sounds and shots, lengthened into a guided tour of the
// sale desk that follows a voice-over (the house script filled for this client: narration/script.md and lines.json).
// House code: identical for every client (recordly-demo template). The running order and the voice's placement are the
// client's src/narrated/plan.ts (examples/discount-used-cars/plan.ts is the worked one); this file draws them:
//   backdrop → outro (drawn under the desk, revealed as the desk dissolves away at the end) → one macOS window holding
//   every desktop segment (DesktopScene, parts A and the desk; holds keep a frame still under an overlay) with the
//   overlays' "behind" treatment → the documents (NarratedDoc) and the phone (NarratedPhone) → the intro sting →
//   the voice → the film's own sounds, ducked 6 dB while the voice speaks → grain → the final fade.
// The Demo composition (src/Demo.tsx) is untouched by this file.
import React, { useCallback, useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "../theme";
import { project } from "../project";
import { Backdrop } from "../components/Wallpaper";
import { LogoSting } from "../components/LogoSting";
import { MatchSting, Rect } from "../components/MatchSting";
import { Cue, Sfx } from "../components/Sfx";
import { FadeOut, Finish } from "../components/Overlays";
import { windowLayout } from "../components/MacWindow";
import { peakVelocityFrame } from "../components/Sfx";
import { DesktopScene, windowPoint, windowPose } from "../scenes/DesktopScene";
import { narratedPlan, NarratedPlan, Overlay } from "./plan";
import { docOpenClose, NarratedDoc } from "./NarratedDoc";
import { NarratedPhone } from "./NarratedPhone";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const LOADER = project.loader;
const [VW, VH] = LOADER.viewport;
const STING_SCALE = project.stingMarkWidth / LOADER.mark[2];

/** effects under the voice sit this much lower (the voice speaks over them, it never fights them) */
export const DUCK_DB = -6;

/** dB to add to an effect that starts at film frame f: DUCK_DB while a line is speaking (plus a short margin) */
export const duckAt = (P: NarratedPlan, f: number, fps: number) => {
  const m = toFrames(0.12, fps);
  return P.lines.some((l) => f >= l.from - m && f < l.from + l.durationInFrames + m) ? DUCK_DB : 0;
};

/** The intro sting and its hand-off onto the loader inside the springing window (Demo.tsx's, on this plan's frames). */
const IntroSting: React.FC<{ T: NarratedPlan["intro"] }> = ({ T }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const w = theme.ease.inOut(clamp01((frame - T.handoffAt) / Math.max(1, T.landAt - T.handoffAt)));
  const win = windowPose(frame - T.handoffAt, fps, { enter: true });
  const centre: [number, number] = [LOADER.stage[0] + LOADER.stage[2] / 2, LOADER.stage[1] + LOADER.stage[3] / 2];
  const [tx, ty] = windowPoint(centre, win, VW, VH, width, height);
  const ds = windowLayout(VW, VH, width, height).contentW / VW;
  const landScale = (ds * win.scale) / STING_SCALE;
  const pose = { scale: Math.exp(Math.log(landScale) * w), dx: (tx - width / 2) * w, dy: (ty - height / 2) * w };
  const opacity = 1 - theme.ease.inOut(clamp01((frame - T.landAt) / Math.max(1, T.fadeFrames)));
  return (
    <MatchSting
      mark={project.mark}
      word={project.word}
      loader={{ stage: LOADER.stage as Rect, mark: LOADER.mark as Rect, word: LOADER.word as Rect, wordFont: LOADER.wordFont }}
      scale={STING_SCALE}
      pose={pose}
      opacity={opacity}
      handoff={w}
    />
  );
};

/**
 * The desk under the overlays: while a document is open it settles back, softens and dims (B6's treatment, released
 * when the window closes); while the phone is up it recedes further (the phone cut's treatment, released as the phone
 * drops away). At the very end everything dissolves to the wallpaper over the outro.
 */
const DeskLayer: React.FC<{ P: NarratedPlan; children: React.ReactNode }> = ({ P, children }) => {
  const frame = useCurrentFrame(); // film frames (this layer is not in a Sequence)
  const { fps } = useVideoConfig();
  let scale = 1;
  let blur = 0;
  let dim = 0;
  let opacity = 1;
  for (const o of P.overlays) {
    const f = frame - o.from;
    if (f < 0 || f > o.durationInFrames + toFrames(0.6, fps)) continue;
    if (o.phone) {
      const e = spring({ frame: f, fps, config: theme.spring.window });
      const exitF = toFrames(theme.phone.exitSec, fps);
      const x = interpolate(f, [o.durationInFrames - exitF, o.durationInFrames - 1], [0, 1], { easing: theme.ease.inOut, ...CLAMP });
      const k = Math.min(1, e) * (1 - x);
      scale *= 1 - 0.1 * k;
      blur = Math.max(blur, 10 * k);
      opacity *= 1 - 0.5 * k;
    } else if (o.docs) {
      const first = o.docs[0];
      const { e, x } = docOpenClose({ ...first, closeAt: Math.max(...o.docs.map((d) => d.closeAt)) }, f, fps);
      const k = clamp01(e) * (1 - x);
      scale *= 1 - (1 - theme.doc.behind.scale) * k;
      blur = Math.max(blur, theme.doc.behind.blurPx * k);
      dim = Math.max(dim, theme.doc.behind.dim * k);
    }
  }
  const end = P.deskEnd;
  const fade = toFrames(0.5, fps);
  opacity *= 1 - theme.ease.inOut(clamp01((frame - (end - fade)) / fade));
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined }}>{children}</AbsoluteFill>
      {dim > 0.001 ? <AbsoluteFill style={{ background: theme.colors.black, opacity: dim }} /> : null}
    </AbsoluteFill>
  );
};

const FinalFade: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const F = Math.max(1, toFrames(theme.outro.fadeSec, fps));
  return <FadeOut progress={(frame - (durationInFrames - F)) / F} />;
};

/** the doc overlays' sounds: open_ui as each window opens, a whoosh peaking with each push's fastest frame */
export const docCues = (o: Overlay, fps: number): Cue[] => {
  const S = theme.sfx;
  const out: Cue[] = [];
  let i = 0;
  for (const d of o.docs ?? []) {
    out.push({ frame: o.from + toFrames(d.openAt, fps) - toFrames(S.open.leadSec, fps), file: S.open.file, db: S.open.db });
    for (const k of d.keys) {
      const inF = toFrames(k.dur ?? theme.recordly.zoomInSec, fps);
      out.push({
        frame: o.from + toFrames(k.at, fps) + peakVelocityFrame(inF) - toFrames(S.zoomIn.peakSec, fps) - toFrames(S.zoomIn.leadSec, fps),
        file: S.zoomIn.files[i++ % S.zoomIn.files.length],
        db: S.zoomIn.db,
        maxSec: S.zoomIn.maxSec,
      });
    }
  }
  return out;
};

/** the film's own cues outside the window and the phone (before ducking): the intro, the window's open, the outro, the documents */
export const filmCues = (P: NarratedPlan, fps: number): Cue[] => {
  const S = theme.sfx;
  return [
    { frame: P.intro.from + 1, file: S.intro.file, db: S.intro.db },
    { frame: P.deskFrom - toFrames(S.open.leadSec, fps), file: S.open.file, db: S.open.db },
    { frame: P.outro.from + toFrames(theme.outro.linesDelaySec, fps) - toFrames(S.click.leadSec, fps), file: S.outro.file, db: S.outro.db },
    ...P.overlays.flatMap((o) => docCues(o, fps)),
  ];
};

export const Narrated: React.FC = () => {
  const { fps } = useVideoConfig();
  const P = narratedPlan;
  const duck = useCallback((f: number) => duckAt(P, f, fps), [P, fps]);
  const deskDuck = useCallback((sceneFrame: number) => duck(sceneFrame + P.deskFrom), [duck, P.deskFrom]);
  const cues = useMemo(() => filmCues(P, fps).map((c) => ({ ...c, db: c.db + duck(c.frame) })), [P, fps, duck]);

  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Backdrop />

      <Sequence from={P.outro.from} durationInFrames={P.outro.durationInFrames} name="Outro">
        <LogoSting
          logo={project.logoReverse}
          logoWidth={theme.outro.logoWidth}
          lines={[...project.outroLines]}
          lineSizes={theme.outro.lineSizes}
          linesDelaySec={theme.outro.linesDelaySec}
          lineStaggerSec={theme.outro.lineStaggerSec}
          pushTo={theme.outro.pushTo}
          exitAt={P.outro.durationInFrames - toFrames(theme.outro.fadeSec, fps)}
          exitSec={theme.outro.exitSec}
        />
      </Sequence>

      <DeskLayer P={P}>
        <Sequence from={P.deskFrom} durationInFrames={P.deskEnd - P.deskFrom} name="Desktop: site and sale desk">
          <DesktopScene
            segments={P.segments}
            url={project.domain}
            enter
            bare
            cover={{ rect: LOADER.cover as Rect, color: LOADER.coverColor, untilFrame: P.intro.landAt - P.deskFrom }}
            duckDb={deskDuck}
          />
        </Sequence>
      </DeskLayer>

      {/* the documents fade with the desk at the end (doc C) */}
      <DocsLayer P={P} />

      {P.overlays
        .filter((o) => o.phone)
        .map((o) => (
          <Sequence key={o.key} from={o.from} durationInFrames={o.durationInFrames} name="Phone: the buyer signs">
            <NarratedPhone spec={o.phone!} duckDb={(f) => duck(f + o.from)} />
          </Sequence>
        ))}

      <Sequence from={P.intro.from} durationInFrames={P.intro.durationInFrames} name="Intro">
        <IntroSting T={P.intro} />
      </Sequence>

      {P.lines.map((l) => (
        <Sequence key={l.id} from={l.from} durationInFrames={l.durationInFrames} name={`VO ${l.id}`} layout="none">
          <Audio src={staticFile(`vo/${l.id}.wav`)} />
        </Sequence>
      ))}

      <Sfx cues={cues} />
      <Finish />
      <FinalFade />
    </AbsoluteFill>
  );
};

const DocsLayer: React.FC<{ P: NarratedPlan }> = ({ P }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = toFrames(0.5, fps);
  const opacity = 1 - theme.ease.inOut(clamp01((frame - (P.deskEnd - fade)) / fade));
  return (
    <AbsoluteFill style={{ opacity }}>
      {P.overlays
        .filter((o) => o.docs)
        .map((o) => (
          <Sequence key={o.key} from={o.from} durationInFrames={o.durationInFrames} name={`Doc ${o.key}`}>
            {o.docs!.map((d, i) => (
              <NarratedDoc key={i} spec={d} />
            ))}
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
