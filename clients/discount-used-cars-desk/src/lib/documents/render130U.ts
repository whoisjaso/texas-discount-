/**
 * The real 130-U, filled.
 *
 * `public/forms/130-U.pdf` is the actual TxDMV form and `fill130U` writes
 * into its real AcroForm fields. That filler was reachable from exactly one
 * standalone route, while the sale corridor produced its 130-U by rendering
 * an HTML lookalike (`Form130UPreview`) to paper. So the document the
 * corridor handed a county tax office was a replica of a state form rather
 * than the state form, which is a rejection waiting to happen.
 *
 * This module is the one place that turns an agreement row into the real
 * filled PDF, so both the standalone route and the corridor produce the
 * same bytes. It reads the encoded `completed_link`, which drafts carry as
 * well as finalized rows, so a preview shows exactly what would file.
 */

import { fill130U } from "@/lib/fill-130u/fill-pdf";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { linkSignerName, resolveSellerSigner } from "@/lib/documents/dealer-signer";
import { createServiceClient } from "@/lib/supabase/service";

// ═════════════════════════════════════════════════════════════════════
// GET /api/generate-130u?agreement_id=xxx
// ═════════════════════════════════════════════════════════════════════

export type Render130UResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; error: string; status: number };

/**
 * Fill the real 130-U for one agreement row.
 *
 * Everything the form needs already lives on the row: the encoded document
 * data, the buyer, and the VIN that finds the vehicle. Nothing is invented
 * here, and a row that cannot supply the data is refused rather than filled
 * with blanks that look like answers.
 */
export async function render130UPdf(
  agreementId: string,
  options: { includeSignatures?: boolean; stripIdImagery?: boolean } = {},
): Promise<Render130UResult> {
  const supabase = createServiceClient();

  const { data: agreement, error } = await supabase
    .from("document_agreements")
    .select("*")
    .eq("id", agreementId)
    .single();

  if (error || !agreement) {
    return { ok: false, error: "Agreement not found", status: 404 };
  }

  const completedLink = agreement.completed_link as string | null;
  if (!completedLink) {
    return {
      ok: false,
      error: "This 130-U has no completed data yet.",
      status: 400,
    };
  }

  const decoded = decodeCompletedLinkFromUrl(completedLink);
  if (!decoded) {
    return { ok: false, error: "Could not decode agreement data", status: 500 };
  }

  const vin =
    (decoded.dd as Record<string, unknown>).vehicleVin ||
    (decoded.dd as Record<string, unknown>).vin ||
    agreement.vehicle_vin;

  let vehicle: Record<string, unknown> | null = null;
  if (vin) {
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("vin", vin as string)
      .single();
    vehicle = vehicleData;
  }

  const agreementData = buildAgreementData(decoded, agreement, vehicle);

  // The licence photograph, from wherever this agreement kept it: the
  // completed link is the newer home and wins, the column is what older
  // agreements have.
  const idPhotoDataUrl = options.stripIdImagery ? null :
    (typeof decoded.bi === "string" && decoded.bi.length > 0 ? decoded.bi : null) ??
    (typeof agreement.buyer_id_photo === "string" &&
    agreement.buyer_id_photo.length > 0
      ? (agreement.buyer_id_photo as string)
      : null);

  /*
    The seller band's stroke and the name printed beside it, from one person
    (owner's instruction 10/01/2026; SOP 130-U bullet: the person is whoever
    filed it). Filed copies keep the filer's captured stroke and name,
    including buyer downloads with no staff session. A filed copy with no
    stroke is left for ink and still names the filer: it never borrows the
    signature or the name of whoever happens to open it later. Only a draft
    or preview reads the viewer, so it shows what their filing would print.
  */
  const filed =
    Boolean(agreement.finalized_at || agreement.completed_at) ||
    agreement.status === "finalized" ||
    agreement.status === "completed";
  const linkStroke = typeof decoded.ds === "string" && decoded.ds.startsWith("data:image/") ? decoded.ds : null;
  const includeSignatures = options.includeSignatures !== false;
  const viewer =
    includeSignatures && !linkStroke && !filed ? await getStaffSignature().catch(() => null) : null;
  /*
    A filed row's signer name is trusted only from what the filing itself
    recorded: `form_data.dealerSignerName` beside `dealerSignerMemberId`,
    which only finalizePaperwork writes (and the ceremony carries forward).
    The legacy agreements API can insert or patch a completed link but never
    form_data, so a link it wrote cannot name somebody as the dealer's signer
    on a state form; such a row prints the "[Not set: signer name]" marker.
  */
  const form =
    agreement.form_data && typeof agreement.form_data === "object"
      ? (agreement.form_data as Record<string, unknown>)
      : {};
  const recordedFiler =
    typeof form.dealerSignerMemberId === "string" && form.dealerSignerMemberId.trim()
      ? linkSignerName(form)
      : null;
  const seller = resolveSellerSigner(
    {
      filed,
      includeSignatures,
      linkStroke,
      linkSignerName: filed ? recordedFiler : linkSignerName(decoded.dd as Record<string, unknown>),
    },
    viewer,
  );
  const staffSignatureDataUrl = seller.stroke;
  agreementData.dealer_signer_name = seller.name;

  // The buyer's, on the applicant line only, and only when the buyer drew
  // it on the review screen's pad: it travels in the completed link as the
  // buyer signature the packet already carries for every other document.
  const buyerSignatureDataUrl =
    options.includeSignatures !== false && typeof decoded.bs === "string" && decoded.bs.startsWith("data:image/")
      ? decoded.bs
      : null;

  try {
    const bytes = await fill130U(agreementData, {
      preserveInstructions: true,
      idPhotoDataUrl,
      staffSignatureDataUrl,
      buyerSignatureDataUrl,
    });
    const buyerLast = agreementData.buyer_last_name || "Unknown";
    const vinLast6 = agreementData.vin.slice(-6) || "NOVIN";
    return { ok: true, bytes, filename: `130-U_${buyerLast}_${vinLast6}.pdf` };
  } catch (err) {
    console.error("[render130U] fill failed:", err);
    return { ok: false, error: "PDF generation failed", status: 500 };
  }
}
