import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Law and code review, 2026-10-03 (minor): the older document routes
 * checked the dealer charges only on a POST carrying a decodable completed
 * link, and against the current schedule rather than the deal's own fees.
 * Around it: a pending document's portal data (which /complete turns into
 * the printed link) was never checked; a link that could not be decoded
 * skipped the check; PATCH could set a finished link unchecked; /complete
 * encoded whatever the portal data said; and a contract filed that way
 * printed the old, non-statutory clause 16.
 *
 * Now every payload a fee document will print from is checked the way the
 * sale's own filing checks it (against the deal's own fees when the document
 * names its deal), a POSTed link that cannot be decoded is refused, what
 * files carries the documentary fee notice's stamp, and /complete refuses a
 * documentary fee prepared without it.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ rows: {} as Record<string, Row>, inserts: [] as Row[], updates: [] as Row[] }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/notifications/owner", () => ({ notifyOwnerDocumentSigned: vi.fn(() => Promise.resolve({ ok: true })) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          single: async () => ({ data: db.rows[value] ?? null, error: db.rows[value] ? null : { message: "not found" } }),
          maybeSingle: async () => ({ data: db.rows[value] ?? null, error: null }),
          then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
        }),
      }),
      insert: (row: Row) => {
        db.inserts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "agreement-1", ...row }, error: null }) }) };
      },
      update: (row: Row) => {
        db.updates.push(row);
        const query = {
          eq: () => query,
          select: () => ({
            single: async () => ({ data: { id: "x", ...row }, error: null }),
            maybeSingle: async () => ({ data: { id: "x", status: row.status }, error: null }),
          }),
        };
        return query;
      },
    }),
  }),
}));

import { feeFields, saveThroughMock } from "./helpers/fees";
import { CASH_SALE, FEE_DEAL, feeCopy, seedFeeDeal } from "./helpers/fee-filing";
import { resetMockWrites } from "@/lib/supabase/mock";
import { writeDealFees } from "@/lib/sales/fee-schedule";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import { PATCH, POST } from "@/app/api/documents/agreements/route";
import { POST as COMPLETE } from "@/app/api/documents/agreements/complete/route";

const request = (url: string, method: string, body: Row) =>
  new NextRequest(new URL(url), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const post = (body: Row) => POST(request("http://localhost/api/documents/agreements", "POST", body));
const patch = (body: Row) => PATCH(request("http://localhost/api/documents/agreements", "PATCH", body));
const complete = (body: Row) => COMPLETE(request("http://localhost/api/documents/agreements/complete", "POST", body));

const figures = (over: Row = {}) => ({ salePrice: 9000, tax: 562.5, titleFee: 33, docFee: 150, registrationFee: 75, otherFees: 0, ...over });
const link = (dd: Row) => encodeCompletedLink("billOfSale", figures(dd), {}, "https://x.test");

beforeEach(async () => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  db.rows = {};
  db.inserts = [];
  db.updates = [];
  resetMockWrites();
  // The owner's schedule: $150.
  expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("POST", () => {
  it("checks a pending document's portal data, which the customer later completes from", async () => {
    const over = await post({ document_type: "billOfSale", status: "pending", portal_data: { s: "billOfSale", d: figures({ docFee: 300 }) } });
    expect(over.status).toBe(422);
    expect(await over.json()).toMatchObject({ code: "feeOverLimit" });
    const other = await post({ document_type: "financing", status: "pending", portal_data: { s: "financing", d: figures({ otherFees: 49, otherFeesDescription: "Etch" }) } });
    expect(other.status).toBe(422);
    expect(await other.json()).toMatchObject({ code: "otherDealerFee" });
    expect(db.inserts).toEqual([]);
  });

  it("stamps the notice on what it stores, so it prints beside the fee", async () => {
    expect((await post({ document_type: "billOfSale", status: "pending", language: "es", portal_data: { s: "billOfSale", d: figures() } })).status).toBe(200);
    expect((db.inserts[0].portal_data as { d: Row }).d).toMatchObject({ docFeeNotice: 1, docFeeNoticeSpanish: true, docFee: 150 });
    expect((await post({ document_type: "financing", status: "completed", completed_link: link({}) })).status).toBe(200);
    const stored = decodeCompletedLinkFromUrl(String(db.inserts[1].completed_link))!;
    expect(stored.dd).toMatchObject({ docFeeNotice: 1, docFeeNoticeSpanish: false, docFee: 150 });
  });

  it("refuses a completed link it cannot read, rather than filing it unchecked", async () => {
    const response = await post({ document_type: "billOfSale", status: "completed", completed_link: "https://x.test/documents/portal#completed/%%%" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "linkUnreadable" });
    expect(db.inserts).toEqual([]);
  });

  it("compares a document naming its deal with that deal's own fees", async () => {
    // The sale started at $150; the owner has since raised the fee to $175.
    await seedFeeDeal(writeDealFees(CASH_SALE, feeCopy()));
    expect((await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1)).error).toBeNull();
    expect((await post({ document_type: "billOfSale", status: "pending", deal_id: FEE_DEAL, completed_link: link({ docFee: 150 }) })).status).toBe(200);
    const today = await post({ document_type: "billOfSale", status: "pending", deal_id: FEE_DEAL, completed_link: link({ docFee: 175 }) });
    expect(today.status).toBe(422);
    expect(await today.json()).toMatchObject({ code: "feeRecordTampered" });
  });
});

describe("PATCH", () => {
  it("checks and stamps a finished link set on a fee document", async () => {
    db.rows.d = { id: "d", deal_id: null, document_type: "billOfSale", status: "pending", language: "en" };
    const refused = await patch({ id: "d", completed_link: link({ otherFees: 75, otherFeesDescription: "Dealer prep" }) });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ code: "otherDealerFee" });
    expect(db.updates).toEqual([]);
    expect((await patch({ id: "d", completed_link: link({}) })).status).toBe(200);
    expect(decodeCompletedLinkFromUrl(String(db.updates[0].completed_link))!.dd).toMatchObject({ docFeeNotice: 1 });
  });
});

describe("the customer's completion", () => {
  const pending = (d: Row): Row => ({
    id: "c",
    status: "pending",
    buyer_name: "Andrea Salinas",
    document_type: "billOfSale",
    vehicle_description: "2017 Ford Explorer",
    parent_agreement_id: null,
    portal_data: { s: "billOfSale", d },
    customer_id: null,
    deal_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    deleted_at: null,
    signing_token: "token",
    signing_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    language: "en",
    vehicles: null,
  });
  const sign = () => complete({ id: "c", signing_token: "token", buyer_signature: "data:image/png;base64,AAAA", has_buyer_signature: true });

  it("refuses a fee over the limit before anything is written", async () => {
    db.rows.c = pending({ ...figures({ docFee: 300 }), docFeeNotice: 1 });
    const response = await sign();
    expect(response.status).toBe(422);
    expect(db.updates).toEqual([]);
  });

  it("refuses a documentary fee prepared without its notice", async () => {
    db.rows.c = pending(figures());
    const response = await sign();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "docFeeNoticeMissing" });
    expect(db.updates).toEqual([]);
  });

  it("completes one prepared with it, and the printed link carries the stamp", async () => {
    db.rows.c = pending({ ...figures(), docFeeNotice: 1, docFeeNoticeSpanish: false });
    expect((await sign()).status).toBe(200);
    const printed = decodeCompletedLinkFromUrl(String(db.updates[0].completed_link))!;
    expect(printed.dd).toMatchObject({ docFeeNotice: 1, docFee: 150 });
  });
});
