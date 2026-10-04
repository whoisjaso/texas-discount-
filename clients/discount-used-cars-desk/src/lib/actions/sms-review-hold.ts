"use server";

import { requireCurrentAdminPermission } from "@/lib/admin/current-admin";

/**
 * A person clears the hold an ambiguous reply raised — on the record.
 *
 * The clear is attributed (who, when) rather than deleted, because "someone
 * read it" is the fact automation resumes on. The caller has just been
 * SHOWN the held message: the send action returns its text, and the screen
 * puts it above this button, so clearing without reading takes deliberate
 * effort rather than being the path of least resistance.
 */
export async function clearSmsReviewHold(
  customerId: string,
  /** The exact hold being cleared — the timestamp the screen displayed. */
  heldAt: string,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireCurrentAdminPermission("documents:deliver");
  if (!access.ok) return { ok: false, error: access.error };
  if (!heldAt) return { ok: false, error: "Nothing to clear." };

  // Bound to the displayed hold: if a NEWER ambiguous reply raised a fresh
  // hold between the screen rendering and this click, the timestamps no
  // longer match, nothing clears, and the send path shows the new message.
  // Reading one reply must never clear a different one.
  const { data, error } = await access.service
    .from("customers")
    .update({ sms_review_hold_cleared_by: access.user!.id })
    .eq("id", customerId)
    .eq("sms_review_hold_at", heldAt)
    .is("sms_review_hold_cleared_by", null)
    .select("id");

  if (error) return { ok: false, error: "Could not clear that. Try again." };
  if (!data || data.length === 0) {
    return { ok: false, error: "A newer reply arrived. Read that one first." };
  }
  return { ok: true };
}
