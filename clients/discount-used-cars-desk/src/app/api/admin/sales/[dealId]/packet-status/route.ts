import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSalePacket } from "@/lib/admin/sale-packet";
import { createAdminDataClient } from "@/lib/supabase/admin-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ dealId: string }> }) {
  const denied = await requireAdmin(request, "documents:read");
  if (denied) return denied;
  const { dealId } = await params;
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
  try {
    const client = await createAdminDataClient();
    const { data, error } = await client.from("deals").select("id").eq("id", dealId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Sale not found" }, { status: 404, headers });
    const documents = (await getSalePacket(dealId, { statusOnly: true })).map(({ id, documentType, title, gloss, filedAt, finalized, printable, signed }) => ({ id, documentType, title, gloss, filedAt, finalized, printable, signed }));
    return NextResponse.json({ documents }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not check document status" }, { status: 503, headers });
  }
}
