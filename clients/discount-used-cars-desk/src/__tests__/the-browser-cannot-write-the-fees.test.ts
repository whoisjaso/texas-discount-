import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser cannot write a sale's fees (rulebook texas-dealer-fees.md 5.1):
 * the copy is written at Start A Sale, and after that only by the two server
 * paths that say so. Every other step-data write that would change it is
 * refused, and a copy that does not match the fee record (a write that went
 * around the desk) is refused at filing.
 */

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

import { feeFields, saveThroughMock } from "./helpers/fees";
import { CASH_SALE, FEE_DEAL, feeCopy, moneyFor, seedFeeDeal } from "./helpers/fee-filing";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { readDealFees, writeDealFees } from "@/lib/sales/fee-schedule";

const file = (formData: Record<string, unknown>) =>
  finalizePaperwork(FEE_DEAL, "billOfSale", { buyerName: "Andrea Salinas", vehicleDescription: "2017 Ford Explorer", vehicleVin: "1FM5K8D80HGA00001", formData, signature: null });

async function copyOnDeal() {
  const { data } = await createMockSupabaseClient().from("deals").select("step_data").eq("id", FEE_DEAL).maybeSingle();
  return readDealFees((data as { step_data: unknown }).step_data);
}

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("a step-data write", () => {
  it("that would change the fee copy is refused, and the copy stays", async () => {
    await seedFeeDeal(writeDealFees(CASH_SALE, feeCopy()));
    const client = createMockSupabaseClient();
    const result = await casMergeStepData(client, FEE_DEAL, (current) => ({ ...current, fees: { ...feeCopy(), docFee: 0 } }));
    expect(result).toEqual({ ok: false, error: "fees-protected" });
    expect(await copyOnDeal()).toMatchObject({ kind: "valid", fees: { docFee: 150 } });
    // Removing it is a change too.
    expect(await casMergeStepData(client, FEE_DEAL, (current) => ({ ...current, fees: null }))).toEqual({ ok: false, error: "fees-protected" });
  });

  it("that carries the copy unchanged, or leaves it out, goes through", async () => {
    await seedFeeDeal(writeDealFees(CASH_SALE, feeCopy()));
    const client = createMockSupabaseClient();
    expect(await casMergeStepData(client, FEE_DEAL, (current) => ({ ...current, plate: "ABC1234" }))).toMatchObject({ ok: true });
    expect(await casMergeStepData(client, FEE_DEAL, () => ({ plateAsked: true }))).toMatchObject({ ok: true });
    expect(await copyOnDeal()).toMatchObject({ kind: "valid", fees: { docFee: 150 } });
  });

  it("from a server path that says it writes the fees goes through", async () => {
    await seedFeeDeal(writeDealFees(CASH_SALE, feeCopy()));
    const result = await casMergeStepData(createMockSupabaseClient(), FEE_DEAL, (current) => writeDealFees(current, feeCopy({ docFee: 175, scheduleVersion: 2 })), {
      writesFees: true,
    });
    expect(result).toMatchObject({ ok: true });
    expect(await copyOnDeal()).toMatchObject({ kind: "valid", fees: { docFee: 175 } });
  });
});

describe("a copy that does not match the fee record", () => {
  beforeEach(async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
  });

  it("is refused at filing: a doc fee the record never saved", async () => {
    const copy = feeCopy({ docFee: 100, scheduleVersion: 1 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    expect(await file({ ...moneyFor(stepData, copy) })).toMatchObject({ ok: false, code: "feeRecordTampered" });
    expect(mockInserted("document_agreements")).toEqual([]);
  });

  it("is refused at filing: a version that was never saved", async () => {
    const copy = feeCopy({ docFee: 150, scheduleVersion: 7 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    expect(await file({ ...moneyFor(stepData, copy) })).toMatchObject({ ok: false, code: "feeRecordTampered" });
  });

  it("is refused at filing: a copy that is not one at all", async () => {
    const stepData = { ...CASH_SALE, fees: { docFee: "150" } };
    await seedFeeDeal(stepData);
    expect(await file({ ...moneyFor(stepData, feeCopy()) })).toMatchObject({ ok: false, code: "feeRecordTampered" });
  });

  it("files when it matches", async () => {
    const copy = feeCopy();
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    expect(await file({ ...moneyFor(stepData, copy) })).toMatchObject({ ok: true });
  });
});
