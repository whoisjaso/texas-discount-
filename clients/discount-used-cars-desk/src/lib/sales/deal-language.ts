/**
 * The language the sale is conducted in, as a decision rather than a default.
 *
 * `deals.language` is NOT NULL DEFAULT 'en', so the column alone cannot say
 * "nobody has answered". The answer's evidence lives in `step_data` under
 * this key — who confirmed it and when — which keeps `done` computed from
 * the record like every other step, needs no migration, and survives a
 * licence upload because every writer merges its own key.
 *
 * Why it matters at all: FTC 455.5 requires the Spanish Buyers Guide and
 * contract disclosures on a Spanish-conducted sale, and Tex. Fin. Code
 * §348.006 keys the required notice to the language of the oral
 * presentation. A silently-defaulted "en" is not an answer to that question.
 * Deals from before this existed carry the bare default: they are treated
 * as unconfirmed for NEW documents only — nothing already signed is
 * re-questioned.
 */

export const LANGUAGE_CONFIRMED_KEY = "languageConfirmed";

export type DealLanguage = "en" | "es";

export type LanguageConfirmation = {
  value: DealLanguage;
  at: string;
  /** The auth user id of the person who answered. */
  by: string;
};

export function readLanguageConfirmation(
  stepData: unknown,
): LanguageConfirmation | null {
  if (!stepData || typeof stepData !== "object") return null;
  const raw = (stepData as Record<string, unknown>)[LANGUAGE_CONFIRMED_KEY];
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (entry.value !== "en" && entry.value !== "es") return null;
  if (typeof entry.at !== "string" || typeof entry.by !== "string") return null;
  return { value: entry.value, at: entry.at, by: entry.by };
}

export function isLanguageSettled(stepData: unknown): boolean {
  return readLanguageConfirmation(stepData) !== null;
}

/** The step_data patch that records the answer. Merged, never replacing. */
export function languageConfirmationPatch(
  value: DealLanguage,
  by: string,
): Record<string, unknown> {
  return {
    [LANGUAGE_CONFIRMED_KEY]: {
      value,
      at: new Date().toISOString(),
      by,
    } satisfies LanguageConfirmation,
  };
}
