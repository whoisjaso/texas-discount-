/**
 * The provider the sign-in screen offers, and where it sends the
 * browser back. Plain values, importable from anywhere; the server action
 * that starts the dance lives in `@/lib/actions/oauth`.
 */
export const OAUTH_PROVIDERS = ["google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_CALLBACK_PATH = "/admin/auth/callback";

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "google";
}
