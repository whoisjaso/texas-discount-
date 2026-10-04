/**
 * Deciding whether the camera is looking at something worth keeping.
 *
 * The point of this file is that the phone never asks the person to judge. No
 * shutter button, no "is that clear enough?" preview. The frame is measured,
 * and when it is good the photograph is taken on its own. When it is not, the
 * screen says the one thing that would fix it.
 *
 * Three signals, each cheap enough to run on every frame of a live preview:
 *
 *   luminance   mean brightness. Catches a card in shadow and a card under a
 *               ceiling light that has blown out the laminate.
 *   sharpness   mean absolute gradient. A card held still and in focus has hard
 *               edges everywhere: printed text, the border, the photograph. A
 *               moving or unfocused one has none.
 *   stability   the same frame twice. Sharpness alone fires on a single lucky
 *               frame mid-swing, so a run of good frames is required.
 *
 * The thresholds below are starting points chosen from the physics rather than
 * from a device lab: they are the values at which a 1080p phone frame of an
 * ID-1 card stops being readable. They are named and exported so they can be
 * tuned against real hardware without hunting through the component.
 */

/** ID-1, the bank-card and driver-licence size: 85.60mm x 53.98mm. */
export const CARD_ASPECT = 85.6 / 53.98;

/** Below this the card is in shadow and a reader will struggle. */
export const MIN_LUMINANCE = 45;
/** Above this the laminate has blown out and the print is gone. */
export const MAX_LUMINANCE = 232;
/** Below this the frame is moving, out of focus, or both. */
export const MIN_SHARPNESS = 9;
/** Consecutive good frames before a still is taken. At 12fps this is ~0.3s. */
export const STABLE_FRAMES = 4;

export type FrameMetrics = {
  /** Mean brightness, 0 to 255. */
  luminance: number;
  /** Mean absolute gradient. Higher is sharper. */
  sharpness: number;
};

/**
 * Measures one frame.
 *
 * Reads a subsampled grid rather than every pixel: a 1080p frame is two million
 * pixels and this runs many times a second on a phone that is also encoding
 * video. Every fourth pixel in each direction is sixteen times less work and
 * makes no difference to either statistic at this scale.
 */
export function measureFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step = 4,
): FrameMetrics {
  if (width < step * 2 || height < step * 2) {
    return { luminance: 0, sharpness: 0 };
  }

  const luma = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    // Rec. 601 luma. Integer coefficients keep this cheap in a hot loop.
    return (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  };

  let sum = 0;
  let gradient = 0;
  let samples = 0;
  let pairs = 0;

  for (let y = 0; y + step < height; y += step) {
    for (let x = 0; x + step < width; x += step) {
      const here = luma(x, y);
      sum += here;
      samples += 1;

      gradient += Math.abs(here - luma(x + step, y));
      gradient += Math.abs(here - luma(x, y + step));
      pairs += 2;
    }
  }

  if (samples === 0) return { luminance: 0, sharpness: 0 };
  return {
    luminance: sum / samples,
    sharpness: pairs === 0 ? 0 : gradient / pairs,
  };
}

export type Coaching = {
  /** True when this frame is worth keeping. */
  good: boolean;
  /**
   * What to say, or null when there is nothing useful to say. Null rather than
   * "looks good": a message that appears when everything is fine is noise, and
   * the screen advancing is the feedback.
   */
  hint: string | null;
};

/**
 * Turns measurements into the one sentence that would fix the frame.
 *
 * Only ever one. A phone screen listing three problems at once is a phone
 * screen nobody reads, and fixing the darkness usually fixes the sharpness too.
 * Ordered by which cause dominates: light first, because a reader cannot
 * recover from its absence and a person cannot tell a dark frame from a blurry
 * one by looking at their own screen.
 */
export function coachFrame(metrics: FrameMetrics): Coaching {
  if (metrics.luminance < MIN_LUMINANCE) {
    return { good: false, hint: "More light" };
  }
  if (metrics.luminance > MAX_LUMINANCE) {
    return { good: false, hint: "Too bright" };
  }
  if (metrics.sharpness < MIN_SHARPNESS) {
    return { good: false, hint: "Hold still" };
  }
  return { good: true, hint: null };
}

/**
 * Counts consecutive good frames.
 *
 * Kept as a pure reducer so the run-length rule is testable without a camera.
 * A single bad frame resets it, which is deliberate: the moment somebody starts
 * lowering the phone, the run breaks and no still is taken from the swing.
 */
export function advanceStreak(streak: number, good: boolean): number {
  return good ? streak + 1 : 0;
}

/** Whether a run of good frames is long enough to capture. */
export function shouldCapture(streak: number): boolean {
  return streak >= STABLE_FRAMES;
}

/**
 * Where the on-screen cutout actually lands in the camera's own frame.
 *
 * The preview is `object-fit: cover`, so the video is scaled up until it fills
 * the screen and the overflow is cropped evenly on the two long sides. That
 * means the rectangle a person sees is not the rectangle the sensor recorded,
 * and saving the whole sensor frame would file a photograph of a card adrift in
 * a large picture of a desk. It also has to be cropped to the card for the
 * exported ID to fill a sheet of paper rather than sit as a stamp in the middle
 * of one.
 *
 * Returns source-frame pixels, clamped so a rounding error at the edge cannot
 * ask for pixels outside the frame.
 */
export function cutoutInSource(
  source: { width: number; height: number },
  display: { width: number; height: number },
  cutout: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (source.width <= 0 || source.height <= 0 || display.width <= 0 || display.height <= 0) {
    return { x: 0, y: 0, width: Math.max(0, source.width), height: Math.max(0, source.height) };
  }

  // `cover` picks whichever scale makes the video cover both axes.
  const scale = Math.max(display.width / source.width, display.height / source.height);
  const width = Math.min(source.width, cutout.width / scale);
  const height = Math.min(source.height, cutout.height / scale);

  // The cutout is centred, and `cover` crops evenly, so the centres coincide.
  const x = Math.max(0, Math.round((source.width - width) / 2));
  const y = Math.max(0, Math.round((source.height - height) / 2));

  return {
    x,
    y,
    width: Math.round(Math.min(width, source.width - x)),
    height: Math.round(Math.min(height, source.height - y)),
  };
}
