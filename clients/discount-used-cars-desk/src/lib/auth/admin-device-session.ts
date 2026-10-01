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

export async function createAdminDeviceSessionCookie(): Promise<string> {
  const issuedAt = Date.now().toString();
  const signature = await signDeviceSession(issuedAt);
  if (!signature) {
    throw new Error("Admin device session signing secret is not configured.");
  }

  return `${issuedAt}.${signature}`;
}

export async function isValidAdminDeviceSession(
  cookieValue?: string,
): Promise<boolean> {
  if (!cookieValue) return false;

  const [issuedAtRaw, signature] = cookieValue.split(".");
  if (!issuedAtRaw || !signature) return false;

  const issuedAt = Number(issuedAtRaw);
  const now = Date.now();
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    issuedAt > now + 5 * 60 * 1000 ||
    now - issuedAt > ADMIN_DEVICE_SESSION_MAX_AGE_MS
  ) {
    return false;
  }

  const expectedSignature = await signDeviceSession(issuedAtRaw);
  if (!expectedSignature) return false;

  return constantTimeEqual(signature, expectedSignature);
}
