import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sale keeps the fees it started with (rulebook texas-dealer-fees.md 5.1,
 * "Uniform"): Start A Sale copies the schedule into the deal, so a change the
 * owner saves applies to sales started after it. A copy taken while the doc
 * fee was unset adopts the schedule (an unset fee was never quoted to
 * anyone). "Apply Today's Fees" moves one open sale to today's fees, and is
 * refused while its bill of sale is filed.
 */

const failing = vi.hoisted(() => ({ feeTable: false }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({
    ok: true,
    role: "owner",
    user: { id: "local-admin-preview", email: "owner@example.dev" },
    member: { id: "preview-team-member-1", full_name: "Maria Lopez" },
  }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "preview-team-member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "tj-local-admin-preview" ? { value: "owner@example.dev" } : undefined),
    set: () => {},
    getAll: () => [],
  }),
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

import { feeFields, saveThroughMock } from "./helpers/fees";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { startSale } from "@/lib/actions/start-sale";
import { applyCurrentFeesToSaleAction } from "@/lib/actions/dealer-fees";
import { getDealerFeeSchedule, loadDealFees, resolveDealFees } from "@/lib/dealership-fees";
import { readDealFees, type DealFees } from "@/lib/sales/fee-schedule";
import { paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";

type Row = Record<string, unknown>;

async function seedCars() {
  const client = createMockSupabaseClient();
  for (const [id, vin] of [
    ["fee-car-1", "4T1B11HK5KU000011"],
    ["fee-car-2", "4T1B11HK5KU000012"],
  ]) {
    await client.from("vehicles").insert({ id, year: 2019, make: "Toyota", model: "Camry", vin, title_status: "clean", sale_price: 15000, status: "available" });
  }
}

async function start(vehicleId: string, phone: string) {
  const result = await startSale({
    vehicleId,
    buyerName: "Andrea Salinas",
    buyerPhone: phone,
    buyerIdNumber: "12345678",
    language: "en",
    titleStatus: "clean",
  } as Parameters<typeof startSale>[0]);
  return result as { success: boolean; dealId?: string; error?: string };
}

async function deal(id: string): Promise<Row> {
  const { data } = await createMockSupabaseClient().from("deals").select("*").eq("id", id).maybeSingle();
  return data as Row;
}

function feesOf(row: Row): DealFees {
  const read = readDealFees(row.step_data);
  if (read.kind !== "valid") throw new Error(`no valid fee copy: ${read.kind}`);
  return read.fees;
}

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-for-the-capture-link");
  failing.feeTable = false;
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("Start A Sale", () => {
  it("copies the owner's schedule into the deal", async () => {
    await seedCars();
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    const result = await start("fee-car-1", "713-555-0101");
    expect(result, JSON.stringify(result)).toMatchObject({ success: true });
    const copy = feesOf(await deal(result.dealId!));
    expect(copy).toMatchObject({ docFee: 150, docFeeCapCents: 22500, occcFiling: null, scheduleVersion: 1, source: "owner", titleFee: 33, registrationFee: 75 });
  });

  it("copies the config seed while no owner schedule is saved", async () => {
    await seedCars();
    const result = await start("fee-car-1", "713-555-0102");
    const copy = feesOf(await deal(result.dealId!));
    // The test fixture's seed: $292 with a fixture OCCC filing (vitest.config.ts).
    expect(copy).toMatchObject({ docFee: 292, scheduleVersion: 0, source: "config", docFeeCapCents: 29200 });
  });

  it("starts nothing when the schedule cannot be read", async () => {
    await seedCars();
    failing.feeTable = true;
    const result = await start("fee-car-1", "713-555-0103");
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/fee settings could not be read/) });
    expect(mockInserted("deals")).toEqual([]);
    expect(mockInserted("customers")).toEqual([]);
  });
});

describe("a change to the fees", () => {
  it("leaves an open sale's money as it started, and reaches the next sale", async () => {
    await seedCars();
    await saveThroughMock(feeFields(), 0);
    const first = await start("fee-car-1", "713-555-0104");
    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1);
    const second = await start("fee-car-2", "713-555-0105");

    const schedule = await getDealerFeeSchedule();
    expect(schedule.ok && schedule.schedule.docFeeCents).toBe(17500);

    const open = await deal(first.dealId!);
    const loaded = await loadDealFees({ id: first.dealId!, stepData: open.step_data, vehicle: { titleStatus: "clean" } });
    expect(loaded.ok && loaded.lines).toMatchObject({ docFee: 150, titleFee: 33, registrationFee: 75, docFeeSet: true });
    const stepData = { ...(open.step_data as Row), money: { amount: "15000", priceBasis: "vehicleOnly", paidTodayAmount: "" } };
    const money = paperworkMoney(15000, readPaperwork(stepData, "billOfSale"), readMoney(stepData), "cash", loaded.ok ? loaded.lines : undefined);
    expect(money.docFee).toBe(150);
    expect(money.total).toBe(15000 + 937.5 + 33 + 150 + 75);

    expect(feesOf(await deal(second.dealId!))).toMatchObject({ docFee: 175, scheduleVersion: 2 });
  });

  it("is adopted by a copy taken while the doc fee was unset", async () => {
    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 0);
    const schedule = await getDealerFeeSchedule();
    if (!schedule.ok) throw new Error("unreadable");
    const unset = { fees: { titleFee: 33, registrationFee: 75, docFee: null, docFeeCapCents: 22500, occcFiling: null, scheduleVersion: 0, source: "config", takenAt: "2026-10-01T15:00:00.000Z", rulebookAsOf: "2026-10-03" } };
    const resolved = resolveDealFees(unset, schedule.schedule);
    expect(resolved.from).toBe("schedule");
    expect(resolved.fees).toMatchObject({ docFee: 175, scheduleVersion: 1, source: "owner" });
  });
});

describe("Apply Today's Fees", () => {
  it("moves one open sale to today's fees, on record", async () => {
    await seedCars();
    await saveThroughMock(feeFields(), 0);
    const first = await start("fee-car-1", "713-555-0106");
    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1);
    expect(await applyCurrentFeesToSaleAction(first.dealId!)).toEqual({ ok: true });
    expect(feesOf(await deal(first.dealId!))).toMatchObject({ docFee: 175, scheduleVersion: 2 });
    const event = mockInserted("team_activity_events").find((row) => row.event_type === "deal_fees_applied");
    expect(event?.body).toMatch(/applied today's fees to this sale: documentary fee \$175\.00 \(was \$150\.00\)\./);
  });

  it("is refused while the bill of sale is filed", async () => {
    await seedCars();
    await saveThroughMock(feeFields(), 0);
    const first = await start("fee-car-1", "713-555-0107");
    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1);
    await createMockSupabaseClient().from("document_agreements").insert({
      id: "fee-bos",
      deal_id: first.dealId,
      document_type: "billOfSale",
      status: "finalized",
      finalized_at: "2026-10-03T14:00:00.000Z",
      completed_at: "2026-10-03T14:00:00.000Z",
    });
    expect(await applyCurrentFeesToSaleAction(first.dealId!)).toMatchObject({ ok: false, code: "voidFirst" });
    expect(feesOf(await deal(first.dealId!))).toMatchObject({ docFee: 150, scheduleVersion: 1 });
  });
});
