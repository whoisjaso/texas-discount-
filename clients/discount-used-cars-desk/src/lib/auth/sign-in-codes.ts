import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * One-time codes, the arithmetic.
 *
 * Six digits, emailed, typed back. Two things use them: signing in without
 * a password ("Email me a code" on the login screen) and proving an address
 * belongs to the person requesting team access. Everything here is pure so
 * the rules can be tested without a database or a mailbox; the server
 * action in `@/lib/actions/sign-in-code` owns the rows and the sending.
 *
 * What the record keeps, and what it never keeps: the row stores an HMAC of
 * the code keyed on the admin signing secret, plus a fingerprint of the
 * address. A stolen table yields neither a code nor an email. The code
 * itself lives in exactly one place, the email, for ten minutes.
 *
 * Five wrong guesses lock the code. A six-digit space is a million codes,
 * so five guesses is a one-in-two-hundred-thousand chance per issued code,
 * and a new code cannot be issued faster than once a minute per address.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
/** A fresh code for the same address no more often than this. */
export const REISSUE_SECONDS = 60;

export type CodePurpose = "sign_in" | "verify_email";

export function isCodePurpose(value: unknown): value is CodePurpose {
  return value === "sign_in" || value === "verify_email";
}

/** A code from the CSPRNG, zero-padded, never derived from anything. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** What a person typed, reduced to its digits; "" when it cannot be a code. */
export function normalizeCode(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length === CODE_LENGTH ? digits : "";
}

/** "482913" reads as "482 913" on a screen and in an email. */
export function formatCodeForDisplay(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** The address, lower-cased and hashed: enough to find the row, never to read it. */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * The HMAC the row stores. Keyed on the deployment's signing secret and
 * bound to the address and the purpose, so a code issued to one address
 * for one thing can never be replayed for another.
 */
export function codeHash(email: string, purpose: CodePurpose, code: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${purpose}\n${email.trim().toLowerCase()}\n${code}`)
    .digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export type CodeRow = {
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
};

export type CodeState = "open" | "expired" | "consumed" | "locked";

/** Whether a stored code may still be tried, and if not, why. */
export function codeState(row: CodeRow, now: Date = new Date()): CodeState {
  if (row.consumed_at) return "consumed";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "open";
}

/** When a code issued now stops working. */
export function expiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString();
}

/**
 * The business key for the outbox claim: one email per address, purpose
 * and minute. A second request inside the minute finds the claim and
 * sends nothing, which is the rate limit.
 */
export function codeBusinessKey(email: string, purpose: CodePurpose, now: Date = new Date()): string {
  const minute = Math.floor(now.getTime() / (REISSUE_SECONDS * 1000));
  return `code/${purpose}/${emailFingerprint(email)}/${minute}`;
}

/** What a person is told, whatever happened, so an address cannot be probed. */
export function neutralSentMessage(identifier: string): string {
  // Says how it travels, never whether the person exists. A number that is
  // not on the roster gets this same sentence, and no text.
  const byText = !identifier.includes("@") && !/[a-z]/i.test(identifier);
  const route = byText ? "by text" : "by email";
  return `If ${identifier.trim()} is on the team, a six-digit code is on its way ${route}. It works for ${CODE_TTL_MINUTES} minutes.`;
}
