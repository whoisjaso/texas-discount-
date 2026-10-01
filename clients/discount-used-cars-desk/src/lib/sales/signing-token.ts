import { createHmac, timingSafeEqual } from "node:crypto";
import { adminSigningSecret, SIGNING_SECRET_NAMES } from "@/lib/auth/signing-secret";

/**
 * The link the buyer opens to sign the packet.
 *
 * Server only, like the capture token it is modelled on: it reads a secret.
 *
 * Signed rather than stored, for the same reasons: nothing to write when a
 * link is issued, nothing to clean up when it expires, nothing to migrate on
 * a fork. The trade is that a token cannot be revoked before it expires, so
 * the window is short and the authority narrow: this token lets its holder
 * read the filed documents of ONE deal and put a signature on them. It
 * cannot change a document, cannot see any other deal, and cannot reach the
 * admin. Somebody who intercepts it can sign a sale they were handed the
 * iPad for, which is the same exposure as being handed the pen.
 */

const PURPOSE = "packet-signing";

/**
 * Twenty minutes. A buyer reading four documents at their own pace needs
 * longer than the licence capture's fifteen; a link that outlives the
 * afternoon is a standing invitation, and the desk can mint another with
 * one tap.
 */
export const SIGNING_TTL_MS = 20 * 60 * 1000;

function secret(): string {
  const value = adminSigningSecret();
  if (!value) {
    throw new Error(
      `A signing secret is required to issue a signing link. Set one of ${SIGNING_SECRET_NAMES.join(", ")}. See section 12 of docs/NEW_DEALERSHIP.md.`,
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueSigningToken(dealId: string, now: number = Date.now()): string {
  const expiresAt = now + SIGNING_TTL_MS;
  const payload = `${PURPOSE}.${dealId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export type SigningTokenResult =
  | { ok: true; dealId: string; expiresAt: number }
  | { ok: false; reason: "malformed" | "expired" | "bad-signature" };

/** Signature before expiry, so a forged token learns nothing from its date. */
export function verifySigningToken(
  token: string | null | undefined,
  now: number = Date.now(),
): SigningTokenResult {
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
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  if (now >= expiresAt) return { ok: false, reason: "expired" };

  return { ok: true, dealId, expiresAt };
}

/** The URL the QR code points at. */
export function signingUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/sign/packet/${encodeURIComponent(token)}`;
}
