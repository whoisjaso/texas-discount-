export const ADMIN_FEEDBACK_AUDIO_POLICY = "silent";
export const ADMIN_FEEDBACK_HAPTIC_STORAGE_KEY = "tj-admin-feedback-haptic";
export const ADMIN_FEEDBACK_ON_VALUE = "on";
export const ADMIN_FEEDBACK_CONFIRM_SELECTOR = "[data-admin-feedback='confirm']";
export const ADMIN_FEEDBACK_SILENT_SELECTOR = "[data-admin-silent-feedback='true']";
export const ADMIN_FEEDBACK_CONFIRM_DEBOUNCE_MS = 220;
export const ADMIN_FEEDBACK_CLICK_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "[role='button']",
].join(",");

export function adminHapticsOptedIn(storage?: Pick<Storage, "getItem"> | null): boolean {
  const source =
    storage ??
    (typeof window !== "undefined" ? window.localStorage : null);

  try {
    return source?.getItem(ADMIN_FEEDBACK_HAPTIC_STORAGE_KEY) === ADMIN_FEEDBACK_ON_VALUE;
  } catch {
    return false;
  }
}
