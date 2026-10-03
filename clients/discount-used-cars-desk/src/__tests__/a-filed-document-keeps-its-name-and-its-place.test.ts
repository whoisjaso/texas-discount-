import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

/**
 * Two review findings on the routes around a filed document.
 *
 * 1. A Spanish buyer's PDF downloaded as "130-U_HernÃ¡ndez_A98765.pdf" (raw
 *    UTF-8 in a header) and the bill of sale as "Luca_Hernndez": the name is
 *    now sent in the RFC 6266 UTF-8 form beside an accent-folded plain name,
 *    and an ASCII name is sent exactly as before.
 * 2. The older agreements route could rewrite a sale's filed document in
 *    place (its printed payload or its status), trash it, or file a second
 *    bill of sale beside a current one. A sale's filed or voided document now
 *    stays as filed there too; a standalone document and a draft are as
 *    writable as before.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  byId: {} as Record<string, Row>,
  byDeal: {} as Record<string, Row[]>,
  updates: [] as Row[],
  inserts: [] as Row[],
  listFails: false,
  pdf: vi.fn(),
  render130: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          const list = state.listFails
            ? { data: null, error: { message: "database unavailable" } }
            : { data: column === "deal_id" ? (state.byDeal[value] ?? []) : [], error: null };
          return {
            single: async () => ({ data: state.byId[value] ?? null, error: state.byId[value] ? null : { message: "not found" } }),
            then: (resolve: (value: unknown) => unknown) => resolve(list),
          };
        },
      }),
      insert: (data: Row) => {
        state.inserts.push(data);
        return { select: () => ({ single: async () => ({ data: { id: "new", ...data }, error: null }) }) };
      },
      update: (data: Row) => {
        state.updates.push(data);
        return { eq: (_c: string, id: string) => ({ select: () => ({ single: async () => ({ data: { id, ...data }, error: null }) }) }) };
      },
    }),
  }),
}));
vi.mock("@/lib/documents/pdf-generator", () => ({ generatePdf: (...args: unknown[]) => state.pdf(...args) }));
vi.mock("@/lib/documents/render130U", () => ({ render130UPdf: (...args: unknown[]) => state.render130(...args) }));

import { GET as pdf } from "@/app/api/documents/agreements/[id]/pdf/route";
import { PATCH, POST } from "@/app/api/documents/agreements/route";

async function blankPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

const request = (method: string, body: Row) =>
  new NextRequest("http://localhost/api/documents/agreements", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  state.byId = {};
  state.byDeal = {};
  state.updates = [];
  state.inserts = [];
  state.listFails = false;
  state.pdf.mockReset().mockResolvedValue(Buffer.from(await blankPdf()));
  state.render130.mockReset();
});

describe("a buyer's accented name in the file name", () => {
  const get = (id: string) => pdf(new NextRequest(`https://desk.example/api/documents/agreements/${id}/pdf`), { params: Promise.resolve({ id }) });

  it("sends the 130-U's name in the UTF-8 form, with a plain one beside it", async () => {
    state.render130.mockResolvedValue({ ok: true, bytes: await blankPdf(), filename: "130-U_Hernández_A98765.pdf" });
    state.byId.t = { id: "t", document_type: "form130U", buyer_name: "Lucía Hernández", form_data: {} };
    const header = (await get("t")).headers.get("Content-Disposition") ?? "";
    expect(header).toBe(`attachment; filename*=UTF-8''130-U_Hern%C3%A1ndez_A98765.pdf; filename="130-U_Hernandez_A98765.pdf"`);
    expect(header).not.toMatch(/Ã/);
  });

  it("folds the accents in the bill of sale's name instead of dropping the letters", async () => {
    state.byId.b = { id: "b", document_type: "billOfSale", buyer_name: "Lucía Hernández", form_data: {} };
    const header = (await get("b")).headers.get("Content-Disposition") ?? "";
    expect(header).toMatch(/^attachment; filename="[A-Za-z]+_BillOfSale_Lucia_Hernandez_\d{8}\.pdf"$/);
  });

  it("sends an ASCII name exactly as before", async () => {
    state.render130.mockResolvedValue({ ok: true, bytes: await blankPdf(), filename: "130-U_Salinas_A12345.pdf" });
    state.byId.s = { id: "s", document_type: "form130U", buyer_name: "Andrea Salinas", form_data: {} };
    expect((await get("s")).headers.get("Content-Disposition")).toBe('attachment; filename="130-U_Salinas_A12345.pdf"');
  });
});

describe("a sale's filed document stays as filed on the older route", () => {
  const filed = { id: "f", deal_id: "deal-1", document_type: "billOfSale", status: "finalized", finalized_at: "2026-10-02T14:00:00Z", completed_at: "2026-10-02T14:00:00Z" };

  it("refuses rewriting its printed payload or its status, and trashing it", async () => {
    state.byId.f = filed;
    for (const body of [{ id: "f", completed_link: "https://x.test/documents/portal#completed/abc" }, { id: "f", status: "pending" }, { id: "f", action: "trash" }]) {
      const response = await PATCH(request("PATCH", body));
      expect(response.status, JSON.stringify(body)).toBe(409);
      expect((await response.json()).error).toMatch(/kept as it was filed/);
    }
    expect(state.updates).toEqual([]);
  });

  it("refuses the same for a voided copy", async () => {
    state.byId.v = { ...filed, id: "v", voided_at: "2026-10-02T15:00:00Z" };
    expect((await PATCH(request("PATCH", { id: "v", completed_link: "x" }))).status).toBe(409);
    expect(state.updates).toEqual([]);
  });

  it("still lets a draft be completed, a flag be set, and a standalone document be changed", async () => {
    state.byId.d = { ...filed, id: "d", status: "pending", finalized_at: null, completed_at: null };
    expect((await PATCH(request("PATCH", { id: "d", status: "completed", completed_link: "x" }))).status).toBe(200);
    state.byId.f = filed;
    expect((await PATCH(request("PATCH", { id: "f", has_dealer_signature: true }))).status).toBe(200);
    state.byId.s = { ...filed, id: "s", deal_id: null };
    expect((await PATCH(request("PATCH", { id: "s", completed_link: "x" }))).status).toBe(200);
    expect(state.updates).toHaveLength(3);
  });

  it("refuses a second filed bill of sale beside a current one, and fails closed when the rows cannot be read", async () => {
    state.byDeal["deal-1"] = [filed];
    const second = await POST(request("POST", { document_type: "billOfSale", deal_id: "deal-1", status: "completed" }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("This sale already has a filed bill of sale. Void it from the paperwork before filing it again.");
    state.listFails = true;
    expect((await POST(request("POST", { document_type: "billOfSale", deal_id: "deal-1", status: "completed" }))).status).toBe(500);
    expect(state.inserts).toEqual([]);
  });

  it("files one again once the current copy is voided, and a draft any time", async () => {
    state.byDeal["deal-1"] = [{ ...filed, voided_at: "2026-10-02T15:00:00Z" }];
    expect((await POST(request("POST", { document_type: "billOfSale", deal_id: "deal-1", status: "completed" }))).status).toBe(200);
    state.byDeal["deal-1"] = [filed];
    expect((await POST(request("POST", { document_type: "billOfSale", deal_id: "deal-1", status: "pending" }))).status).toBe(200);
    expect(state.inserts).toHaveLength(2);
  });
});
