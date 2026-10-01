// Sound cues. A cue list is plain data: {frame, file, db}; shotCues() derives the cues a capture implies
// (clicks, one keyboard hit per typed character, a short whoosh on every zoom-in) from its cursor.json.
import React from "react";
import { Audio, random, Sequence, staticFile, useVideoConfig } from "remotion";
import { dbToGain, theme } from "../theme";
import { ShotData } from "../lib/shot";

export type Cue = { frame: number; file: string; db: number; maxSec?: number };

export const Sfx: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={`${c.file}-${c.frame}-${i}`} from={Math.round(c.frame)} durationInFrames={c.maxSec ? Math.ceil(c.maxSec * fps) : undefined} layout="none">
          <Audio src={staticFile(c.file)} volume={dbToGain(c.db)} />
        </Sequence>
      ))}
    </>
  );
};

/**
 * Cues implied by a capture, in scene frames (shot frame − trimFrames), limited to the scene.
 * SFX lead the visual by `lead` frames (early feels synced, late feels broken).
 */
export const shotCues = (
  data: ShotData,
  { trimFrames = 0, durationInFrames = Infinity, zoomWhoosh = true, lead = 1 }: { trimFrames?: number; durationInFrames?: number; zoomWhoosh?: boolean; lead?: number } = {},
): Cue[] => {
  const S = theme.sfx;
  const cues: Cue[] = [];
  const inScene = (f: number) => f >= 0 && f < durationInFrames;
  for (const e of data.events) {
    const f = e.frame - trimFrames - lead;
    if (!inScene(f)) continue;
    if (e.type === "click") cues.push({ frame: f, file: S.click.file, db: S.click.db });
    if (e.type === "tap") cues.push({ frame: f, file: S.tap.file, db: S.tap.db });
    if (e.type === "type") {
      const r = random(`key-${data.id}-${e.frame}`);
      const file = S.type.files[Math.floor(r * S.type.files.length)];
      const jitter = (random(`keydb-${data.id}-${e.frame}`) * 2 - 1) * S.type.jitterDb;
      cues.push({ frame: e.frame - trimFrames, file, db: S.type.db + jitter });
    }
  }
  if (zoomWhoosh) {
    for (const z of data.zooms) {
      if (z.sfx === false) continue;
      const f = z.startFrame - trimFrames - 2;
      if (inScene(f)) cues.push({ frame: f, file: S.zoomIn.file, db: S.zoomIn.db, maxSec: S.zoomIn.maxSec });
    }
  }
  return cues.sort((a, b) => a.frame - b.frame);
};
