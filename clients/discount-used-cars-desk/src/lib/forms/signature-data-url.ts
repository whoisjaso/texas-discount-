/**
 * What counts as a signature image, decided in exactly one place.
 *
 * Two actions accept a drawn signature: the dedicated signature screen and the
 * onboarding form a new hire fills out on day one. Both must refuse the same
 * things for the same reasons, or the pad a person drew on decides which rules
 * apply to them. This module is pure on purpose: no server imports, no client
 * imports, so either side can call it and a test can call it directly.
 */

/** The pad exports PNG and only PNG. Anything else did not come from the pad. */
export const SIGNATURE_PNG_PREFIX = "data:image/png;base64,";

/**
 * A finger-drawn PNG off a phone canvas lands around 8KB to 40KB. 200,000
 * characters is roughly 150KB of image, which is generous for a signature and
 * still small enough that a row stays a row. Anything past it is refused rather
 * than truncated: half a base64 string is not a smaller signature, it is a
 * broken one that would fail silently at the moment a document is drawn.
 */
export const SIGNATURE_MAX_CHARS = 200_000;

/**
 * Returns what is wrong with the value as a sentence a person can act on, or
 * null when the value is a signature the row may keep. Callers trim before
 * asking, and the trimmed value is the one they store.
 */
export function signatureDataUrlProblem(value: string): string | null {
  if (!value.startsWith(SIGNATURE_PNG_PREFIX)) {
    return "That is not a signature image. Draw it on the pad and save again.";
  }

  if (value.length > SIGNATURE_MAX_CHARS) {
    return "That signature is too large to keep. Clear the pad and sign it again in fewer strokes.";
  }

  return null;
}
