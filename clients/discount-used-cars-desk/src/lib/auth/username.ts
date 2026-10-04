import { isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";

/**
 * A handle where the email goes.
 *
 * The owner's ask: a username and password, so nobody has to sign in with
 * their Gmail every time. Supabase Auth only knows addresses, so the handle
 * is turned into the roster's address before sign-in and never stored
 * anywhere else. Only an ACTIVE member's handle resolves: a pending or
 * removed account's handle answers nothing, the same nothing an unknown
 * one answers, so the field cannot be used to probe the roster.
 */
export function looksLikeUsername(value: string): boolean {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  return handle.length >= 3 && handle.length <= 24 && !handle.includes("@") && /^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(handle);
}

export async function resolveLoginEmail(value: string): Promise<string | null> {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  if (!looksLikeUsername(handle)) return null;
  // Preview has no roster: the handle is the identity.
  if (isLocalAdminPreviewEnabled()) return handle;
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const { data } = await service
      .from("team_members")
      .select("email, status")
      .eq("username", handle)
      .eq("status", "active")
      .maybeSingle();
    const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

/**
 * A phone number is an identity too.
 *
 * The owner wanted his number attached to his email so he could sign in with
 * either, and described the linking as something that should just happen
 * rather than be set up. It already has: `team_members.phone` is the link, so
 * a number typed into the sign-in box resolves to the same person a handle or
 * an address resolves to. Nothing new to connect, nothing to keep in sync.
 *
 * Returns the address and the number in the shape a text can be sent to, or
 * null. Null is what an unknown number gets, and it is also what a number
 * belonging to somebody inactive gets: the sign-in screen never says which.
 */
export async function resolveLoginPhone(
  value: string,
): Promise<{ email: string; phone: string } | null> {
  const { phoneToE164 } = await import("@/lib/forms/phone");
  const e164 = phoneToE164(value);
  if (!e164) return null;
  if (isLocalAdminPreviewEnabled()) return null;

  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const { data } = await service
      .from("team_members")
      .select("email, phone, status")
      .eq("phone", e164)
      .eq("status", "active")
      .maybeSingle();
    const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
    return email.includes("@") ? { email, phone: e164 } : null;
  } catch {
    return null;
  }
}

/**
 * Does this look like somebody typing a phone number rather than a handle?
 *
 * Checked before the username path because a ten digit string satisfies
 * `looksLikeUsername` too, and a person typing their number means their
 * number.
 */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes("@") || /[a-z]/i.test(trimmed)) return false;
  return trimmed.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").length === 10;
}
