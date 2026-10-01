"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { readPaperwork, writePaperwork } from "@/lib/sales/paperwork";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { SITE_URL } from "@/lib/dealership-config";
import { isLanguageSettled } from "@/lib/sales/deal-language";
import { titleHoldsDocuments, titleRefusesDocuments, TITLE_STATUS_LABELS } from "@/lib/vehicles/title-status";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import { settledPlan } from "@/lib/sales/sale-plan";
import { spanishEsignBlocked } from "@/lib/legal/spanish-esign";
import { businessDateToday } from "@/lib/documents/us-date";
import { filingBlockedReason } from "@/lib/dealership-config";

/**
 * The paperwork answers, and the document they end up as.
 *
 * Two writes with different weights, and they are kept apart on purpose.
 *
 *   an answer     goes on the deal, in `step_data`, and can be changed by
 *                 walking back to the question. Nothing has been signed.
 *   a document    goes in `document_agreements` as a finalized row, which is
 *                 what the packet counts and what an auditor would be shown.
 *
 * The second is the one that matters, and it is written the way the two
 * existing per-page documents write theirs: a single insert carrying
 * `status: "finalized"`, both timestamps, and the whole answered form in
 * `form_data`. Not through the customer-portal chain, which exists to send a
 * document to somebody's email and get it signed remotely, and which cannot
 * express a document signed at the desk in front of you.
 */

export type PaperworkState = { ok: boolean; error?: string };

/**
 * The deal id is never taken from the client for the document write.
 *
 * It is taken from the URL by the page and passed here, and every read and
 * write below is scoped to it under the operator's own session, so row level
 * security is what actually bounds this rather than a check written by hand.
 */
/** One answer to one question. */
export async function savePaperworkAnswer(
  dealId: string,
  documentType: string,
  key: string,
  value: string,
): Promise<PaperworkState> {
  // The document corridor belongs to two roles: sales under its own
  // scope, registration under its title-work scope (round 4, finding 3).
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };
  if (!key.trim()) return { ok: false, error: "Nothing to save." };

  try {
    const supabase = await createClient();
    // Version-checked merge: the patch is rebuilt from the blob as it
    // stands at each attempt, so an answer typed in a second tab a moment
    // earlier survives this one instead of being silently replayed over.
    const merged = await casMergeStepData(supabase, dealId, (current) => {
      const answers = { ...readPaperwork(current, documentType), [key]: value };
      return writePaperwork(current, documentType, answers);
    });
    if (!merged.ok) throw new Error(merged.error);
  } catch {
    return { ok: false, error: "Could not save that. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}

/**
 * The document itself, signed and filed.
 *
 * `form_data` carries everything the document was built from, not just the
 * answers: the vehicle, the buyer, the dealership's own details as they stood
 * at the moment of signing. A document is a record of what was agreed on a
 * day, and rebuilding it later from live rows would quietly rewrite it every
 * time a phone number changed.
 */
export async function finalizePaperwork(
  dealId: string,
  documentType: string,
  input: {
    buyerName: string;
    vehicleDescription: string;
    vehicleVin: string;
    formData: Record<string, unknown>;
    /** A PNG data URL from the pad, or null for a document signed in ink. */
    signature: string | null;
  },
): Promise<PaperworkState & { agreementId?: string }> {
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };

  // Never file a legal record over a dealer fact nobody has supplied.
  const blocked = filingBlockedReason();
  if (blocked) return { ok: false, error: blocked };

  const now = new Date().toISOString();
  try {
    const supabase = await createClient();

    /**
     * The printable payload, assembled at the moment of filing.
     *
     * `form_data` is the faithful record; `completed_link` is the document.
     * Every print path in the product renders from the link, and corridor
     * rows never carried one, so the packet's Open button answered the
     * funnel's own bill of sale with a raw 500. The walkthrough personas hit
     * it on a phone at the last step of the flow.
     *
     * The dealer's preset signature rides along when the filer has one: they
     * pressed File on a document that shows their name, which is the explicit
     * act the signature is adopted by.
     */
    const sale = await getSaleDetail(dealId);

    /**
     * Two gates, both on stored facts, both before anything is written.
     *
     * The language gate: a document may not be created against a deal whose
     * conducted language nobody has answered — the packet's Spanish-first
     * duty (FTC 455.5; §348.006) is decided by that answer, and a schema
     * default is not an answer. Legacy deals answer it as the guide's first
     * step; nothing already signed is re-questioned.
     *
     * The Spanish e-sign gate: the shared guard both signing paths call.
     * COMPLIANCE_REVIEW.md §10.1 blocks live Spanish e-sign until counsel
     * reviews the Spanish legal copy; filing unsigned for ink stays open,
     * which is how these sales are lawfully conducted today.
     */
    if (sale && !isLanguageSettled(sale.stepData)) {
      return {
        ok: false,
        error:
          "Answer what language the sale is in first. It is the first step of the guide.",
      };
    }
    /**
     * The title gate at the filing, not only at the start.
     *
     * A sale may begin on a salvage title and hold; what it may not do is
     * file a document that assigns a car nobody can assign yet. The guide
     * does not offer the documents while the title holds them, so this is
     * the belt to that brace.
     */
    const salvagePath = sale ? readSalvagePlan(sale.stepData).path : null;
    if (sale && titleHoldsDocuments(sale.vehicle?.titleStatus, salvagePath)) {
      return {
        ok: false,
        error:
          salvagePath === "rebuild"
            ? "The title is still salvage. Rebuild it in our name first; the guide's next step is the title work."
            : "The title is salvage and the sale has not said what happens with it. Answer that first; it is the guide's first step.",
      };
    }
    /*
      A title no document may ever be filed on: unknown, nonrepairable,
      export only. The desk refuses these at the car, so this is reached
      only by a caller that skipped the question, and it is refused with
      the reason rather than filing a bill of sale on a car that cannot be
      sold for the road by anyone.
    */
    const refused = sale ? titleRefusesDocuments(sale.vehicle?.titleStatus) : null;
    if (sale && refused) {
      return {
        ok: false,
        error:
          refused === "unverified"
            ? "Say what the title is first. Nothing files on a title nobody has looked at."
            : `This vehicle cannot be sold: ${TITLE_STATUS_LABELS[sale.vehicle?.titleStatus === "export_only" ? "export_only" : "nonrepairable"]}. No document files on it.`,
      };
    }
    /*
      Only a document this sale owes may be filed on it.

      The corridor never offers the wrong one, but a URL typed by hand can
      reach any document's review screen. On a tow-away sale that is how a
      130-U, a promise of plates on paper, could be filed against a car
      that cannot be registered; on an ordinary sale it is how a salvage
      bill of sale could be filed on a clean car. The packet is the rule,
      and the filing checks it.
    */
    if (sale) {
      const owed = requiredDocumentTypes(
        sale.funding.type,
        settledPlan(sale.stepData),
        sale.vehicle?.titleStatus ?? null,
        salvagePath,
      );
      if (!owed.includes(documentType)) {
        return {
          ok: false,
          error: "This sale does not owe that document. The guide lists the ones it does.",
        };
      }
    }
    if (sale && spanishEsignBlocked(sale.language, input.signature)) {
      return {
        ok: false,
        error:
          "Spanish e-signing is off until the Spanish legal wording is reviewed. File it unsigned and print for ink.",
      };
    }

    const staffSignature = await getStaffSignature()
      .then((held) => held.dataUrl)
      .catch(() => null);
    /*
      The signature is dated the business day it was drawn, at the desk.

      `now` is the instant, kept for the row's timestamps. The date beside
      a signature on the paper is a calendar date in the dealership's own
      time zone: an instant formatted by a UTC server dated an evening
      signature tomorrow, one day after the dealer's line on the same block.
    */
    const signedOn = businessDateToday();
    const completedLink = sale
      ? corridorCompletedLink(sale, documentType, input.formData, SITE_URL, {
          buyerSignature: input.signature,
          buyerSignatureDate: input.signature ? signedOn : null,
          dealerSignature: staffSignature,
          dealerSignatureDate: staffSignature ? signedOn : null,
        })
      : null;

    const { data, error } = await supabase
      .from("document_agreements")
      .insert({
        document_type: documentType,
        // Finalized outright. There is no customer to email and no link to
        // wait on: the buyer is standing at the desk and has just signed.
        status: "finalized",
        buyer_name: input.buyerName,
        vehicle_description: input.vehicleDescription,
        vehicle_vin: input.vehicleVin,
        // Without this the row exists and the sale cannot see it, because the
        // packet reads documents by deal.
        deal_id: dealId,
        // The conducted language, stored as this row's own fact at the
        // moment of filing. Without it the column's schema default said
        // "en" for every corridor document on a Spanish deal, and both the
        // e-sign guard and the texted-packet language gate read this value.
        ...(sale ? { language: sale.language === "es" ? "es" : "en" } : {}),
        form_data: {
          ...input.formData,
          signature: input.signature,
          signedAt: now,
        },
        ...(completedLink ? { completed_link: completedLink } : {}),
        has_buyer_signature: Boolean(input.signature),
        finalized_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (error) throw error;
    revalidatePath(`/admin/sales/${dealId}`);
    return { ok: true, agreementId: (data as { id: string }).id };
  } catch {
    return { ok: false, error: "Could not file that. Try again." };
  }
}
