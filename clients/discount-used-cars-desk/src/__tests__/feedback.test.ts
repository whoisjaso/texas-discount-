import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockConnect = vi.fn();
const mockFrequencySet = vi.fn();
const mockFrequencyRamp = vi.fn();
const mockGainSet = vi.fn();
const mockGainLinearRamp = vi.fn();
const mockGainRamp = vi.fn();
const mockFilterFrequencySet = vi.fn();
const mockFilterQSet = vi.fn();
const mockOscillator = {
  type: "sine" as OscillatorType,
  frequency: { setValueAtTime: mockFrequencySet, linearRampToValueAtTime: mockFrequencyRamp },
  connect: mockConnect,
  start: mockStart,
  stop: mockStop,
};
const mockFilter = {
  type: "lowpass" as BiquadFilterType,
  frequency: { setValueAtTime: mockFilterFrequencySet },
  Q: { setValueAtTime: mockFilterQSet },
  connect: mockConnect,
};

const mockAudioContext = {
  state: "running",
  currentTime: 0,
  destination: {},
  createOscillator: vi.fn().mockReturnValue(mockOscillator),
  createGain: vi.fn().mockReturnValue({
    gain: {
      setValueAtTime: mockGainSet,
      linearRampToValueAtTime: mockGainLinearRamp,
      exponentialRampToValueAtTime: mockGainRamp,
    },
    connect: mockConnect,
  }),
  createBiquadFilter: vi.fn().mockReturnValue(mockFilter),
  resume: vi.fn(),
};

function MockAudioContextCtor(this: object) {
  return Object.assign(this, mockAudioContext);
}

const mockVibrate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockOscillator.type = "sine";
  mockFilter.type = "lowpass";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: MockAudioContextCtor },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { vibrate: mockVibrate },
  });
});

describe("Sound", () => {
  it("is disabled by default and does not create oscillator feedback", async () => {
    const { Sound } = await import("@/lib/paperwork/feedback");

    expect(Sound.isEnabled()).toBe(false);
    Sound.init();
    Sound.stepComplete();
    Sound.checkToggle();
    Sound.uiClick();
    Sound.blocked();
    Sound.finalComplete();

    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
  });

  it("keeps the Sound API silent even after explicit opt-in", async () => {
    const { Sound } = await import("@/lib/paperwork/feedback");

    Sound.setEnabled(true);
    Sound.init();
    Sound.uiClick();
    Sound.stepComplete();
    Sound.checkToggle();
    Sound.blocked();
    Sound.finalComplete();

    expect(Sound.isEnabled()).toBe(false);
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    expect(mockAudioContext.createBiquadFilter).not.toHaveBeenCalled();
  });

  it("setEnabled(false) prevents later sounds from playing", async () => {
    const { Sound } = await import("@/lib/paperwork/feedback");

    Sound.setEnabled(true);
    Sound.stepComplete();
    const callsBefore = mockAudioContext.createOscillator.mock.calls.length;

    Sound.setEnabled(false);
    Sound.stepComplete();

    expect(Sound.isEnabled()).toBe(false);
    expect(mockAudioContext.createOscillator.mock.calls.length).toBe(callsBefore);
  });
});

describe("Haptic", () => {
  it("is disabled by default and does not vibrate", async () => {
    const { Haptic } = await import("@/lib/paperwork/feedback");

    expect(Haptic.isEnabled()).toBe(false);
    Haptic.light();
    Haptic.success();
    Haptic.warning();
    Haptic.error();

    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it("vibrates only after explicit opt-in", async () => {
    const { Haptic } = await import("@/lib/paperwork/feedback");

    Haptic.setEnabled(true);
    Haptic.success();

    expect(Haptic.isEnabled()).toBe(true);
    expect(mockVibrate).toHaveBeenCalledWith(10);
  });

  it("supports one-shot premium pulses without enabling global haptics", async () => {
    const { Haptic } = await import("@/lib/paperwork/feedback");

    Haptic.light({ enabled: true });
    Haptic.light();

    expect(Haptic.isEnabled()).toBe(false);
    expect(mockVibrate).toHaveBeenCalledTimes(1);
    expect(mockVibrate).toHaveBeenCalledWith(5);
  });

  it("respects reduced motion even when one-shot haptics are requested", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        AudioContext: MockAudioContextCtor,
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      },
    });
    const { Haptic } = await import("@/lib/paperwork/feedback");

    Haptic.light({ enabled: true });

    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it("respects data saver even when haptics are opted in", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { vibrate: mockVibrate, connection: { saveData: true } },
    });
    const { Haptic } = await import("@/lib/paperwork/feedback");

    Haptic.setEnabled(true);
    Haptic.medium();

    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it("silently catches rejected vibration calls", async () => {
    mockVibrate.mockImplementationOnce(() => {
      throw new Error("NotAllowedError");
    });
    const { Haptic } = await import("@/lib/paperwork/feedback");

    Haptic.setEnabled(true);

    expect(() => Haptic.error()).not.toThrow();
  });
});

describe("admin feedback policy", () => {
  it("keeps admin audio silent and haptics opt-in only", async () => {
    const {
      ADMIN_FEEDBACK_AUDIO_POLICY,
      ADMIN_FEEDBACK_HAPTIC_STORAGE_KEY,
      ADMIN_FEEDBACK_ON_VALUE,
      adminHapticsOptedIn,
    } = await import("@/lib/admin/feedback-policy");

    expect(ADMIN_FEEDBACK_AUDIO_POLICY).toBe("silent");
    expect(adminHapticsOptedIn({ getItem: () => null })).toBe(false);
    expect(
      adminHapticsOptedIn({
        getItem: (key) =>
          key === ADMIN_FEEDBACK_HAPTIC_STORAGE_KEY ? ADMIN_FEEDBACK_ON_VALUE : null,
      }),
    ).toBe(true);
  });
});
