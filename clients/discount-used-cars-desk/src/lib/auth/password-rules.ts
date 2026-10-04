/**
 * What a password chosen at this desk must be.
 *
 * One floor for both ways of choosing one: the emailed recovery link
 * (`completeRecovery`) and the first-sign-in "Choose A Password" screen that
 * replaces a temporary password (owner's decision 10/01/2026). The two must
 * never disagree about what a password is, so the number lives here and both
 * read it.
 *
 * Pure, so the server action, the screen and the tests share the rule.
 */

export const PASSWORD_MIN_LENGTH = 10;

export type NewPasswordProblem =
  | { code: "passwordTooShort"; min: number }
  | { code: "passwordMismatch" };

/**
 * Why a new password and its confirmation cannot be saved, or null when they
 * can. Nothing is trimmed: a space is a character the person typed.
 */
export function newPasswordProblem(password: unknown, confirmation: unknown): NewPasswordProblem | null {
  const typed = typeof password === "string" ? password : "";
  const again = typeof confirmation === "string" ? confirmation : "";
  if (typed.length < PASSWORD_MIN_LENGTH) return { code: "passwordTooShort", min: PASSWORD_MIN_LENGTH };
  if (typed !== again) return { code: "passwordMismatch" };
  return null;
}

/** The English sentence for a refused password (the action's `error`). */
export function newPasswordProblemSentence(problem: NewPasswordProblem): string {
  return problem.code === "passwordTooShort"
    ? `Use at least ${problem.min} characters.`
    : "The two passwords do not match. Type the same password in both boxes.";
}
