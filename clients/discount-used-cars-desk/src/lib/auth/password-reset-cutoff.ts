/**
 * A password reset signs out every device signed in before it (owner's
 * decision 10/02/2026; SOP Security, and "First sign-in: onboarding").
 *
 * When an owner resets a member's access, or re-issues a temporary password,
 * the account's app_metadata records the moment (`password_reset_at`, ISO).
 * From then on a session is accepted only if it signed in after that moment.
 * supabase-js has no sign-out by user id, so this check is the guarantee; the
 * local sign-out the SDK does offer is called as well, as a best effort.
 *
 * Two signals, read only when a reset is recorded:
 *
 *   the device cookie   `tj-admin-device-session`
 *                       (`<issuedAtMs>.<userId>.<hmac>`), minted by every
 *                       sign-in path and by nothing else, for the account
 *                       that signed in. Its issue time is the guarantee:
 *                       missing, invalid, bound to another account or issued
 *                       before the reset means signed out.
 *   amr                 the session's authentication times (getClaims). The
 *                       EARLIEST one, so a session that re-authenticated later
 *                       (a step-up) still counts from its first sign-in. It
 *                       only ever adds a refusal, with 3 seconds of clock skew;
 *                       when it cannot be read the device cookie decides.
 *
 * The JWT's `iat` is never used: a token refresh re-issues it, so an old
 * session would look new after its next refresh.
 *
 * Pure: the proxy, the current-admin check, the API guard, Choose A Password
 * and their tests share one rule.
 */

export const PASSWORD_RESET_AT_KEY = "password_reset_at";

/** Clock skew allowed between the auth server's amr time and this server's reset time. */
export const AMR_SKEW_MS = 3_000;

/** Where a session the reset ended is sent, with the one-line notice the login page shows. */
export const SIGNED_OUT_RESET_PATH = "/admin/login?notice=signed-out-reset";

export const SIGNED_OUT_RESET_MESSAGE = "Your password was reset, so this device was signed out. Sign in again.";

/** The API routes' 401 body. */
export const SIGNED_OUT_RESET_API_ERROR = "Signed out: the password was reset. Sign in again.";

/**
 * When the account's password was last reset, in ms, or null when none is
 * recorded. Only the service role writes app_metadata; a value nobody can read
 * as a time is treated as no reset rather than locking the account out for
 * good (an owner fixes it with the README's SQL).
 */
export function passwordResetAtMs(appMetadata: unknown): number | null {
  if (!appMetadata || typeof appMetadata !== "object") return null;
  const raw = (appMetadata as Record<string, unknown>)[PASSWORD_RESET_AT_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    /*
      Said out loud rather than passed over in silence: a hand-typed reset
      (the README's SQL) that is not a time signs nobody out, and the owner
      who typed it believes it did. The database's own check reads it the
      same way (private.session_predates_reset).
    */
    console.error(`[reset] app_metadata.${PASSWORD_RESET_AT_KEY} is not a time ("${raw.slice(0, 40)}"), so no device is signed out. Set it with the README's SQL.`);
    return null;
  }
  return ms;
}

/**
 * The earliest authentication time in a session's `amr` claim, in ms. GoTrue
 * writes `[{ method, timestamp }]` with the timestamp in seconds; the older
 * string form (`["password"]`) carries no time and gives null.
 */
export function earliestAuthenticationMs(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let earliest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const seconds = Number((entry as { timestamp?: unknown }).timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const ms = seconds * 1000;
    if (earliest === null || ms < earliest) earliest = ms;
  }
  return earliest;
}

/**
 * Whether this session signed in before the account's last reset.
 *
 * No reset recorded: never. A reset recorded: when the device cookie is
 * missing or invalid (null), was issued before the reset, or the session's
 * earliest authentication is older than the reset beyond the skew.
 */
export function sessionPredatesReset(input: {
  resetAtMs: number | null;
  deviceIssuedAtMs: number | null;
  authenticatedAtMs?: number | null;
}): boolean {
  const { resetAtMs, deviceIssuedAtMs, authenticatedAtMs = null } = input;
  if (resetAtMs === null) return false;
  if (deviceIssuedAtMs === null || !Number.isFinite(deviceIssuedAtMs)) return true;
  if (deviceIssuedAtMs < resetAtMs) return true;
  if (authenticatedAtMs !== null && Number.isFinite(authenticatedAtMs) && authenticatedAtMs < resetAtMs - AMR_SKEW_MS) {
    return true;
  }
  return false;
}

/**
 * The preview's own sign-in time cookie (`tj-local-admin-signed-in`, ms), which
 * stands in for the device cookie there. Null when missing or not a time.
 */
export function previewSignedInAtMs(value: string | null | undefined): number | null {
  const raw = value?.trim();
  if (!raw || !/^\d{10,16}$/.test(raw)) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
