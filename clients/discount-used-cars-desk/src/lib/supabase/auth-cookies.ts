import type { CookieOptions, CookieOptionsWithName } from "@supabase/ssr";

export const ADMIN_AUTH_COOKIE_DAYS = 90;
export const ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS =
  ADMIN_AUTH_COOKIE_DAYS * 24 * 60 * 60;

const isProduction = process.env.NODE_ENV === "production";

export const supabaseAuthCookieOptions: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  secure: isProduction,
  maxAge: ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS,
};

export function withAdminAuthCookiePersistence(
  options: CookieOptions,
  value: string,
): CookieOptions {
  const expiresAt =
    options.expires instanceof Date
      ? options.expires.getTime()
      : typeof options.expires === "string"
        ? Date.parse(options.expires)
        : null;
  const isClearingCookie =
    value === "" ||
    options.maxAge === 0 ||
    (typeof expiresAt === "number" && expiresAt <= Date.now());

  if (isClearingCookie) {
    return {
      ...options,
      path: options.path ?? "/",
    };
  }

  const persistentOptions = { ...options };
  delete persistentOptions.expires;

  return {
    ...persistentOptions,
    path: persistentOptions.path ?? "/",
    sameSite: persistentOptions.sameSite ?? "lax",
    secure: persistentOptions.secure ?? isProduction,
    maxAge: ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}
