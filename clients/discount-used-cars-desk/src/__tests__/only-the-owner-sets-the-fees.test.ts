import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Only the owner sets the dealership's fees (rulebook texas-dealer-fees.md
 * 5.2): the save action asks for admin:all, which a manager does not hold
 * (managers hold team:manage), and the database function (and the preview
 * mock standing in for it) asks again from the caller's own roster row. The
 * settings screen opens for the owner alone; the posted notice, which states
 * no figure, opens for anyone who reads sales.
 */

const session = vi.hoisted(() => ({ cookie: "owner:owner@example.dev" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "tj-local-admin-preview" ? { value: session.cookie } : undefined),
    set: () => {},
    delete: () => {},
    getAll: () => [],
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { feeFields, previewClient, saveThroughMock } from "./helpers/fees";
import { RULEBOOK_AS_OF } from "@/lib/legal/texas-dealer-fees";
import { scheduleToJson } from "@/lib/sales/fee-schedule";
import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { saveDealerFeesAction } from "@/lib/actions/dealer-fees";
import { getDealerFeeSchedule } from "@/lib/dealership-fees";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import type { FeeScheduleInput } from "@/lib/sales/fee-schedule";

const input: FeeScheduleInput = {
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
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  session.cookie = "owner:owner@example.dev";
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the save action", () => {
  it("saves for the owner", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    session.cookie = "owner:owner@example.dev";
    expect(await saveDealerFeesAction(input, 0, "onboarding")).toEqual({ ok: true, version: 1 });
    const read = await getDealerFeeSchedule();
    expect(read.ok && read.schedule.docFeeCents).toBe(15000);
  });

  it.each(["manager", "sales", "registration", "finance", "viewer"])("refuses the %s role, and writes nothing", async (role) => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    session.cookie = `${role}:${role}@example.dev`;
    const result = await saveDealerFeesAction(input, 0, "settings");
    expect(result).toMatchObject({ ok: false, code: "notOwner" });
    const read = await getDealerFeeSchedule();
    expect(read.ok && read.schedule.source).toBe("config");
    expect(mockInserted("team_activity_events")).toEqual([]);
  });

  it("refuses an over-limit fee before it reaches the database, with the code and its citation", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    const result = await saveDealerFeesAction({ ...input, docFee: "225.01" }, 0, "onboarding");
    expect(result).toMatchObject({
      ok: false,
      code: "docFeeOverPresumed",
      params: { limit: "$225.00", citation: "7 TAC §84.205(b)(1)" },
    });
    expect((await getDealerFeeSchedule()).ok && (await getDealerFeeSchedule())).toMatchObject({ schedule: { source: "config" } });
  });
});

describe("the database function", () => {
  it("refuses a salesperson's roster row, and a session with no roster row", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-sales");
    expect((await saveThroughMock(feeFields(), 0, "owner")).error).toMatchObject({ message: "forbidden" });
    vi.stubEnv("DESK_PREVIEW_MEMBER", "");
    expect((await saveThroughMock(feeFields(), 0, "owner")).error).toMatchObject({ message: "forbidden" });
  });

  it("refuses what the validator refuses, by the same code", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    expect((await saveThroughMock(feeFields({ docFeeCents: 22501 }), 0)).error).toMatchObject({ message: "docFeeOverPresumed" });
    const smuggled = await previewClient().rpc("save_dealer_fee_schedule", {
      p_expected_version: 0,
      p_next: { ...scheduleToJson(feeFields()), adminFee: 1, rulebookAsOf: RULEBOOK_AS_OF },
      p_source: "settings",
    });
    expect(smuggled.error).toMatchObject({ message: "unknownField" });
    expect((await getDealerFeeSchedule()).ok && (await getDealerFeeSchedule())).toMatchObject({ schedule: { source: "config" } });
  });
});

describe("the screens", () => {
  it("open Your Fees for the owner alone", () => {
    expect(roleOpensAdminRoute("owner", "/admin/dealership/fees")).toBe(true);
    for (const role of ["manager", "sales", "finance", "registration", "lot", "mechanic", "social", "viewer"] as const) {
      expect(roleOpensAdminRoute(role, "/admin/dealership/fees"), role).toBe(false);
    }
  });

  it("open the posted notice for anyone who reads sales", () => {
    for (const role of ["owner", "manager", "sales", "finance", "registration"] as const) {
      expect(roleOpensAdminRoute(role, "/admin/dealership/fees/notice"), role).toBe(true);
    }
    expect(roleOpensAdminRoute("viewer", "/admin/dealership/fees/notice")).toBe(false);
  });
});
