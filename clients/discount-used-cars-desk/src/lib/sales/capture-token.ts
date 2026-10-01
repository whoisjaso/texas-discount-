import { createHmac, timingSafeEqual } from "node:crypto";
import { adminSigningSecret, SIGNING_SECRET_NAMES } from "@/lib/auth/signing-secret";

/**
 * The link the phone opens to photograph a licence.
 *
 * Server only. It reads a secret, so importing it into a client component
 * would ship that secret to the browser.
 *
 * The token is signed rather than stored. Nothing is written to the database
 * when a link is issued and nothing has to be cleaned up when one expires,
 * which also means this works on a fork with no migration to run. The trade is
 * that a token cannot be revoked before it expires, so the window is short.
 *
 * What it authorises is deliberately narrow: attaching one photograph to one
 * deal. It is not a session. It cannot read the deal, cannot see the buyer, and
 * cannot touch any other record. Someone who intercepts the link can upload a
 * picture to a sale they already had physical access to, which is the same
 * exposure as being stood at the desk.
 *
 * The secret is whichever admin signing secret this deployment has set, read
 * through the one resolver that the admin session also uses. It used to read
 * `ADMIN_SESSION_SECRET` and nothing else, on the stated grounds that the name
 * was "already required for the admin to work at all". It was not: the admin
 * accepts two other names, and on a deployment using one of those, sign-in
 * worked while this threw and took the licence step of a live sale with it.
 */

const PURPOSE = "buyer-id-capture";

/**
 * Fifteen minutes. Long enough to find the phone, unlock it, and take a
 * picture with a customer standing there. Short enough that a link left open
 * in a browser tab is not a standing invitation, given it cannot be revoked.
 */
export const CAPTURE_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const value = adminSigningSecret();
  if (!value) {
    // Still refuses, and still should: a default secret would make every
    // deployment's links forgeable by anyone who has read this file. What
    // changed is that it now refuses only when nothing at all is configured,
    // and the caller catches it so a missing secret costs the phone handoff
    // rather than the whole screen.
    throw new Error(
      `A signing secret is required to issue a capture link. Set one of ${SIGNING_SECRET_NAMES.join(", ")}. See section 12 of docs/NEW_DEALERSHIP.md.`,
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * A token for one deal, valid until `expiresAt`.
 *
 * `now` is a parameter so the expiry logic can be tested without waiting or
 * stubbing the clock.
 */
export function issueCaptureToken(dealId: string, now: number = Date.now()): string {
  const expiresAt = now + CAPTURE_TTL_MS;
  const payload = `${PURPOSE}.${dealId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export type CaptureTokenResult =
  | { ok: true; dealId: string; expiresAt: number }
  | { ok: false; reason: "malformed" | "expired" | "bad-signature" };

/**
 * Verify a token and say which deal it is for.
 *
 * The order matters. The signature is checked before the expiry, so an
 * attacker cannot learn anything by editing the timestamp: a forged token is
 * rejected as forged whatever date it claims.
 */
export function verifyCaptureToken(
  token: string | null | undefined,
  now: number = Date.now(),
): CaptureTokenResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };

  const [purpose, dealId, expiresRaw, signature] = parts;
  if (purpose !== PURPOSE || !dealId) return { ok: false, reason: "malformed" };

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };

  const expected = sign(`${purpose}.${dealId}.${expiresRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length has to match before timingSafeEqual, which throws on a mismatch,
  // and comparing lengths first leaks only the length.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  if (now >= expiresAt) return { ok: false, reason: "expired" };

  return { ok: true, dealId, expiresAt };
}

/** The URL the QR code points at. */
export function captureUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/capture/${encodeURIComponent(token)}`;
}
