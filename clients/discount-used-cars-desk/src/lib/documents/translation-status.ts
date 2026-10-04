/**
 * Whether the Spanish legal copy has been signed off for live use.
 *
 * The Spanish clauses in the acknowledgment documents are a translation of the
 * approved English text. They read naturally and the terminology is right, but
 * a buyer signs them and they create a real financial obligation — which is
 * why this flag existed as a block on Spanish e-signature and as an operator
 * caveat until somebody qualified read them.
 *
 * FLIPPED ON 28 August 2026 at the owner's direction, WITHOUT the
 * native-speaker/counsel review this flag was written to gate. That is the
 * owner's risk to accept and he accepted it explicitly; it is recorded here
 * so nobody later mistakes this for a completed review. The review is still
 * owed (TODOS.md, "Spanish Legal Text Review") — when it happens, whatever
 * it changes ships as ordinary copy edits, and this comment gets replaced
 * with the reviewer's name and date.
 */
export const SPANISH_LEGAL_REVIEWED = true;

/** Shown to the operator only — it never appears on the buyer's copy. */
export const SPANISH_REVIEW_CAVEAT_EN =
  "The Spanish wording below is a translation of the approved English text and has not been reviewed by a lawyer. Check with the buyer that it says what you mean before they sign.";

export const SPANISH_REVIEW_CAVEAT_ES =
  "El texto en español a continuación es una traducción del texto aprobado en inglés y no ha sido revisado por un abogado. Confirme con el comprador que dice lo que usted pretende antes de que firme.";

/**
 * Append the caveat to a Spanish admin banner while the review is outstanding.
 *
 * English banners are returned untouched — the English text is the approved
 * original, so there is nothing to caveat.
 */
export function withSpanishReviewCaveat(
  banner: string,
  language: "en" | "es",
): string {
  if (language !== "es" || SPANISH_LEGAL_REVIEWED) return banner;
  return `${banner} ${SPANISH_REVIEW_CAVEAT_ES}`;
}
