// ============================================================
// Paperwork Pipeline - quiet premium feedback module
//
// Sound: compatibility no-op. Admin feedback stays silent by default.
// Haptic: navigator.vibrate patterns with graceful degradation.
//
// Usage:
//   Sound.setEnabled(true) - retained for old callers; audio remains off
//   Sound.stepComplete()   - retained for old callers; no tone is played
//   Haptic.setEnabled(true) - legacy global opt-in before vibration
//   Haptic.light({ enabled: true }) - one-shot premium pulse
// ============================================================

let soundEnabled = false;
let hapticEnabled = false;

type HapticOptions = {
  enabled?: boolean;
};

export const Sound = {
  init(): void {
    soundEnabled = false;
  },

  setEnabled(enabled: boolean): void {
    void enabled;
    soundEnabled = false;
  },

  isEnabled(): boolean {
    return soundEnabled;
  },

  stepComplete(): void {
    soundEnabled = false;
  },

  checkToggle(): void {
    soundEnabled = false;
  },

  uiClick(): void {
    soundEnabled = false;
  },

  blocked(): void {
    soundEnabled = false;
  },

  finalComplete(): void {
    soundEnabled = false;
  },
};

function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

function prefersQuietFeedback(): boolean {
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  return reducedMotion || saveData;
}

function vibrate(pattern: number | number[], options?: HapticOptions): void {
  const shouldVibrate = options?.enabled ?? hapticEnabled;
  if (!shouldVibrate || prefersQuietFeedback() || !isHapticSupported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers expose vibrate but reject calls. Feedback is optional.
  }
}

export const Haptic = {
  setEnabled(enabled: boolean): void {
    hapticEnabled = enabled;
  },

  isEnabled(): boolean {
    return hapticEnabled;
  },

  light(options?: HapticOptions): void {
    vibrate(5, options);
  },

  medium(options?: HapticOptions): void {
    vibrate(8, options);
  },

  success(options?: HapticOptions): void {
    vibrate(10, options);
  },

  /**
   * Two pulses. The only pattern in this vocabulary, and it is deliberate.
   *
   * Every other entry here confirms something the person just did, while they
   * are looking at the screen that did it, so a single quiet tap is plenty.
   * This one is for the opposite case: a machine finished on its own while
   * their eyes were somewhere else. Scanning a licence is exactly that. The
   * phone is held against the back of a card, the operator is looking at the
   * card and not the screen, and a five millisecond tap is indistinguishable
   * from having brushed the handset.
   *
   * The gap is what makes it read as a signal rather than a knock.
   */
  captured(options?: HapticOptions): void {
    vibrate([14, 70, 14], options);
  },

  warning(options?: HapticOptions): void {
    vibrate(12, options);
  },

  error(options?: HapticOptions): void {
    vibrate(14, options);
  },
};
