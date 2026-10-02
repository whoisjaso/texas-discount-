// The film: Intro sting ⇢ match cut onto the site's own loader in the macOS window → shots 1–4 in that one window
// (hard, pixel-matched cuts) → CUT POINT → part B, the sale desk, in the SAME window instance (B1–B5: hard jump-cuts on
// each click's navigation) → B6, the 130-U in a Preview window over the held desk → iPhone (shot 5; the desk and the
// document recede behind it, the phone drops away) → Outro (logo, the three facts, slow push, fade to black).
// Layers, bottom to top: backdrop (wallpaper + grade + vignette + grain, once, continuous) → scenes → intro sting →
// a whisper of grain over everything. The recordings themselves are never graded or vignetted.
import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toFrames } from "./theme";
import { project } from "./project";
import { Backdrop } from "./components/Wallpaper";
import { LogoSting } from "./components/LogoSting";
import { MatchSting, Rect } from "./components/MatchSting";
import { Cue, Sfx } from "./components/Sfx";
import { FadeOut, Finish } from "./components/Overlays";
import { windowLayout } from "./components/MacWindow";
import { DesktopScene, windowPoint, windowPose } from "./scenes/DesktopScene";
import { phoneBehindStyle, PhoneScene } from "./scenes/PhoneScene";
import { docBehind, DocScene } from "./scenes/DocScene";
import { buildTimeline, docWhooshAfter, partASegments, partBSegments, withCutClick } from "./demo/timeline";

export const demoTimeline = buildTimeline(partBSegments);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const LOADER = project.loader;
const [VW, VH] = LOADER.viewport;
/** the sting is the loader drawn this many times larger */
const STING_SCALE = project.stingMarkWidth / LOADER.mark[2];

/**
 * The intro sting and its hand-off. From handoffAt the window springs in and the sting shrinks onto the exact spot
 * where the loader's stage sits inside the (still moving) window; at landAt it covers the loader exactly and dissolves
 * into it. (Frames here are film frames: the sequence starts at 0.)
 */
const IntroSting: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const T = demoTimeline.intro;
  const { fps } = useVideoConfig();
  const w = theme.ease.inOut(clamp01((frame - T.handoffAt) / Math.max(1, T.landAt - T.handoffAt)));
  const win = windowPose(frame - T.handoffAt, fps, { enter: true });
  const centre: [number, number] = [LOADER.stage[0] + LOADER.stage[2] / 2, LOADER.stage[1] + LOADER.stage[3] / 2];
  const [tx, ty] = windowPoint(centre, win, VW, VH, width, height);
  const ds = windowLayout(VW, VH, width, height).contentW / VW;
  const landScale = (ds * win.scale) / STING_SCALE;
  const pose = {
    scale: Math.exp(Math.log(landScale) * w), // log-space: the shrink reads as one even move
    dx: (tx - width / 2) * w,
    dy: (ty - height / 2) * w,
  };
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
 * The last desktop sequence runs on under the phone: from `holdAt` it is held on its last frame and recedes with the
 * phone's entrance. The same instance stays mounted across the cut, so no capture is reloaded on the phone's first
 * frame (a fresh copy mounted there rendered one black frame).
 */
const HoldUnderPhone: React.FC<{ holdAt: number; phoneFrames: number; dissolveSec?: number; children: React.ReactNode }> = ({ holdAt, phoneFrames, dissolveSec = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const held = frame >= holdAt;
  const style = held ? phoneBehindStyle(frame - holdAt, fps, phoneFrames, true) : undefined;
  // with a part B the held desk and document dissolve to the wallpaper under the phone's entrance (the phone shows the
  // public site again, so a tax form behind it would read as a leftover)
  if (style && dissolveSec > 0) {
    const d = theme.ease.inOut(clamp01((frame - holdAt) / Math.max(1, toFrames(dissolveSec, fps))));
    style.opacity = (Number(style.opacity ?? 1) || 0) * (1 - d);
  }
  return (
    <AbsoluteFill style={style}>
      <Freeze frame={holdAt - 1} active={held}>
        {children}
      </Freeze>
    </AbsoluteFill>
  );
};

/** From `from` (while the 130-U is up) the desk behind it settles back, softens and dims. */
const BehindDoc: React.FC<{ from: number; active: boolean; children: React.ReactNode }> = ({ from, active, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!active || frame < from) return <AbsoluteFill>{children}</AbsoluteFill>;
  const b = docBehind(frame - from, fps, width, height);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={b.style}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: theme.colors.black, opacity: b.dim, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

/** The film's last frames fade to black. */
const FinalFade: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const F = Math.max(1, toFrames(theme.outro.fadeSec, fps));
  return <FadeOut progress={(frame - (durationInFrames - F)) / F} />;
};

export const Demo: React.FC = () => {
  const { fps } = useVideoConfig();
  const T = demoTimeline;
  const S = theme.sfx;
  const hasB = partBSegments.length > 0;
  // Part B plays in the same DesktopScene as part A (its segments carry the desk URL): no fresh scene mounts on the cut
  // frame, the window's pose and breathing run on, and the whoosh rotation continues.
  const segments = useMemo(() => (hasB ? [...withCutClick(partASegments), ...partBSegments] : partASegments), [hasB]);
  const deskFrames = T.desktopA.durationInFrames + T.desktopB.durationInFrames;
  // the desk (and the 130-U over it) run on under the phone, held on their last frame
  const holdAt = T.phone.from - T.desktopA.from;
  const lead = (s: number) => toFrames(s, fps);

  // storyboard.json → sfx.manual (film frames)
  const cues: Cue[] = [
    { frame: T.intro.from + 1, file: S.intro.file, db: S.intro.db }, // ios_note: the mark draws in
    { frame: T.desktopA.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db }, // open_ui: the window springs in
    { frame: T.phone.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db - 2 }, // open_ui −16 dB: the phone slides in
    { frame: T.outro.from + lead(theme.outro.linesDelaySec) - lead(S.click.leadSec), file: S.outro.file, db: S.outro.db }, // ios_received: the URL line
  ];
  if (T.doc.durationInFrames) {
    // B6: open_ui as the Preview window opens; a whoosh whose peak lands just before the push's fastest frame
    cues.push({ frame: T.doc.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db });
  }
  // B6's push whoosh is played by the DesktopScene, so its variant continues the rotation over the whooshes heard
  const whooshAfter = useMemo(() => docWhooshAfter(T), [T]);

  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Backdrop />

      {/* 1–4 · one macOS window: hero → scroll → we buy → menu (ends held on the Admin row). It springs in under the
          intro sting; the loader's logo is covered until the sting has landed on it.
          ‖ CUT POINT ‖ B1–B5 · the sale desk in the same window: sign-in → onboarding → Handle A Sale → the packet.
          B6 · the 130-U opens over the desk, which stays held on its last frame. */}
      <Sequence from={T.desktopA.from} durationInFrames={holdAt + T.phone.durationInFrames} name={hasB ? "1-4 + B1-B6 Desktop" : "1-4 Desktop"}>
        <HoldUnderPhone holdAt={holdAt} phoneFrames={T.phone.durationInFrames} dissolveSec={hasB ? theme.doc.phoneDissolveSec : 0}>
          <BehindDoc from={deskFrames} active={T.doc.durationInFrames > 0}>
            <DesktopScene
              segments={segments}
              url={project.domain}
              enter
              bare
              cover={{ rect: LOADER.cover as Rect, color: LOADER.coverColor, untilFrame: T.intro.landAt - T.desktopA.from }}
              whooshAfter={whooshAfter}
            />
          </BehindDoc>
          {T.doc.durationInFrames > 0 && (
            <Sequence from={deskFrames} durationInFrames={T.doc.durationInFrames} name="B6 130-U">
              <DocScene />
            </Sequence>
          )}
        </HoldUnderPhone>
      </Sequence>

      {/* 6 · Outro, drawn UNDER the phone: its logo comes up as the phone drops away */}
      <Sequence from={T.outro.from} durationInFrames={T.outro.durationInFrames} name="6 Outro">
        <LogoSting
          logo={project.logoReverse}
          logoWidth={theme.outro.logoWidth}
          lines={[...project.outroLines]}
          lineSizes={theme.outro.lineSizes}
          linesDelaySec={theme.outro.linesDelaySec}
          lineStaggerSec={theme.outro.lineStaggerSec}
          pushTo={theme.outro.pushTo}
          exitAt={T.outro.durationInFrames - toFrames(theme.outro.fadeSec, fps)}
          exitSec={theme.outro.exitSec}
        />
      </Sequence>

      {/* 5 · iPhone: the desktop recedes and blurs while the phone slides in; it drops out of frame at the end */}
      <Sequence from={T.phone.from} durationInFrames={T.phone.durationInFrames} name="5 Phone">
        <PhoneScene shot="5-phone" bare exit />
      </Sequence>

      {/* 0 · Intro sting, above the window it hands off to */}
      <Sequence from={T.intro.from} durationInFrames={T.intro.durationInFrames} name="0 Intro">
        <IntroSting />
      </Sequence>

      <Sfx cues={cues} />
      <Finish />
      <FinalFade />
    </AbsoluteFill>
  );
};
