"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { hasTeamPermission } from "@/lib/operations/team";

/**
 * Removing a sale that should not exist.
 *
 * Somebody testing the flow, or starting one on the wrong car, needs the row
 * gone rather than sitting on the list forever looking like work. Until now the
 * only option was `abandonDeal`, which is the right tool for a deal that was
 * real and fell through, and the wrong one for a deal that was never real: an
 * abandoned test is still a row somebody has to recognise and ignore every
 * time they look at the screen.
 *
 * ## What this refuses to delete
 *
 * **A document the BUYER signed is a record, not a draft.** For everybody
 * except the owner the answer to "we do not want this any more" is abandon,
 * never delete.
 *
 * The word doing the work there is *buyer*. This used to key on
 * `finalized_at` / `completed_at` / a `completed` status, all of which mean
 * the dealership generated and filed a PDF on its own side. That is one
 * party putting a document together, not a transaction: on live data 52
 * documents looked signed by that rule and only 39 carried a buyer's
 * signature, so 13 sales were locked forever by paperwork nobody had ever
 * put a name to. The dealer finishing a form is not the customer agreeing
 * to it.
 *
 * The owner is the exception, deliberately. A dealer testing his own product
 * generates signed drafts against fake buyers, and a rule that locks him out
 * of his own data forever is a bug wearing a compliance costume. So the owner
 * may remove a signed sale, but never on the same single tap that removes a
 * draft: `confirmSigned` has to be passed, and the screen only sets it after
 * a second, differently-worded confirmation.
 *
 * The check is on finalised documents rather than on the deal's own status,
 * because status is a label somebody sets and a signature is a thing that
 * happened.
 */

export interface DeleteSaleResult {
  ok: boolean;
  error?: string;
  /**
   * Set when the refusal is only that nobody has confirmed the heavier path
   * yet, so the screen knows to ask again rather than give up.
   */
  needsSignedConfirmation?: boolean;
}

export async function deleteSaleAction(
  dealId: string,
  options?: { confirmSigned?: boolean },
): Promise<DeleteSaleResult> {
  if (!dealId) return { ok: false, error: "No sale was named." };

  const access = await getCurrentAdminAccess();
  if (!access.user) return { ok: false, error: "Sign in again first." };

  // Deleting is a manage action, not a read one, and it is deliberately held to
  // the same permission that lets somebody create the paperwork in the first
  // place.
  if (!hasTeamPermission(access.role, "payments:manage")) {
    return { ok: false, error: "This account cannot remove a sale." };
  }

  const { createServiceClient } = await import("@/lib/supabase/service");
  const service = createServiceClient();

  const { data: agreements, error: readError } = await service
    .from("document_agreements")
    .select("id, has_buyer_signature, signature_svg, signed_at")
    .eq("deal_id", dealId);

  if (readError) {
    return { ok: false, error: "Could not check the paperwork on that sale." };
  }

  // Three ways a buyer's signature is recorded, depending on which path
  // captured it. Any one of them means a person put their name to this.
  const signed = (agreements ?? []).some((raw) => {
    const agreement = raw as unknown as {
      has_buyer_signature: boolean | null;
      signature_svg: string | null;
      signed_at: string | null;
    };
    return (
      agreement.has_buyer_signature === true ||
      Boolean(agreement.signature_svg) ||
      Boolean(agreement.signed_at)
    );
  });

  if (signed) {
    // Anyone but the owner is told to abandon it: a signed packet belongs to
    // a real buyer and is not a salesperson's to erase.
    if (access.role !== "owner") {
      return {
        ok: false,
        error:
          "This sale has signed paperwork, so it cannot be deleted. Abandon it instead and the record stays.",
      };
    }
    // The owner can, on a second and separate confirmation.
    if (!options?.confirmSigned) {
      return {
        ok: false,
        needsSignedConfirmation: true,
        error:
          "This sale has signed paperwork. Deleting it destroys that record for good.",
      };
    }
  }

  // Unsigned drafts attached to the deal go with it. Leaving them behind would
  // orphan rows that point at a deal that is no longer there.
  const { error: draftError } = await service
    .from("document_agreements")
    .delete()
    .eq("deal_id", dealId);

  if (draftError) {
    return { ok: false, error: "Could not clear the drafts on that sale." };
  }

  const { error: dealError } = await service.from("deals").delete().eq("id", dealId);

  if (dealError) {
    return { ok: false, error: "Could not remove that sale. Try again." };
  }

  revalidatePath("/admin/sales");
  revalidatePath("/admin/dealership/dashboard");
  return { ok: true };
}
