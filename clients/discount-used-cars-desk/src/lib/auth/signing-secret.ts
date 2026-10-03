/**
 * The one answer to "what do we sign admin things with".
 *
 * There were two answers, and they disagreed. The admin device session read
 * `ADMIN_SESSION_SECRET`, then `INTERNAL_RENDER_TOKEN`, then `ADMIN_SECRET`,
 * and degraded quietly if it found none. The buyer-id capture link read
 * `ADMIN_SESSION_SECRET` alone and threw if it was missing. Its own comment
 * said that variable was "already required for the admin to work at all",
 * which was the mistake written down: the admin works on any of the three.
 *
 * On a deployment configured with one of the other two names, that difference
 * meant sign-in worked perfectly and the licence step of a live sale answered
 * "This page couldn't load. A server error occurred." Seen in production on a
 * phone, mid sale, error digest 2093187135.
 *
 * So both callers now ask here. Adding a name to this list is the only place
 * that has to know about it.
 */

/**
 * In order. The first one set wins, and the order is oldest-last so a
 * deployment that has since set the explicit name is not overridden by a
 * legacy one it never cleaned up.
 */
const NAMES = [
  "ADMIN_SESSION_SECRET",
  "INTERNAL_RENDER_TOKEN",
  "ADMIN_SECRET",
] as const;

/** Every name this project will accept, for an error message worth reading. */
export const SIGNING_SECRET_NAMES: readonly string[] = NAMES;

/**
 * The configured secret, or null when nothing is set.
 *
 * Null rather than a thrown error or a default. A default would make every
 * deployment's signatures forgeable by anyone who has read this file, and
 * throwing is a decision for the caller: signing a session is worth refusing
 * over, and signing an optional convenience link is worth doing without.
 */
export function adminSigningSecret(): string | null {
  for (const name of NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}
