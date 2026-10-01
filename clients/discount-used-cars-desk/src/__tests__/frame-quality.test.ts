import { describe, expect, it } from "vitest";
import {
  CARD_ASPECT,
  MIN_SHARPNESS,
  STABLE_FRAMES,
  advanceStreak,
  coachFrame,
  measureFrame,
  shouldCapture,
} from "@/lib/sales/frame-quality";

/**
 * The frame measurements the phone uses instead of a shutter button.
 *
 * Synthetic frames rather than photographs, because what is being tested is the
 * arithmetic and the ordering of the advice, not a camera.
 */

const W = 64;
const H = 64;

/** A frame of one flat colour: bright or dark, and with no edges at all. */
function flat(value: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return data;
}

/** A frame of hard stripes: mid brightness, and edges everywhere. */
function striped(low: number, high: number, period = 8): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const value = Math.floor(x / period) % 2 === 0 ? low : high;
      const i = (y * W + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("measuring a frame", () => {
  it("reads brightness off a flat frame", () => {
    expect(measureFrame(flat(0), W, H).luminance).toBeCloseTo(0, 0);
    expect(measureFrame(flat(128), W, H).luminance).toBeCloseTo(128, 0);
    expect(measureFrame(flat(255), W, H).luminance).toBeCloseTo(255, 0);
  });

  it("reports no sharpness for a frame with no edges", () => {
    // A phone pointed at a blank wall, or a card so far out of focus that it
    // has become one. Nothing here is worth photographing.
    expect(measureFrame(flat(128), W, H).sharpness).toBe(0);
  });

  it("reports sharpness where there are edges", () => {
    const sharp = measureFrame(striped(20, 235), W, H);
    expect(sharp.sharpness).toBeGreaterThan(MIN_SHARPNESS);
  });

  it("rates a low-contrast frame as less sharp than a high-contrast one", () => {
    // This is the blur test. Defocus does not remove edges, it softens them,
    // so the measure has to fall with contrast rather than only with count.
    const crisp = measureFrame(striped(20, 235), W, H).sharpness;
    const soft = measureFrame(striped(118, 138), W, H).sharpness;
    expect(soft).toBeLessThan(crisp);
    expect(soft).toBeLessThan(MIN_SHARPNESS);
  });

  it("returns zeroes rather than dividing by nothing on a tiny frame", () => {
    expect(measureFrame(new Uint8ClampedArray(4), 1, 1)).toEqual({
      luminance: 0,
      sharpness: 0,
    });
  });
});

describe("what the screen says", () => {
  it("asks for light before it asks for stillness", () => {
    // A dark frame is also an unsharp one, and a person cannot tell those apart
    // by looking at their own screen. Naming the cause beats naming the symptom.
    const darkAndSoft = measureFrame(flat(10), W, H);
    expect(coachFrame(darkAndSoft).hint).toBe("More light");
  });

  it("says nothing when the frame is good", () => {
    // Silence is the signal. A message that appears when everything is fine is
    // noise, and the screen moving on is the feedback.
    const good = coachFrame(measureFrame(striped(20, 235), W, H));
    expect(good.good).toBe(true);
    expect(good.hint).toBeNull();
  });

  it("names a blown-out frame rather than calling it blurry", () => {
    expect(coachFrame({ luminance: 250, sharpness: 40 }).hint).toBe("Too bright");
  });

  it("asks for stillness when the light is fine and the edges are not", () => {
    expect(coachFrame({ luminance: 140, sharpness: 1 }).hint).toBe("Hold still");
  });

  it("offers one instruction at a time, never a list", () => {
    const hint = coachFrame({ luminance: 5, sharpness: 0 }).hint;
    expect(hint).not.toContain(",");
    expect(hint?.split(" ").length).toBeLessThanOrEqual(3);
  });
});

describe("waiting for a run of good frames", () => {
  it("does not capture from a single lucky frame", () => {
    expect(shouldCapture(advanceStreak(0, true))).toBe(false);
  });

  it("captures once the run is long enough", () => {
    let streak = 0;
    for (let i = 0; i < STABLE_FRAMES; i += 1) streak = advanceStreak(streak, true);
    expect(shouldCapture(streak)).toBe(true);
  });

  it("resets the moment one frame goes bad", () => {
    // Somebody starting to lower the phone breaks the run, so no still is taken
    // from the swing.
    let streak = 0;
    for (let i = 0; i < STABLE_FRAMES; i += 1) streak = advanceStreak(streak, true);
    streak = advanceStreak(streak, false);
    expect(streak).toBe(0);
    expect(shouldCapture(streak)).toBe(false);
  });
});

describe("the cutout", () => {
  it("is the real card shape, not a guess", () => {
    // ID-1: 85.60mm x 53.98mm. A cutout at the wrong ratio teaches people to
    // frame the card wrongly, which costs a retake every time.
    expect(CARD_ASPECT).toBeCloseTo(1.586, 3);
  });
});

describe("mapping the cutout back into the camera frame", () => {
  it("crops to the card rather than filing the whole sensor frame", async () => {
    const { cutoutInSource } = await import("@/lib/sales/frame-quality");
    // A landscape 1920x1080 sensor shown in a 390x844 portrait screen: cover
    // scales by height (844/1080), so the visible width is far narrower than
    // the sensor's. A cutout 335px wide on screen is 335/scale in source px.
    const rect = cutoutInSource(
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
      { width: 335, height: 211 },
    );
    const scale = 844 / 1080;
    expect(rect.width).toBe(Math.round(335 / scale));
    expect(rect.height).toBe(Math.round(211 / scale));
    // Centred, because cover crops evenly and the cutout is centred.
    expect(rect.x).toBe(Math.round((1920 - 335 / scale) / 2));
  });

  it("never asks for pixels outside the frame", async () => {
    const { cutoutInSource } = await import("@/lib/sales/frame-quality");
    const rect = cutoutInSource(
      { width: 640, height: 480 },
      { width: 390, height: 844 },
      { width: 9000, height: 9000 },
    );
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(640);
    expect(rect.y + rect.height).toBeLessThanOrEqual(480);
  });

  it("falls back to the whole frame rather than dividing by zero", async () => {
    const { cutoutInSource } = await import("@/lib/sales/frame-quality");
    expect(
      cutoutInSource({ width: 640, height: 480 }, { width: 0, height: 0 }, { width: 10, height: 10 }),
    ).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
});
