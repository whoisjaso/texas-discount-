/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Module-level cache means we must reload the module between tests.
async function freshHook() {
  vi.resetModules();
  const mod = await import("@/hooks/useDeviceTier");
  return mod.useDeviceTier;
}

function mockMatchMedia(map: Record<string, boolean>) {
  return (q: string) => ({
    matches: Boolean(map[q]),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
}

describe("useDeviceTier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forces mobile tier when prefers-reduced-motion is set (even on desktop viewport)", async () => {
    setViewport(1920);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": true,
        "(pointer: coarse)": false,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("mobile");
  });

  it("returns mobile for narrow touch device (iPhone SE class)", async () => {
    setViewport(375);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": true,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("mobile");
  });

  it("returns tablet for wide touch device (iPad portrait class)", async () => {
    setViewport(820);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": true,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("tablet");
  });

  it("returns tablet for large touch device (iPad Pro class)", async () => {
    setViewport(1024);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": true,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("tablet");
  });

  it("returns desktop for wide fine-pointer device", async () => {
    setViewport(1440);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": false,
        "(pointer: fine)": true,
        "(hover: hover)": true,
        "(any-pointer: coarse)": false,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("desktop");
  });

  it("returns tablet for narrow fine-pointer window (resized browser)", async () => {
    setViewport(900);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": false,
        "(pointer: fine)": true,
        "(hover: hover)": true,
        "(any-pointer: coarse)": false,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("tablet");
  });

  it("returns mobile for narrow fine-pointer window (tiny dev tools)", async () => {
    setViewport(500);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": false,
        "(pointer: fine)": true,
        "(hover: hover)": true,
        "(any-pointer: coarse)": false,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("mobile");
  });

  it("returns tablet for wide hybrid touch device even with fine pointer", async () => {
    setViewport(1440);
    vi.stubGlobal(
      "matchMedia",
      mockMatchMedia({
        "(prefers-reduced-motion: reduce)": false,
        "(pointer: coarse)": false,
        "(pointer: fine)": true,
        "(hover: hover)": true,
        "(any-pointer: coarse)": true,
      })
    );
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    expect(result.current).toBe("tablet");
  });

  it("falls back to mobile when matchMedia is unavailable", async () => {
    setViewport(1920);
    vi.stubGlobal("matchMedia", undefined);
    const useDeviceTier = await freshHook();
    const { result } = renderHook(() => useDeviceTier());
    // Without matchMedia, cannot detect touch → fine-pointer branch → 1920px → desktop
    // BUT we also can't detect reduced-motion. Without touch signal, we fall through
    // to the fine-pointer branch. 1920 >= 1024 → desktop.
    expect(result.current).toBe("mobile");
  });
});
