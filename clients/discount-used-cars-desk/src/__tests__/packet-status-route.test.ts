import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ denied: vi.fn(), packet: vi.fn(), sale: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.denied }));
vi.mock("@/lib/admin/sale-packet", () => ({ getSalePacket: mocks.packet }));
vi.mock("@/lib/supabase/admin-data", () => ({ createAdminDataClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.sale }) }) }) }) }));
import { GET } from "@/app/api/admin/sales/[dealId]/packet-status/route";
const request = new NextRequest("https://example.com/api/admin/sales/deal-1/packet-status");
const params = { params: Promise.resolve({ dealId: "deal-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied.mockResolvedValue(null);
  mocks.sale.mockResolvedValue({ data: { id: "deal-1" }, error: null });
  mocks.packet.mockResolvedValue([{ id: "doc-1", documentType: "billOfSale", title: "Bill Of Sale", gloss: "Sale", finalized: true, printable: true, signed: true, filedAt: "2026-09-08", hasCompletedLink: true, completed_link: "secret", form_data: { signature: "private" } }]);
});

describe("authenticated packet status", () => {
  it("requires document read access before querying any sale", async () => {
    mocks.denied.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    expect((await GET(request, params)).status).toBe(403);
    expect(mocks.denied).toHaveBeenCalledWith(request, "documents:read");
    expect(mocks.sale).not.toHaveBeenCalled();
  });
  it("returns signature status, never signing links or document payloads", async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.documents[0].signed).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/secret|private|completed_link|form_data|hasCompletedLink/);
  });
  it("does not expose documents for a sale the signed-in reader cannot see", async () => {
    mocks.sale.mockResolvedValue({ data: null, error: null });
    expect((await GET(request, params)).status).toBe(404);
    expect(mocks.packet).not.toHaveBeenCalled();
  });
  it("makes a failed read retryable instead of presenting an empty packet", async () => {
    mocks.packet.mockRejectedValue(new Error("database unavailable"));
    expect((await GET(request, params)).status).toBe(503);
  });
});
