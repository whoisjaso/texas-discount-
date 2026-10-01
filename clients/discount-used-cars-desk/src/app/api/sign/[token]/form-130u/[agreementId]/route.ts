import { NextResponse } from "next/server";
import { verifySigningToken } from "@/lib/sales/signing-token";
import { render130UPdf } from "@/lib/documents/render130U";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The real 130-U, for the buyer's screen.
 *
 * The ceremony used to draw the title application through the shared sheet
 * renderer, which for this one document is a lookalike of the state form.
 * The buyer read our drawing and signed it, and the county received the
 * TxDMV's own form with that stroke on it: the right form, but not the
 * page the buyer had looked at. This route hands the ceremony the same
 * filled bytes the county gets, so the buyer reads the form they sign.
 *
 * The signing token is the only authority here, the same token the
 * ceremony page and the signing action accept: it names one deal, and a
 * row from any other deal is refused as not found.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; agreementId: string }> },
) {
  const { token: raw, agreementId } = await params;
  const session = verifySigningToken(decodeURIComponent(raw));
  if (!session.ok) {
    return NextResponse.json({ error: session.reason === "expired" ? "expired" : "invalid" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("document_agreements")
    .select("id, deal_id, document_type")
    .eq("id", agreementId)
    .maybeSingle();
  const agreement = row as { id: string; deal_id: string | null; document_type: string | null } | null;
  if (!agreement || agreement.deal_id !== session.dealId || agreement.document_type !== "form130U") {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const filled = await render130UPdf(agreement.id);
  if (!filled.ok) return NextResponse.json({ error: filled.error }, { status: filled.status });

  return new NextResponse(new Uint8Array(filled.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filled.filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
