import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Filing refuses a documentary fee over its limit under the law as it stands
 * at filing (rulebook texas-dealer-fees.md 5.4): $225.00, or a complete OCCC
 * filing still recorded under Your Fees, never above the filed maximum.
 * DESK_ALLOW_UNSET_FACTS never lifts it; a fee record nobody could read files
 * nothing; and every refusal that existed keeps its place ahead of it.
 */

const failing = vi.hoisted(() => ({ feeTable: false }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/supabase/admin-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/supabase/admin-data")>();
  const { withFailingFeeTable } = await import("./helpers/fee-failure");
  return {
    ...real,
    createAdminDataClient: async () => {
      const client = await real.createAdminDataClient();
      return failing.feeTable ? withFailingFeeTable(client) : client;
    },
  };
});

import { feeFields, occcFiling, saveThroughMock } from "./helpers/fees";
import { CASH_SALE, FEE_DEAL, feeCopy, moneyFor, seedFeeDeal } from "./helpers/fee-filing";
import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { applyCurrentFeesToSaleAction } from "@/lib/actions/dealer-fees";
import { FILING_GATE_MESSAGES } from "@/lib/sales/refile-gates";
import { readDealFees, writeDealFees, type DealFees } from "@/lib/sales/fee-schedule";
import { createMockSupabaseClient } from "@/lib/supabase/mock";

const file = (formData: Record<string, unknown>, fileFn = finalizePaperwork) =>
  fileFn(FEE_DEAL, "billOfSale", { buyerName: "Andrea Salinas", vehicleDescription: "2017 Ford Explorer", vehicleVin: "1FM5K8D80HGA00001", formData, signature: null });

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  failing.feeTable = false;
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  resetMockWrites();
});

describe("a fee over $225.00 with no filing", () => {
  it("is refused at filing, with the citation, and DESK_ALLOW_UNSET_FACTS does not lift it", async () => {
    // The config seed of $230 with no OCCC filing: the copy is the record's own.
    vi.stubEnv("NEXT_PUBLIC_DEALER_DOC_FEE", "230");
    for (const key of ["MAX", "ON", "EFFECTIVE_ON", "LICENSE", "LOCATION"]) {
      vi.stubEnv(key === "ON" ? "NEXT_PUBLIC_DEALER_OCCC_FILED_ON" : key === "MAX" ? "NEXT_PUBLIC_DEALER_OCCC_FILED_MAX" : `NEXT_PUBLIC_DEALER_OCCC_${key}`, "");
    }
    vi.resetModules();
    const { finalizePaperwork: fresh } = await import("@/lib/actions/paperwork");
    const copy = feeCopy({ docFee: 230, scheduleVersion: 0, source: "config" });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    const result = await file({ ...moneyFor(stepData, copy) }, fresh);
    expect(result).toMatchObject({ ok: false, code: "feeOverLimit" });
    expect(result.error).toBe(FILING_GATE_MESSAGES.feeOverLimit);
    expect(result.error).toMatch(/\$225\.00, 7 TAC §84\.205\(b\)\(1\)/);
    expect(mockInserted("document_agreements")).toEqual([]);
  });
});

describe("an OCCC filing removed from Your Fees", () => {
  it("refuses an open $292 sale that relied on it, until today's fees are applied", async () => {
    expect((await saveThroughMock(feeFields({ docFeeCents: 29200, occcFiling: occcFiling(30000) }), 0)).error).toBeNull();
    const copy = feeCopy({ docFee: 292, docFeeCapCents: 30000, occcFiling: occcFiling(30000), scheduleVersion: 1 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    // Allowed while the filing is recorded.
    expect(await file({ ...moneyFor(stepData, copy) })).toMatchObject({ ok: true });
  });

  it("refuses once the filing is gone, and Apply Today's Fees fixes it", async () => {
    await saveThroughMock(feeFields({ docFeeCents: 29200, occcFiling: occcFiling(30000) }), 0);
    const copy = feeCopy({ docFee: 292, docFeeCapCents: 30000, occcFiling: occcFiling(30000), scheduleVersion: 1 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    expect((await saveThroughMock(feeFields({ docFeeCents: 15000 }), 1)).error).toBeNull();

    expect(await file({ ...moneyFor(stepData, copy) })).toMatchObject({ ok: false, code: "feeOverLimit" });
    expect(mockInserted("document_agreements")).toEqual([]);

    expect(await applyCurrentFeesToSaleAction(FEE_DEAL)).toEqual({ ok: true });
    const { data } = await createMockSupabaseClient().from("deals").select("step_data").eq("id", FEE_DEAL).maybeSingle();
    const now = readDealFees((data as { step_data: unknown }).step_data);
    expect(now.kind).toBe("valid");
    const applied = (now as { fees: DealFees }).fees;
    expect(applied).toMatchObject({ docFee: 150, scheduleVersion: 2, occcFiling: null });
    expect(await file({ ...moneyFor(stepData, applied) })).toMatchObject({ ok: true });
  });
});

describe("a fee record nobody can read", () => {
  it("files nothing", async () => {
    const copy = feeCopy({ docFee: 292, scheduleVersion: 0, source: "config", docFeeCapCents: 29200, occcFiling: occcFiling(29200, { filedOn: "2026-01-02", effectiveOn: "2026-01-02", licenseOrNmls: "TEST FIXTURE", location: "TEST FIXTURE" }) });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    failing.feeTable = true;
    expect(await file({ ...moneyFor(stepData, copy) })).toEqual({
      ok: false,
      code: "feeSettingsUnreadable",
      error: "The fee settings could not be read. Nothing was filed.",
    });
    expect(mockInserted("document_agreements")).toEqual([]);
    failing.feeTable = false;
    expect(await file({ ...moneyFor(stepData, copy) })).toMatchObject({ ok: true });
  });
});

describe("the refusals keep their order", () => {
  it("dealer facts, then the document's own fact, then every existing gate, then the fees", () => {
    const source = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    const at = (needle: string) => {
      const index = source.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    const facts = at("filingBlockedReason()");
    const documentFact = at("documentFilingBlockedReason(documentType)");
    const gates = at("filingGate({");
    const printed = at("figuresDisagreeWithBillOfSale(documentType");
    const weight = at("emptyWeightForFiling(sale)");
    const fees = at("dealerChargesBlockedReason(feeContext, input.formData)");
    const insert = at('.from("document_agreements")');
    expect(facts).toBeLessThan(documentFact);
    expect(documentFact).toBeLessThan(gates);
    expect(gates).toBeLessThan(printed);
    expect(printed).toBeLessThan(weight);
    expect(weight).toBeLessThan(fees);
    expect(fees).toBeLessThan(insert);
  });

  it("refuses a missing dealer fact before a fee over the limit", async () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    await saveThroughMock(feeFields({ docFeeCents: 29200, occcFiling: occcFiling(30000) }), 0);
    const copy = feeCopy({ docFee: 292, docFeeCapCents: 30000, occcFiling: occcFiling(30000), scheduleVersion: 1 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    await saveThroughMock(feeFields({ docFeeCents: 15000 }), 1);
    const result = await file({ ...moneyFor(stepData, copy) });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^Add these dealer details before filing: /);
    expect(result).not.toHaveProperty("code");
  });
});
