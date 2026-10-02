// The film: Intro sting (⇢ match cut onto the site's own loader when project.loader is set) → desktop captures in one
// macOS window (hard, pixel-matched cuts) → CUT POINT (part B) → iPhone (the desktop recedes behind it, the phone drops
// away) → Outro (logo, confirmed facts, slow push, fade to black).
// Layers, bottom to top: backdrop (wallpaper + grade + vignette + grain, once, continuous) → scenes → intro sting →
// a whisper of grain over everything. The recordings themselves are never graded or vignetted.
// The running order lives in src/demo/timeline.ts.
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
import { buildTimeline, partASegments, partBSegments, phoneShot } from "./demo/timeline";

export const demoTimeline = buildTimeline(partBSegments);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Match cut: from handoffAt the sting shrinks onto where the loader sits in the springing window, lands, dissolves. */
const IntroSting: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const T = demoTimeline.intro;
  const L = project.loader;
  if (!L) {
    return <LogoSting mark={project.mark} markWidth={project.stingMarkWidth} word={project.word} exitAt={T.handoffAt} exitSec={theme.sting.exitSec} />;
  }
  const [VW, VH] = L.viewport;
  const k = project.stingMarkWidth / L.mark[2];
  const w = theme.ease.inOut(clamp01((frame - T.handoffAt) / Math.max(1, T.landAt - T.handoffAt)));
  const win = windowPose(frame - T.handoffAt, fps, { enter: true });
  const [tx, ty] = windowPoint([L.stage[0] + L.stage[2] / 2, L.stage[1] + L.stage[3] / 2], win, VW, VH, width, height);
  const landScale = ((windowLayout(VW, VH, width, height).contentW / VW) * win.scale) / k;
  const pose = { scale: Math.exp(Math.log(landScale) * w), dx: (tx - width / 2) * w, dy: (ty - height / 2) * w };
  const opacity = 1 - theme.ease.inOut(clamp01((frame - T.landAt) / Math.max(1, T.fadeFrames)));
  return (
    <MatchSting
      mark={project.mark}
      word={project.word}
      loader={{ stage: L.stage as Rect, mark: L.mark as Rect, word: L.word as Rect, wordFont: L.wordFont }}
      scale={k}
      pose={pose}
      opacity={opacity}
      handoff={w}
    />
  );
};

/**
 * The last desktop sequence runs on under the phone: from `holdAt` it is held on its last frame and recedes with the
 * phone's entrance. The same instance stays mounted across the cut, so no capture is reloaded on the phone's first
 * frame (a fresh copy mounted there rendered one black frame in a full render).
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
  const hasA = partASegments.length > 0;
  const hasB = partBSegments.length > 0;
  const urlB = project.partBDomain ?? project.domain;
  // the last desktop sequence (B if there is one) runs on under the phone
  const under = phoneShot ? T.phone.durationInFrames : 0;
  const underA = hasB ? 0 : under;
  const underB = hasB ? under : 0;
  const lead = (s: number) => toFrames(s, fps);
  const L = project.loader;

  const cues: Cue[] = [
    { frame: T.intro.from + 1, file: S.intro.file, db: S.intro.db }, // ios_note: the mark draws in
    ...(hasA ? [{ frame: T.desktopA.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db }] : []), // open_ui: window
    ...(phoneShot ? [{ frame: T.phone.from - lead(S.open.leadSec), file: S.open.file, db: S.open.db - 2 }] : []), // phone
    { frame: T.outro.from + lead(theme.outro.linesDelaySec) - lead(S.click.leadSec), file: S.outro.file, db: S.outro.db }, // outro lines
  ];

  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Backdrop />
      {hasA && (
        <Sequence from={T.desktopA.from} durationInFrames={T.desktopA.durationInFrames + underA} name="Desktop">
          <HoldUnderPhone holdAt={underA ? T.desktopA.durationInFrames : Infinity} phoneFrames={T.phone.durationInFrames}>
            <DesktopScene
              segments={partASegments}
              url={project.domain}
              enter
              bare
              cover={L ? { rect: L.cover as Rect, color: L.coverColor, untilFrame: T.intro.landAt - T.desktopA.from } : undefined}
            />
          </HoldUnderPhone>
        </Sequence>
      )}
      {hasB && (
        <Sequence from={T.desktopB.from} durationInFrames={T.desktopB.durationInFrames + underB} name="Part B">
          <HoldUnderPhone holdAt={underB ? T.desktopB.durationInFrames : Infinity} phoneFrames={T.phone.durationInFrames}>
            <DesktopScene segments={partBSegments} url={urlB} bare />
          </HoldUnderPhone>
        </Sequence>
      )}
      <Sequence from={T.outro.from} durationInFrames={T.outro.durationInFrames} name="Outro">
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
      {phoneShot && T.phone.durationInFrames > 0 && (
        <Sequence from={T.phone.from} durationInFrames={T.phone.durationInFrames} name="Phone">
          <PhoneScene shot={phoneShot} bare exit />
        </Sequence>
      )}
      <Sequence from={T.intro.from} durationInFrames={T.intro.durationInFrames} name="Intro">
        <IntroSting />
      </Sequence>
      <Sfx cues={cues} />
      <Finish />
      <FinalFade />
    </AbsoluteFill>
  );
};
