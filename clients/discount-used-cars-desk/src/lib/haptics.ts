import {
  ADMIN_FEEDBACK_HAPTIC_STORAGE_KEY,
  ADMIN_FEEDBACK_ON_VALUE,
} from "@/lib/admin/feedback-policy";
import { Haptic } from "@/lib/paperwork/feedback";

/**
 * The admin shell lets a dealer turn haptics off for their own handset. The
 * public site has no such switch and never needed one, so the preference is
 * only consulted on admin paths.
 */
function allowed(): boolean {
  if (typeof window === "undefined") return true;
  if (!window.location.pathname.startsWith("/admin")) return true;
  try {
    return window.localStorage.getItem(ADMIN_FEEDBACK_HAPTIC_STORAGE_KEY) === ADMIN_FEEDBACK_ON_VALUE;
  } catch {
    return false;
  }
}

/**
 * tapHaptic - quiet confirmation for primary mobile CTA taps.
 *
 * The public site and admin shell share the same feedback vocabulary:
 * no audio, no playful tones, and no scattered raw vibration calls.
 */
export function tapHaptic(duration = 5): void {
  if (!allowed()) return;

  const pulse = Math.min(Math.max(Math.round(duration), 5), 8);
  if (pulse <= 5) {
    Haptic.light({ enabled: true });
    return;
  }
  Haptic.medium({ enabled: true });
}

/**
 * capturedHaptic - a machine finished something while nobody was watching.
 *
 * Distinct from tapHaptic, and it has to be. A tap answers a finger that is
 * already on the glass, so five milliseconds under that finger is plenty.
 * This answers a scanner that decided on its own, held against the back of a
 * card, while the operator's eyes are on the card. At that distance a single
 * short pulse is indistinguishable from having knocked the handset.
 */
export function capturedHaptic(): void {
  if (!allowed()) return;
  Haptic.captured({ enabled: true });
}
