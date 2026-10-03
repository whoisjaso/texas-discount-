/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tapHaptic } from "@/lib/haptics";

describe("tapHaptic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the shared quiet light pulse by default", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    tapHaptic();
    expect(vibrate).toHaveBeenCalledWith(5);
  });

  it("caps stronger CTA pulses at the shared quiet medium pulse", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    tapHaptic(25);
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("is a silent no-op when vibrate is absent", () => {
    // biome-ignore lint/performance/noDelete: test cleanup
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    expect(() => tapHaptic()).not.toThrow();
  });

  it("silently catches errors from vibrate()", () => {
    const vibrate = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    expect(() => tapHaptic()).not.toThrow();
    expect(vibrate).toHaveBeenCalled();
  });

  it("stays silent on admin routes until the haptic key is explicitly enabled", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    window.history.pushState({}, "", "/admin/rentals");
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    tapHaptic();

    expect(vibrate).not.toHaveBeenCalled();
  });
});
