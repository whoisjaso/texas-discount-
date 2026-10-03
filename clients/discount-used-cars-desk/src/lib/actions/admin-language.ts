"use server";

import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import type { HomeLanguage } from "@/lib/admin/language";

/**
 * Persist the operator's own screen language.
 *
 * Self-only by construction: the row updated is the one belonging to the
 * signed-in person, found through their own access record, never through a
 * caller-supplied id. Ordinary sales staff do not hold `team:manage`, so the
 * RLS path through the team screens is not usable here — the service client
 * writes exactly one column of exactly one row.
 *
 * Failure is not an error the operator has to deal with: the cookie the
 * toggle already wrote keeps their choice for this browser, and the typed
 * result lets the corridor surface a quiet note that the saved preference
 * did not stick.
 */
export async function setAdminLanguage(
  lang: HomeLanguage,
): Promise<{ ok: boolean; error?: "invalid" | "notSignedIn" | "notSaved" }> {
  if (lang !== "en" && lang !== "es") return { ok: false, error: "invalid" };

  const access = await getCurrentAdminAccess();
  if (!access.user) return { ok: false, error: "notSignedIn" };

  // Local preview and metadata-only sessions have no member row to write.
  // The cookie already carries the choice for this browser; that is the
  // whole persistence available to them, and it is not a failure.
  if (!access.member || !access.service) return { ok: true };

  const { error } = await access.service
    .from("team_members")
    .update({
      language_preference: lang,
      updated_at: new Date().toISOString(),
    })
    .eq("id", access.member.id);

  if (error) return { ok: false, error: "notSaved" };
  return { ok: true };
}
