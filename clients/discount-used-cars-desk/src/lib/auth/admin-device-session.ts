import { adminSigningSecret } from "@/lib/auth/signing-secret";
import { ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS } from "@/lib/supabase/auth-cookies";

export const ADMIN_DEVICE_SESSION_COOKIE = "tj-admin-device-session";
export const ADMIN_DEVICE_SESSION_MAX_AGE_MS =
  ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS * 1000;

const isProduction = process.env.NODE_ENV === "production";

export const adminDeviceSessionCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: isProduction,
  maxAge: ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS,
};

function getSigningSecret(): string {
  // The list used to live here. It lives in one place now, because the capture
  // link had its own shorter copy and the two disagreeing is what took the
  // licence step down in production.
  return adminSigningSecret() ?? "";
}

async function signDeviceSession(payload: string): Promise<string | null> {
  const secret = getSigningSecret();
  if (!secret) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return bytesToBase64Url(new Uint8Array(signature));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * The device cookie, minted at every sign-in: `<issuedAtMs>.<userId>.<hmac>`.
 *
 * Bound to the account that signed in (owner's decision 10/02/2026; review of
 * the reset cutoff): its issue time is what tells a session that signed in
 * after a password reset from one that signed in before it, so a cookie
 * minted for one account must never vouch for another account's old session.
 * Every sign-in path passes the user id. The older two-part form
 * (`<issuedAtMs>.<hmac>`) is still read by the plain validity check, and by
 * the reset check only when no user id is asked about; every two-part cookie
 * was minted before this change, so before any reset this change records.
 */
export async function createAdminDeviceSessionCookie(userId?: string | null): Promise<string> {
  const issuedAt = Date.now().toString();
  const uid = typeof userId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(userId) ? userId : null;
  const payload = uid ? `${issuedAt}.${uid}` : issuedAt;
  const signature = await signDeviceSession(payload);
  if (!signature) {
    throw new Error("Admin device session signing secret is not configured.");
  }

  return `${payload}.${signature}`;
}

/** The cookie's parts, or null when it is not one of the two shapes. */
function deviceCookieParts(
  cookieValue: string,
): { issuedAtRaw: string; userId: string | null; payload: string; signature: string } | null {
  const parts = cookieValue.split(".");
  if (parts.length === 2) {
    const [issuedAtRaw, signature] = parts;
    if (!issuedAtRaw || !signature) return null;
    return { issuedAtRaw, userId: null, payload: issuedAtRaw, signature };
  }
  if (parts.length === 3) {
    const [issuedAtRaw, userId, signature] = parts;
    if (!issuedAtRaw || !userId || !signature) return null;
    return { issuedAtRaw, userId, payload: `${issuedAtRaw}.${userId}`, signature };
  }
  return null;
}

export async function isValidAdminDeviceSession(
  cookieValue?: string,
): Promise<boolean> {
  if (!cookieValue) return false;

  const parts = deviceCookieParts(cookieValue);
  if (!parts) return false;

  const issuedAt = Number(parts.issuedAtRaw);
  const now = Date.now();
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    issuedAt > now + 5 * 60 * 1000 ||
    now - issuedAt > ADMIN_DEVICE_SESSION_MAX_AGE_MS
  ) {
    return false;
  }

  const expectedSignature = await signDeviceSession(parts.payload);
  if (!expectedSignature) return false;

  return constantTimeEqual(parts.signature, expectedSignature);
}

/**
 * When this device signed in, in ms, read off a VALID device cookie, or null
 * when the cookie is missing, tampered with or expired. Read only when an
 * account has a password reset recorded (password-reset-cutoff.ts): the
 * cookie is minted by every sign-in path and by nothing else, so its issue
 * time is the device's sign-in time.
 *
 * With `userId`, a cookie bound to a different account gives null: a fresh
 * cookie from signing in to one account cannot carry another account's
 * pre-reset session past the cutoff.
 */
export async function adminDeviceSessionIssuedAt(
  cookieValue?: string | null,
  userId?: string | null,
): Promise<number | null> {
  if (!cookieValue) return null;
  if (!(await isValidAdminDeviceSession(cookieValue))) return null;
  const parts = deviceCookieParts(cookieValue);
  if (!parts) return null;
  if (userId && parts.userId !== null && parts.userId !== userId) return null;
  const issuedAt = Number(parts.issuedAtRaw);
  return Number.isFinite(issuedAt) && issuedAt > 0 ? issuedAt : null;
}
