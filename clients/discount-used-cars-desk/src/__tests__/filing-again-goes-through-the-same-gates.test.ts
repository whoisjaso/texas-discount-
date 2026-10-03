import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Filing again goes through the same gates (owner's decision 10/02/2026; SOP
 * "The documents", Voiding and filing again).
 *
 * After a void the corridor files the documents again through its normal
 * steps, and three more refusals keep the new copies honest: one current bill
 * of sale per sale, the documents printing its figures wait for it, and the
 * figures the review screen posts must be the server's own. A re-filed copy
 * names the voided one it replaces. Complete Sale waits for everything voided
 * to be filed again, and a sale holding voided records cannot be deleted.
 */

const state = vi.hoisted(() => ({ role: "owner" as string }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: state.role, user: { id: "u1" }, member: { id: "member-1" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "u1" }, role: state.role, member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { paperworkMoney, readPaperwork, type PaperworkMoney } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { filingGate, figuresDiffer, replacedCopyId } from "@/lib/sales/refile-gates";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { completeSale } from "@/lib/actions/complete-sale";

const DEAL = "refile-deal";
const VOIDED_AT = "2026-10-02T15:00:00.000Z";

const STEP_DATA = {
  languageConfirmed: { value: "en", at: "2026-10-02T13:00:00Z", by: "u1" },
  funding: { type: "inHouse", lenderId: null, lenderOther: null },
  money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "2000" },
  salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
  paperwork: {
    billOfSale: { tradeIn: "yes", tradeInAllowance: "2000", tradeInDescription: "2012 Honda Civic LX" },
    financing: { downPayment: "2000", paymentFrequency: "Monthly" },
  },
};

const money: PaperworkMoney = paperworkMoney(9000, readPaperwork(STEP_DATA, "billOfSale"), readMoney(STEP_DATA), "inHouse");

async function seed(documents: Array<Record<string, unknown>>) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: "in_progress",
    language: "en",
    step_data: STEP_DATA,
    customers: { id: "refile-buyer", name: "Andrea Salinas", phone: "7135550188" },
    vehicles: { id: "refile-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean", sale_price: 9000 },
  });
  if (documents.length) await client.from("document_agreements").insert(documents.map((row) => ({ deal_id: DEAL, language: "en", ...row })));
}

const filed = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  document_type: type,
  status: "finalized",
  finalized_at: "2026-10-02T14:00:00.000Z",
  completed_at: "2026-10-02T14:00:00.000Z",
  has_buyer_signature: true,
  ...extra,
});
const voided = (id: string, type: string) => filed(id, type, { voided_at: VOIDED_AT, void_reason: "The down payment changed", void_group_id: "g1", voided_by_name: "Maria Lopez" });

const file = (type: string, formData: Record<string, unknown> = { ...money }) =>
  finalizePaperwork(DEAL, type, { buyerName: "Andrea Salinas", vehicleDescription: "2017 Ford Explorer", vehicleVin: "1FM5K8D80HGA00001", formData, signature: null });

beforeEach(() => {
  resetMockWrites();
  state.role = "owner";
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("the gates, as rules", () => {
  const expected = { money, downPayment: 2000 };
  const owed = ["billOfSale", "form130U", "financing"];

  it("one current bill of sale per sale; a 130-U may still be filed again alone", () => {
    const rows = [filed("b1", "billOfSale"), filed("t1", "form130U")];
    expect(filingGate({ documentType: "billOfSale", rows, owed, formData: { ...money }, expected })).toBe("billOfSaleAlreadyFiled");
    expect(filingGate({ documentType: "salvageBillOfSale", rows, owed, formData: { ...money }, expected })).toBe("billOfSaleAlreadyFiled");
    expect(filingGate({ documentType: "form130U", rows, owed, formData: { ...money }, expected })).toBeNull();
    expect(filingGate({ documentType: "billOfSale", rows: [voided("b0", "billOfSale")], owed, formData: { ...money }, expected })).toBeNull();
  });

  it("the documents printing its figures wait for a current bill of sale; the rebuilt disclosure never does", () => {
    const rows = [voided("b0", "billOfSale")];
    for (const type of ["form130U", "financing", "vehicleResponsibility"]) {
      expect(filingGate({ documentType: type, rows, owed, formData: { ...money, downPayment: "2000" }, expected }), type).toBe("billOfSaleFirst");
    }
    expect(filingGate({ documentType: "rebuiltDisclosure", rows, owed, formData: {}, expected })).toBeNull();
    expect(filingGate({ documentType: "insuranceAcknowledgment", rows, owed, formData: {}, expected })).toBeNull();
    // A tow-away sale's root is the salvage bill of sale.
    expect(filingGate({ documentType: "towAwayAcknowledgment", rows: [], owed: ["salvageBillOfSale", "towAwayAcknowledgment"], formData: {}, expected })).toBe("billOfSaleFirst");
  });

  it("refuses figures that are not the server's own", () => {
    expect(figuresDiffer("billOfSale", { ...money }, expected)).toBe(false);
    for (const [key, value] of [["salePrice", money.salePrice + 1], ["paidToday", 1500], ["sellerLienAmount", 1], ["total", money.total - 0.01]] as const) {
      expect(figuresDiffer("billOfSale", { ...money, [key]: value }, expected), key).toBe(true);
    }
    expect(figuresDiffer("billOfSale", { ...money, sellerLienEnabled: !money.sellerLienEnabled }, expected)).toBe(true);
    // Typed differently is the same figure.
    expect(figuresDiffer("billOfSale", { ...money, salePrice: `$${money.salePrice.toLocaleString("en-US")}` }, expected)).toBe(false);
    // The keys are required on the documents that print the figures.
    const { total: _total, ...missing } = money;
    void _total;
    expect(figuresDiffer("form130U", missing, expected)).toBe(true);
    expect(figuresDiffer("insuranceAcknowledgment", {}, expected)).toBe(false);
    // The quoted registration and the contract's down payment.
    expect(figuresDiffer("vehicleResponsibility", { ...money, quotedRegistrationAmount: money.registrationCost }, expected)).toBe(false);
    expect(figuresDiffer("vehicleResponsibility", { ...money, quotedRegistrationAmount: money.registrationCost + 5 }, expected)).toBe(true);
    expect(figuresDiffer("financing", { ...money, downPayment: "2000" }, expected)).toBe(false);
    expect(figuresDiffer("financing", { ...money, downPayment: "1500" }, expected)).toBe(true);
  });

  it("names the newest voided copy a new filing replaces", () => {
    const rows = [voided("b0", "billOfSale"), { ...voided("b1", "billOfSale"), voided_at: "2026-10-02T16:00:00.000Z" }, filed("t1", "form130U")];
    expect(replacedCopyId(rows, "billOfSale")).toBe("b1");
    expect(replacedCopyId(rows, "form130U")).toBeNull();
  });
});

describe("finalizePaperwork, on the preview store", () => {
  it("refuses a second bill of sale while one is current", async () => {
    await seed([filed("bos", "billOfSale")]);
    expect(await file("billOfSale")).toMatchObject({ ok: false, code: "billOfSaleAlreadyFiled" });
  });

  it("refuses the 130-U and the contract before the bill of sale is filed again", async () => {
    await seed([voided("bos", "billOfSale"), voided("t130", "form130U")]);
    expect(await file("form130U")).toMatchObject({ ok: false, code: "billOfSaleFirst" });
    expect(await file("financing", { ...money, downPayment: "2000" })).toMatchObject({ ok: false, code: "billOfSaleFirst" });
  });

  it("refuses figures that changed since the review screen opened", async () => {
    await seed([voided("bos", "billOfSale")]);
    expect(await file("billOfSale", { ...money, paidToday: 1500, sellerLienAmount: money.total - 1500 })).toMatchObject({ ok: false, code: "figuresChanged" });
    expect(await file("billOfSale", { ...money, salePrice: 8000 })).toMatchObject({ ok: false, code: "figuresChanged" });
  });

  it("files the bill of sale again, pointing at the voided copy it replaces", async () => {
    await seed([voided("bos", "billOfSale"), voided("t130", "form130U")]);
    const result = await file("billOfSale");
    expect(result).toMatchObject({ ok: true });
    const fresh = mockInserted("document_agreements").find((row) => row.id === result.agreementId);
    expect(fresh).toMatchObject({ document_type: "billOfSale", parent_agreement_id: "bos" });
    expect(fresh?.voided_at).toBeUndefined();
    // And the 130-U may follow it now.
    const next = await file("form130U");
    expect(next).toMatchObject({ ok: true });
    expect(mockInserted("document_agreements").find((row) => row.id === next.agreementId)).toMatchObject({ parent_agreement_id: "t130" });
  });

  it("keeps the existing pins: nothing reads document_agreements or the sale before the filing gates", () => {
    const source = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    const gate = source.indexOf("dealerSignerProblem(");
    const facts = source.indexOf("documentFilingBlockedReason(documentType)");
    expect(gate).toBeGreaterThan(-1);
    expect(source.indexOf('.from("document_agreements")')).toBeGreaterThan(Math.max(gate, facts));
    expect(source.indexOf("getSaleDetail(dealId)")).toBeGreaterThan(Math.max(gate, facts));
    // The new reads go through the helper, never a second literal.
    expect(source.match(/\.from\("document_agreements"\)/g)).toHaveLength(1);
    expect(source).toMatch(/readDealAgreements\(supabase, dealId\)/);
  });
});

describe("Complete Sale and Delete", () => {
  it("refuses to close a sale until every voided document it owes is filed again", async () => {
    await seed([voided("bos", "billOfSale"), filed("bos2", "billOfSale", { finalized_at: "2026-10-02T15:10:00.000Z" }), voided("t130", "form130U"), voided("fin", "financing")]);
    const result = await completeSale({ dealId: DEAL });
    expect(result).toMatchObject({ success: false, code: "voidedNotRefiled" });
    expect((result as { error: string }).error).toBe(
      "Some paperwork was voided and has not been filed again: Form 130-U, Financing Contract. File it before closing the sale.",
    );
  });

  it("closes once everything is filed again", async () => {
    await seed([
      voided("bos", "billOfSale"),
      filed("bos2", "billOfSale", { finalized_at: "2026-10-02T15:10:00.000Z" }),
      filed("t2", "form130U", { finalized_at: "2026-10-02T15:11:00.000Z" }),
      filed("f2", "financing", { finalized_at: "2026-10-02T15:12:00.000Z" }),
    ]);
    expect(await completeSale({ dealId: DEAL })).toMatchObject({ success: true });
  });

  it("never deletes a sale holding voided records", async () => {
    await seed([voided("bos", "billOfSale")]);
    const { deleteSaleAction } = await import("@/lib/actions/delete-sale");
    const result = await deleteSaleAction(DEAL, { confirmSigned: true });
    expect(result).toEqual({
      ok: false,
      error: "This sale has voided paperwork on record. Voided records are kept, so the sale cannot be deleted. Abandon it instead.",
    });
    expect(mockInserted("document_agreements").filter((row) => row.deal_id === DEAL)).toHaveLength(1);
  });
});
