import { NextRequest, NextResponse } from "next/server";
import { verifySigningToken } from "@/lib/sales/signing-token";
import { createServiceClient } from "@/lib/supabase/service";
import { ceremonyDocuments } from "@/lib/sales/signing-ceremony";
import { readSalePlan } from "@/lib/sales/sale-plan";
import { generatePdf } from "@/lib/documents/pdf-generator";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/** The same short session can save only its current, signed ceremony documents. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; agreementId: string }> }) {
  const { token, agreementId } = await params;
  const verified = verifySigningToken(token);
  if (!verified.ok) return NextResponse.json({ error: "Signing link expired or invalid. Ask the dealer for a copy." }, { status: 401, headers: privateHeaders });
  const service = createServiceClient();
  const [deal, agreements] = await Promise.all([
    service.from("deals").select("step_data").eq("id", verified.dealId).maybeSingle(),
    service.from("document_agreements").select("id, document_type, status, finalized_at, completed_at, completed_link, has_buyer_signature, signed_at, form_data").eq("deal_id", verified.dealId).order("created_at", { ascending: false }),
  ]);
  if (deal.error || agreements.error) return NextResponse.json({ error: "Please try again." }, { status: 503, headers: privateHeaders });
  if (!deal.data) return NextResponse.json({ error: "No such document." }, { status: 404, headers: privateHeaders });
  const current = ceremonyDocuments((agreements.data ?? []).map((row) => ({
    id: row.id, documentType: row.document_type,
    finalized: Boolean(row.finalized_at || row.completed_at || row.status === "finalized" || row.status === "completed"),
    hasCompletedLink: Boolean(row.completed_link),
    signed: Boolean(row.has_buyer_signature || row.signed_at || row.form_data?.signature),
  })), { dealerSignsTitle: readSalePlan(deal.data.step_data).titleSignedBy === "dealer" });
  const document = current.find((row) => row.id === agreementId && row.signed);
  if (!document) return NextResponse.json({ error: "No signed copy is available for this document." }, { status: 404, headers: privateHeaders });
  try {
    const bytes = await generatePdf({ agreementId, copyLabel: "BUYER COPY", includeSignatures: true, stripIdImagery: true });
    const disposition = req.nextUrl.searchParams.get("inline") === "true" ? "inline" : "attachment";
    const filename = `${document.documentType.replace(/[^a-zA-Z0-9]/g, "")}-signed.pdf`;
    return new NextResponse(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${filename}"` } });
  } catch {
    return NextResponse.json({ error: "Your signed copy could not be prepared. Please try again or ask the dealer." }, { status: 503, headers: privateHeaders });
  }
}
