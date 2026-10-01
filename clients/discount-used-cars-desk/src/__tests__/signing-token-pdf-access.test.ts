import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/sign/packet/[token]/documents/[agreementId]/route";

const fixture = vi.hoisted(() => ({
  stepData: {} as Record<string, unknown>, agreements: [] as Array<Record<string, unknown>>, databaseError: false,
  pdf: vi.fn(), service: vi.fn(), queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
}));
vi.mock("@/lib/sales/signing-token", () => ({ verifySigningToken: (token: string) => token === "valid" ? { ok: true, dealId: "deal-1", expiresAt: Date.now() + 60_000 } : { ok: false, reason: "expired" } }));
vi.mock("@/lib/documents/pdf-generator", () => ({ generatePdf: (...args: unknown[]) => fixture.pdf(...args) }));
vi.mock("@/lib/admin/sale-desk", () => ({ SALE_DOCUMENTS: [
  { documentType: "billOfSale", title: "Bill Of Sale" }, { documentType: "form130U", title: "130-U" }, { documentType: "powerOfAttorney", title: "Power Of Attorney" },
] }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => {
  fixture.service();
  return { from: (table: string) => {
    const filters: Array<[string, unknown]> = [];
    fixture.queries.push({ table, filters });
    const execute = () => {
      if (fixture.databaseError) return { data: null, error: { message: "unavailable" } };
      if (table === "deals") return { data: filters.some(([key, value]) => key === "id" && value === "deal-1") ? { step_data: fixture.stepData } : null, error: null };
      return { data: fixture.agreements.filter(row => filters.every(([key, value]) => row[key] === value)), error: null };
    };
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, order: async () => execute(), maybeSingle: async () => execute() };
    return query;
  } };
} }));

const signed = (id: string, documentType = "billOfSale", dealId = "deal-1") => ({
  id, document_type: documentType, deal_id: dealId, status: "finalized", finalized_at: "2026-09-08T18:00:00Z", completed_at: null,
  completed_link: "filed-document-payload", has_buyer_signature: true, signed_at: "2026-09-08T18:01:00Z", form_data: {},
});
const get = (agreementId: string, token = "valid", inline = false) => GET(new NextRequest(`https://dealer.example/api/sign/packet/${token}/documents/${agreementId}${inline ? "?inline=true" : ""}`), { params: Promise.resolve({ token, agreementId }) });
beforeEach(() => {
  fixture.stepData = {}; fixture.agreements = [signed("current")]; fixture.databaseError = false;
  fixture.pdf.mockReset().mockResolvedValue(Buffer.from("%PDF-signed-test")); fixture.service.mockReset(); fixture.queries = [];
});

describe("buyer PDF access remains bound to the signing session", () => {
  it("rejects an expired token before reading customer data", async () => {
    const response = await get("current", "expired");
    expect(response.status).toBe(401); expect(fixture.service).not.toHaveBeenCalled(); expect(fixture.pdf).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("rejects an agreement belonging to another deal", async () => {
    fixture.agreements.push(signed("other", "billOfSale", "deal-2"));
    expect((await get("other")).status).toBe(404); expect(fixture.pdf).not.toHaveBeenCalled();
    expect(fixture.queries.find(query => query.table === "document_agreements")?.filters).toContainEqual(["deal_id", "deal-1"]);
  });
  it("returns the signed buyer PDF with ID imagery stripped and private headers", async () => {
    const response = await get("current");
    expect(response.status).toBe(200);
    expect(fixture.pdf).toHaveBeenCalledWith({ agreementId: "current", copyLabel: "BUYER COPY", includeSignatures: true, stripIdImagery: true });
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="billOfSale-signed.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
  it("opens inline only when requested explicitly", async () => {
    expect((await get("current", "valid", true)).headers.get("Content-Disposition")).toMatch(/^inline;/);
  });
  it("does not offer an unsigned or superseded signed row", async () => {
    fixture.agreements = [{ ...signed("new"), has_buyer_signature: false, signed_at: null }, signed("old")];
    expect((await get("new")).status).toBe(404);
    expect((await get("old")).status).toBe(404);
    expect(fixture.pdf).not.toHaveBeenCalled();
  });
  it("does not offer a draft or a row without its filed document payload", async () => {
    fixture.agreements = [{ ...signed("draft"), finalized_at: null, status: "draft" }, { ...signed("no-payload", "form130U"), completed_link: null }];
    expect((await get("draft")).status).toBe(404);
    expect((await get("no-payload")).status).toBe(404);
    expect(fixture.pdf).not.toHaveBeenCalled();
  });
  it("keeps ink-only POA and dealer-signed title forms outside the buyer ceremony", async () => {
    fixture.stepData = { salePlan: { registrationBy: "dealer", titleSignedBy: "dealer" } };
    fixture.agreements = [signed("poa", "powerOfAttorney"), signed("title", "form130U")];
    expect((await get("poa")).status).toBe(404);
    expect((await get("title")).status).toBe(404);
    expect(fixture.pdf).not.toHaveBeenCalled();
  });
  it("fails closed when the database or renderer is unavailable", async () => {
    fixture.databaseError = true;
    expect((await get("current")).status).toBe(503); expect(fixture.pdf).not.toHaveBeenCalled();
    fixture.databaseError = false; fixture.pdf.mockRejectedValue(new Error("internal detail"));
    const response = await get("current");
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("internal detail");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
