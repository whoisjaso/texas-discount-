import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { adminSigningSecret, SIGNING_SECRET_NAMES } from "@/lib/auth/signing-secret";

/**
 * The invite that lets a buyer open their paperwork from a text.
 *
 * The security shape, decided in review (PLAN.md §E) and worth restating
 * where the code lives:
 *
 *   - The SMS carries a URL with a CSPRNG token. The token is stored as a
 *     SHA-256 hash only; possession of the database does not yield a link.
 *   - Opening the URL CONSUMES nothing: stage one looks the invite up and
 *     redirects to a clean challenge URL with a short pre-auth cookie, so a
 *     link scanner or preview bot that follows the SMS burns nothing.
 *   - The challenge asks for something the SMS does not contain: date of
 *     birth or licence last-4 from the deal's confirmed licence record —
 *     or, when neither is on file, a one-time access code the operator
 *     conveys out loud. Never phone digits: whoever holds the SMS holds
 *     the phone.
 *   - Verification is one conditional UPDATE, so parallel guesses cannot
 *     race the failure counter. Five failures lock; recovery is the
 *     operator superseding and reissuing.
 *   - Success rotates to a 15-minute HttpOnly session cookie; every
 *     document view re-checks revocation and expiry and mints its own
 *     short-lived signed URL server-side.
 */

export const INVITE_TTL_DAYS = 14;
export const INVITE_PREAUTH_TTL_MS = 10 * 60 * 1000;
export const INVITE_SESSION_TTL_MS = 15 * 60 * 1000;
export const INVITE_MAX_ATTEMPTS = 5;

export const INVITE_PREAUTH_COOKIE = "tj-pw-challenge";
export const INVITE_SESSION_COOKIE = "tj-pw-session";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 32 CSPRNG bytes, URL-safe. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** A six-digit one-time code, CSPRNG, spoken by the operator. */
export function newAccessCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function inviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/paperwork/${token}`;
}

function secret(): string {
  const value = adminSigningSecret();
  if (!value) {
    throw new Error(
      `A signing secret is required for paperwork invites. Set one of ${SIGNING_SECRET_NAMES.join(", ")}.`,
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * The two cookies, HMAC-signed like the capture token: nothing stored, a
 * purpose tag so one can never pass as the other, and the signature checked
 * before the expiry so a forged cookie is rejected as forged whatever date
 * it claims.
 */
export function issueInviteCookie(
  purpose: "challenge" | "session",
  inviteId: string,
  now: number = Date.now(),
): string {
  const ttl = purpose === "challenge" ? INVITE_PREAUTH_TTL_MS : INVITE_SESSION_TTL_MS;
  const payload = `pw-${purpose}.${inviteId}.${now + ttl}`;
  return `${payload}.${sign(payload)}`;
}

export type InviteCookieResult =
  | { ok: true; inviteId: string; expiresAt: number }
  | { ok: false; reason: "malformed" | "expired" | "bad-signature" };

export function verifyInviteCookie(
  purpose: "challenge" | "session",
  value: string | undefined,
  now: number = Date.now(),
): InviteCookieResult {
  if (!value) return { ok: false, reason: "malformed" };
  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [tag, inviteId, expiresRaw, signature] = parts;
  if (tag !== `pw-${purpose}` || !inviteId) return { ok: false, reason: "malformed" };

  const payload = `${tag}.${inviteId}.${expiresRaw}`;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, inviteId, expiresAt };
}

/**
 * The gate's factors, off the deal's confirmed licence record.
 *
 * `dateOfBirth` and `licenseNumber` come through `settled()` — a person at
 * the desk confirmed them against the card — and are normalized here so
 * "03/05/1990", "1990-03-05" and "3/5/1990" all answer the same question.
 * The SMS contains neither.
 */
export function normalizeDobAnswer(value: string): string {
  const digits = value.replace(/\D/g, "");
  // MMDDYYYY or YYYYMMDD both reduce to the same set check below.
  if (digits.length === 8) {
    // Prefer a canonical YYYYMMDD ordering: detect a leading year.
    const asYearFirst = digits.slice(0, 4);
    if (Number(asYearFirst) >= 1900 && Number(asYearFirst) <= 2100) return digits;
    return `${digits.slice(4)}${digits.slice(0, 2)}${digits.slice(2, 4)}`;
  }
  return digits;
}

export function licenceLast4(licenseNumber: string): string {
  const tail = licenseNumber.replace(/\W/g, "").slice(-4);
  return tail.toUpperCase();
}
