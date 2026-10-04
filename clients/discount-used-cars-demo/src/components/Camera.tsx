// The captured page inside the window, with Recordly-style zoom regions: depth, ~1.5 s ease-in-out in,
// ~1.0 s out, focus trails the target (and leans toward the cursor), clamped so the frame never shows past
// the page, light motion blur only while the camera moves.
import React from "react";
import { OffthreadVideo, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { cameraTransform, ShotData, useTracks } from "../lib/shot";

type Tracks = NonNullable<ReturnType<typeof useTracks>>;

export const cameraAt = (data: ShotData, tracks: Tracks, f: number, W: number, H: number) => {
  const n = data.frames.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(f)));
  const j = Math.max(0, i - 1);
  const { scale, focus } = tracks.camera;
  const t = cameraTransform(scale[i], focus[i], data.viewport.width, data.viewport.height, W, H);
  const p = cameraTransform(scale[j], focus[j], data.viewport.width, data.viewport.height, W, H);
  const speed = Math.hypot(t.tx - p.tx, t.ty - p.ty) + (Math.abs(t.s - p.s) * W) / 2;
  const R = theme.recordly;
  const blur = speed < 1.5 ? 0 : Math.min(R.maxBlurPx, speed * R.motionBlur * 0.1);
  return { ...t, blur, index: i };
};

export const CameraView: React.FC<{
  data: ShotData;
  tracks: Tracks;
  src: string;
  /** frames of the shot skipped before this scene starts */
  trimFrames?: number;
  width: number;
  height: number;
}> = ({ data, tracks, src, trimFrames = 0, width, height }) => {
  const frame = useCurrentFrame();
  const cam = cameraAt(data, tracks, frame + trimFrames, width, height);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transformOrigin: "0 0",
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
          filter: cam.blur > 0.05 ? `blur(${(cam.blur / cam.s).toFixed(3)}px)` : undefined,
        }}
      >
        <OffthreadVideo src={src} trimBefore={trimFrames} muted style={{ width, height, display: "block" }} />
      </div>
    </div>
  );
};
