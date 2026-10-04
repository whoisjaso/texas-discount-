import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Code review, 2026-10-03 (minor): the audit around a sale's fees was best
 * effort.
 *
 *   - "Apply Today's Fees" never checked its activity insert (supabase-js
 *     returns { error }, it does not throw), so it reported success with no
 *     record; it rewrote closed or abandoned sales; and a bill of sale filed
 *     between its check and its write left a copy disagreeing with the paper.
 *   - The legacy copy written on a money save was not logged at all.
 *   - The change log's "onboarding" or "settings" label came from the browser.
 *
 * Now the copy and its record go together (a failed record, or a bill of sale
 * filed in the same moment, puts the copy back and reports nothing applied),
 * a closed sale is refused, the legacy copy is logged, and the label is the
 * server's own: settings once the owner's onboarding is finished.
 */

const state = vi.hoisted(() => ({
  failActivity: false,
  onboarded: null as string | null,
}));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({
    ok: true,
    role: "owner",
    user: { id: "local-admin-preview", email: "owner@example.dev" },
    member: { id: "member-1", full_name: "Maria Lopez", onboarding_completed_at: state.onboarded },
  }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/sales/filed-bill-of-sale", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sales/filed-bill-of-sale")>();
  return { ...actual, filedBillOfSaleOn: vi.fn(actual.filedBillOfSaleOn) };
});
vi.mock("@/lib/supabase/server", async () => {
  const { createMockSupabaseClient } = await import("@/lib/supabase/mock");
  const { createLocalAdminUser } = await import("@/lib/auth/local-admin");
  return {
    createClient: async () => {
      // The owner's own session, as the preview signs it in.
      const client = createMockSupabaseClient(createLocalAdminUser("owner@example.dev", "owner"));
      const from = client.from.bind(client);
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "from") return Reflect.get(target, prop);
          return (table: string) => {
            const builder = from(table);
            if (table !== "team_activity_events" || !state.failActivity) return builder;
            return new Proxy(builder, {
              get(inner, key) {
                if (key === "insert") return () => Promise.resolve({ data: null, error: { message: "activity log unavailable" } });
                return Reflect.get(inner, key);
              },
            });
          };
        },
      });
    },
  };
});

import { feeFields, saveThroughMock } from "./helpers/fees";
import { CASH_SALE, FEE_DEAL, feeCopy, seedFeeDeal } from "./helpers/fee-filing";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { applyCurrentFeesToSaleAction, saveDealerFeesAction } from "@/lib/actions/dealer-fees";
import { saveSaleMoney } from "@/lib/actions/sale-money";
import { getDealerFeeChanges } from "@/lib/dealership-fees";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { readDealFees, writeDealFees } from "@/lib/sales/fee-schedule";
import type { FeeScheduleInput } from "@/lib/sales/fee-schedule";

const INPUT: FeeScheduleInput = {
  docFee: "150",
  occcFiling: null,
  writesFinanceContracts: true,
  nmlsId: "",
  legacyLicense: "",
  deputy: { isDeputy: false, fee: "" },
  vit: { inBusinessJan1: false, passesThrough: null, unitFactor: "" },
  financesCh345: false,
};

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  state.failActivity = false;
  state.onboarded = null;
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(filedBillOfSaleOn).mockClear();
  resetMockWrites();
});

async function startedAt150ThenRaised() {
  expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
  await seedFeeDeal(writeDealFees(CASH_SALE, feeCopy()));
  expect((await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1)).error).toBeNull();
}
const heldDocFee = async () => {
  const read = readDealFees((await getSaleDetail(FEE_DEAL))?.stepData);
  return read.kind === "valid" ? read.fees.docFee : null;
};

describe("Apply Today's Fees", () => {
  it("applies and records it", async () => {
    await startedAt150ThenRaised();
    expect(await applyCurrentFeesToSaleAction(FEE_DEAL)).toEqual({ ok: true });
    expect(await heldDocFee()).toBe(175);
    const event = mockInserted("team_activity_events").find((row) => row.event_type === "deal_fees_applied");
    expect(event?.body).toMatch(/applied today's fees to this sale: documentary fee \$175\.00 \(was \$150\.00\)\./);
  });

  it("puts the copy back when its record cannot be written", async () => {
    await startedAt150ThenRaised();
    state.failActivity = true;
    expect(await applyCurrentFeesToSaleAction(FEE_DEAL)).toMatchObject({ ok: false, code: "couldNotSave" });
    expect(await heldDocFee()).toBe(150);
  });

  it("puts the copy back when a bill of sale was filed in the same moment", async () => {
    await startedAt150ThenRaised();
    vi.mocked(filedBillOfSaleOn)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ type: "billOfSale", advertised: 9000, printed: { plate: "", buyerLicense: "" } });
    expect(await applyCurrentFeesToSaleAction(FEE_DEAL)).toMatchObject({ ok: false, code: "voidFirst" });
    expect(await heldDocFee()).toBe(150);
    expect(mockInserted("team_activity_events").filter((row) => row.event_type === "deal_fees_applied")).toEqual([]);
  });

  it("refuses a sale that is no longer open", async () => {
    await startedAt150ThenRaised();
    await createMockSupabaseClient().from("deals").update({ status: "abandoned" }).eq("id", FEE_DEAL);
    expect(await applyCurrentFeesToSaleAction(FEE_DEAL)).toMatchObject({ ok: false, code: "saleClosed" });
    expect(await heldDocFee()).toBe(150);
  });
});

describe("the legacy copy", () => {
  it("is logged when a money save gives an older sale its first copy", async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    await seedFeeDeal({ ...CASH_SALE });
    expect(await saveSaleMoney(FEE_DEAL, { priceBasis: "vehicleOnly" })).toEqual({ ok: true });
    expect(await heldDocFee()).toBe(150);
    const event = mockInserted("team_activity_events").find((row) => row.event_type === "deal_fees_copied");
    expect(event?.body).toMatch(/documentary fee \$150\.00/);
  });
});

describe("the change log's label", () => {
  it("is the server's: settings once the owner's onboarding is finished, whatever the screen says", async () => {
    state.onboarded = "2026-10-01T15:00:00.000Z";
    expect(await saveDealerFeesAction(INPUT, 0, "onboarding")).toEqual({ ok: true, version: 1 });
    const log = await getDealerFeeChanges();
    expect(log.ok && log.changes[0].source).toBe("settings");
  });

  it("is onboarding while the owner is still in it", async () => {
    expect(await saveDealerFeesAction(INPUT, 0, "settings")).toEqual({ ok: true, version: 1 });
    const log = await getDealerFeeChanges();
    expect(log.ok && log.changes[0].source).toBe("onboarding");
  });
});
