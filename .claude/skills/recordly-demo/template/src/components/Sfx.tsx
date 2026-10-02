// Sound cues. A cue list is plain data: {frame, file, db}; shotCues() derives the cues a capture implies
// (clicks, one keyboard hit per typed character, a short whoosh on every zoom-in) from its cursor.json.
// Every cue plays at its own gain + theme.sfx.masterDb.
import React from "react";
import { Audio, random, Sequence, staticFile, useVideoConfig } from "remotion";
import { dbToGain, theme, toFrames } from "../theme";
import { ShotData } from "../lib/shot";

export type Cue = { frame: number; file: string; db: number; maxSec?: number };

export const Sfx: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={`${c.file}-${c.frame}-${i}`} from={Math.round(c.frame)} durationInFrames={c.maxSec ? Math.ceil(c.maxSec * fps) : undefined} layout="none">
          <Audio src={staticFile(c.file)} volume={dbToGain(c.db + theme.sfx.masterDb)} />
        </Sequence>
      ))}
    </>
  );
};

/** Frame (from the zoom's start) at which the zoom-in ease moves fastest. */
const peakVelocityFrame = (inFrames: number) => {
  const e = theme.recordly.zoomInEase;
  let best = 0;
  let bestV = -1;
  for (let i = 0; i < inFrames; i++) {
    const v = e((i + 1) / inFrames) - e(i / inFrames);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
};

/**
 * Cues implied by a capture, in scene frames (shot frame − trimFrames), limited to the scene. Clicks and taps lead
 * the visual slightly (early feels synced, late feels broken); a zoom's whoosh is placed so its loudest moment lands
 * just before the camera's fastest frame, and alternates between the whoosh variants.
 */
export const shotCues = (
  data: ShotData,
  {
    trimFrames = 0,
    durationInFrames = Infinity,
    zoomWhoosh = true,
    zoomIndexOffset = 0,
  }: { trimFrames?: number; durationInFrames?: number; zoomWhoosh?: boolean; /** zooms before this capture in the film (rotates the whoosh variants across captures) */ zoomIndexOffset?: number } = {},
): Cue[] => {
  const S = theme.sfx;
  const fps = data.fps;
  const cues: Cue[] = [];
  const inScene = (f: number) => f >= 0 && f < durationInFrames;
  for (const e of data.events) {
    const f0 = e.frame - trimFrames;
    if (e.type === "click" && inScene(f0 - toFrames(S.click.leadSec, fps))) cues.push({ frame: f0 - toFrames(S.click.leadSec, fps), file: S.click.file, db: S.click.db });
    if (e.type === "tap" && inScene(f0 - toFrames(S.tap.leadSec, fps))) cues.push({ frame: f0 - toFrames(S.tap.leadSec, fps), file: S.tap.file, db: S.tap.db });
    if (e.type === "type") {
      const f = f0 - toFrames(S.type.leadSec, fps);
      if (!inScene(f)) continue;
      const r = random(`key-${data.id}-${e.frame}`);
      const file = S.type.files[Math.floor(r * S.type.files.length)];
      const jitter = (random(`keydb-${data.id}-${e.frame}`) * 2 - 1) * S.type.jitterDb;
      cues.push({ frame: f, file, db: S.type.db + jitter });
    }
  }
  if (zoomWhoosh) {
    data.zooms.forEach((z, i) => {
      if (z.sfx === false) return;
      const f = z.startFrame - trimFrames + peakVelocityFrame(z.inFrames) - toFrames(S.zoomIn.peakSec, fps) - toFrames(S.zoomIn.leadSec, fps);
      const file = S.zoomIn.files[(i + zoomIndexOffset) % S.zoomIn.files.length];
      if (inScene(f)) cues.push({ frame: f, file, db: S.zoomIn.db, maxSec: S.zoomIn.maxSec });
    });
  }
  return cues.sort((a, b) => a.frame - b.frame);
};
