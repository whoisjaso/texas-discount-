import "server-only";

import { cookies } from "next/headers";
import type { HomeLanguage } from "@/lib/admin/language";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";

/**
 * Which language this operator reads the corridor in, resolved on the server.
 *
 * Two sources, one precedence, stated once:
 *
 *   1. The `tj-admin-lang` cookie, when it belongs to the signed-in person.
 *      It is a temporary optimistic override: the toggle writes it
 *      synchronously in the click handler (`document.cookie`), so the very
 *      next render is right even when the profile write is still in flight.
 *   2. The member's own `team_members.language_preference` row.
 *   3. English.
 *
 * The cookie carries the auth user id it was written for, and a cookie
 * written for anybody else is ignored: a shared front-desk computer must not
 * let one operator's tap follow the next operator into their session. No
 * clocks are compared anywhere — a matching cookie is by construction that
 * person's own latest tap, so it simply wins until the client clears it
 * after the profile write settles.
 */
export const ADMIN_LANG_COOKIE = "tj-admin-lang";

export function parseAdminLangCookie(
  value: string | undefined,
): { userId: string; lang: HomeLanguage } | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = value.slice(0, dot);
  const lang = value.slice(dot + 1);
  if (lang !== "en" && lang !== "es") return null;
  return { userId, lang };
}

export async function resolveAdminLanguageWithUser(): Promise<{
  lang: HomeLanguage;
  userId: string | null;
}> {
  const access = await getCurrentAdminAccess();
  const userId = access.user?.id ?? null;

  const store = await cookies();
  const parsed = parseAdminLangCookie(store.get(ADMIN_LANG_COOKIE)?.value);
  if (parsed && userId && parsed.userId === userId) {
    return { lang: parsed.lang, userId };
  }

  const preference = access.member?.language_preference;
  return { lang: preference === "es" ? "es" : "en", userId };
}

export async function resolveAdminLanguage(): Promise<HomeLanguage> {
  return (await resolveAdminLanguageWithUser()).lang;
}
