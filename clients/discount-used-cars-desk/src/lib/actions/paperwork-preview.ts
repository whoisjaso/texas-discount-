"use server";

import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { getSaleDetail, vehicleLabel } from "@/lib/admin/sale-desk";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { paperworkAnswers, paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { SITE_URL } from "@/lib/dealership-config";

/**
 * "Preview The PDF", from any screen of the paperwork corridor.
 *
 * The owner's walkthrough asked for exactly this: proof, on every page,
 * that what is being typed is landing on the right lines of the real
 * document — before anything is signed. The corridor already knows how to
 * render every document it files; this action builds the same payload the
 * filing would build, saves it as the deal's DRAFT row for that document
 * (status "pending" — the packet already reads that as "Draft saved. Not
 * signed yet"), and answers with the same PDF endpoint the packet prints
 * from. What you preview is what would file.
 *
 * The power of attorney answers with the official VTR-271 route instead:
 * that form is a state PDF filled from the deal, and previewing anything
 * other than the genuine filled form would be a lie with margins.
 */

export type PaperworkPreviewResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function previewPaperworkPdf(
  dealId: string,
  documentType: string,
): Promise<PaperworkPreviewResult> {
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };
  if (!dealId || !documentType) return { ok: false, error: "Nothing to preview." };

  if (documentType === "powerOfAttorney") {
    return {
      ok: true,
      url: `/api/documents/power-of-attorney?dealId=${encodeURIComponent(dealId)}&disposition=inline`,
    };
  }

  try {
    const sale = await getSaleDetail(dealId);
    if (!sale) return { ok: false, error: "That sale could not be found." };

    const answers = readPaperwork(sale.stepData, documentType);
    const money = paperworkMoney(
      sale.vehicle?.salePrice,
      answers,
      readMoney(sale.stepData),
      sale.funding.type,
    );

    /*
      The same context the question screen builds, so the preview resolves
      the same defaults it does. Without it a preview taken before somebody
      walked every question printed those boxes empty, and the 130-U's county
      was empty on the paper while the deal held the answer all along.
    */
    const held = readBuyerId(sale.stepData);
    const filedAnswers = paperworkAnswers(documentType, {
      funding: sale.funding.type,
      bodyStyle: (sale.vehicle?.bodyStyle ?? "").toLowerCase(),
      licenceState: sale.buyer?.idState ?? "",
      paidToday: money.paidToday > 0 ? money.paidToday : null,
      buyerCity: held.mailing.city ?? "",
      buyerCounty: held.mailing.county ?? "",
      vehicleWeight: sale.vehicle?.weightLbs ?? null,
      dealTotal: money.total,
      vehicleYear: sale.vehicle?.year ?? null,
      saleYear: Number((sale.startedAt ?? sale.createdAt).slice(0, 4)) || undefined,
      answers,
    });

    // The same shape ReviewStep files, minus signatures: the preview must
    // be the document the filing would produce, or it proves nothing.
    const formData: Record<string, unknown> = {
      ...filedAnswers,
      ...money,
      ...(documentType === "vehicleResponsibility"
        ? { quotedRegistrationAmount: money.registrationCost }
        : {}),
    };

    const completedLink = corridorCompletedLink(sale, documentType, formData, SITE_URL, {
      buyerSignature: null,
      buyerSignatureDate: null,
      dealerSignature: null,
      dealerSignatureDate: null,
    });
    if (!completedLink) {
      return { ok: false, error: "No preview is drawn for this document yet." };
    }

    const supabase = await createClient();
    const row = {
      document_type: documentType,
      status: "pending",
      buyer_name: sale.buyer?.name ?? "",
      vehicle_description: vehicleLabel(sale.vehicle),
      vehicle_vin: sale.vehicle?.vin ?? "",
      deal_id: dealId,
      language: sale.language === "es" ? "es" : "en",
      form_data: formData,
      completed_link: completedLink,
    };

    // One draft per document per deal: refresh it rather than minting a new
    // row on every preview tap.
    const { data: existing, error: findError } = await supabase
      .from("document_agreements")
      .select("id")
      .eq("deal_id", dealId)
      .eq("document_type", documentType)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;

    let agreementId: string;
    if (existing?.id) {
      const { error } = await supabase
        .from("document_agreements")
        .update(row)
        .eq("id", existing.id as string);
      if (error) throw error;
      agreementId = existing.id as string;
    } else {
      const { data, error } = await supabase
        .from("document_agreements")
        .insert(row)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("no draft row returned");
      agreementId = (data as { id: string }).id;
    }

    return {
      ok: true,
      url: `/api/documents/agreements/${encodeURIComponent(agreementId)}/pdf?inline=true`,
    };
  } catch (error) {
    console.error("previewPaperworkPdf failed:", error);
    return { ok: false, error: "Could not draw the preview. Try again." };
  }
}
