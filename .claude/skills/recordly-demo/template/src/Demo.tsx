// The film: Intro sting ⇢ match cut onto the site's own loader in the macOS window → shots 1–4 in that one window
// (hard, pixel-matched cuts) → CUT POINT (part B) → iPhone (shot 5; the desktop recedes behind it, the phone drops
// away) → Outro (logo, the three facts, slow push, fade to black).
// Layers, bottom to top: backdrop (wallpaper + grade + vignette + grain, once, continuous) → scenes → intro sting →
// a whisper of grain over everything. The recordings themselves are never graded or vignetted.
import React from "react";
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
import { buildTimeline, partASegments, partBSegments } from "./demo/timeline";

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
const HoldUnderPhone: React.FC<{ holdAt: number; phoneFrames: number; children: React.ReactNode }> = ({ holdAt, phoneFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const held = frame >= holdAt;
  return (
    <AbsoluteFill style={held ? phoneBehindStyle(frame - holdAt, fps, phoneFrames, true) : undefined}>
      <Freeze frame={holdAt - 1} active={held}>
        {children}
      </Freeze>
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
  const urlB = project.partBDomain ?? project.domain;
  // the last desktop sequence (B if there is one) runs on under the phone
  const underA = hasB ? 0 : T.phone.durationInFrames;
  const underB = hasB ? T.phone.durationInFrames : 0;
  const lead = (s: number) => toFrames(s, fps);

  // storyboard.json → sfx.manual (film frames)
  const cues: Cue[] = [
    { frame: T.intro.from + 1, file: S.intro.file, db: S.intro.db }, // ios_note: the mark draws in
    { frame: T.desktopA.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db }, // open_ui: the window springs in
    { frame: T.phone.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db - 2 }, // open_ui −16 dB: the phone slides in
    { frame: T.outro.from + lead(theme.outro.linesDelaySec) - lead(S.click.leadSec), file: S.outro.file, db: S.outro.db }, // ios_received: the URL line
  ];

  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Backdrop />

      {/* 1–4 · one macOS window: hero → scroll → we buy → menu (ends held on the Admin row). It springs in under the
          intro sting; the loader's logo is covered until the sting has landed on it. */}
      <Sequence from={T.desktopA.from} durationInFrames={T.desktopA.durationInFrames + underA} name="1-4 Desktop">
        <HoldUnderPhone holdAt={underA ? T.desktopA.durationInFrames : Infinity} phoneFrames={T.phone.durationInFrames}>
          <DesktopScene
            segments={partASegments}
            url={project.domain}
            enter
            bare
            cover={{ rect: LOADER.cover as Rect, color: LOADER.coverColor, untilFrame: T.intro.landAt - T.desktopA.from }}
          />
        </HoldUnderPhone>
      </Sequence>

      {/* ‖ CUT POINT ‖ part B (sale desk) slots in here, in the same window */}
      {hasB && (
        <Sequence from={T.desktopB.from} durationInFrames={T.desktopB.durationInFrames + underB} name="Part B Desk">
          <HoldUnderPhone holdAt={T.desktopB.durationInFrames} phoneFrames={T.phone.durationInFrames}>
            <DesktopScene segments={partBSegments} url={urlB} bare />
          </HoldUnderPhone>
        </Sequence>
      )}

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
