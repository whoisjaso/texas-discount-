import { SPANISH_LEGAL_REVIEWED } from "@/lib/documents/translation-status";

/**
 * The one shared guard on Spanish e-signature, called from BOTH signing
 * paths — the corridor's finalize action and the public completion endpoint —
 * so neither can drift from the other.
 *
 * The repo's own compliance review (docs/COMPLIANCE_REVIEW.md §10.1) is the
 * authority: "Block live Spanish-language e-sign until the review is done."
 * While `SPANISH_LEGAL_REVIEWED` is false, a Spanish-conducted deal may not
 * capture an electronic signature; the print-for-ink path with the operator
 * caveat remains, which is how these sales are lawfully conducted today.
 * Flipping the flag after counsel review lifts this everywhere at once.
 *
 * The language checked is the STORED deal/agreement language — never a
 * caller-supplied value, which the completion endpoint used to accept.
 */
export function spanishEsignBlocked(
  storedLanguage: string | null | undefined,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false; // ink path: file unsigned and print
  if (storedLanguage !== "es") return false;
  return !SPANISH_LEGAL_REVIEWED;
}

/** Operator-facing reason, in both languages, keyed for the client. */
export const SPANISH_ESIGN_BLOCKED_CODE = "spanishEsignBlocked" as const;
