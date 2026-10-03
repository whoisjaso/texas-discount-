import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEstimate, makeSale, TITLE_ON_FILE } from "./helpers/empty-weight";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import type { WeightEstimate } from "@/lib/vehicles/empty-weight/types";

/**
 * Changing a document's figure says why.
 *
 * A title or a scale ticket on file is box 11. Typing a different figure
 * over it is allowed (the title was misread, a new weight certificate came
 * back), but not silently: the reason is required and kept beside the new
 * figure. Replacing an estimate with a document's figure needs no reason;
 * that is the order of sources working. A figure with no document named is
 * never accepted, and an estimate never replaces a document.
 */

const state = vi.hoisted(() => ({
  sale: null as SaleDetail | null,
  estimate: null as WeightEstimate | null,
  written: null as Record<string, unknown> | null,
  vehicleUpdates: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "registration", member: null, user: { id: "u1", email: "reg@example.dev" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: () => ({
        eq: async () => {
          state.vehicleUpdates += 1;
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/admin/sale-desk", () => ({ getSaleDetail: async () => state.sale }));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => ({ signerName: null }) }));
vi.mock("@/lib/vehicles/empty-weight/ensure", () => ({ resolveVehicleWeight: async () => state.estimate }));
vi.mock("@/lib/sales/step-data-write", () => ({
  casMergeStepData: async (_c: unknown, _d: string, build: (current: Record<string, unknown>) => Record<string, unknown>) => {
    state.written = build((state.sale?.stepData as Record<string, unknown>) ?? {});
    return { ok: true, version: 1, stepData: state.written };
  },
}));

import { confirmEmptyWeight } from "@/lib/actions/empty-weight";

function held(): Record<string, string> {
  return ((state.written as { paperwork?: { form130U?: Record<string, string> } })?.paperwork?.form130U ?? {});
}

beforeEach(() => {
  state.sale = null;
  state.estimate = makeEstimate();
  state.written = null;
  state.vehicleUpdates = 0;
});

describe("a figure that differs from a document on the vehicle", () => {
  beforeEach(() => {
    state.sale = makeSale({}, TITLE_ON_FILE);
    state.estimate = null; // a document on file needs no estimate
  });

  it("is refused without a reason", async () => {
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3400", source: "weight_certificate" })).toMatchObject({
      ok: false,
      code: "reasonRequired",
    });
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3400", source: "weight_certificate", reason: "  " })).toMatchObject({
      ok: false,
      code: "reasonRequired",
    });
    expect(state.written).toBeNull();
  });

  it("is accepted with one, and the reason is recorded", async () => {
    expect(
      await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3400", source: "weight_certificate", reason: "New scale ticket" }),
    ).toEqual({ ok: true, box11: 3400 });
    expect(held()).toMatchObject({ emptyWeight: "3400", _emptyWeightSource: "weight_certificate", _emptyWeightReason: "New scale ticket" });
    // The account's own name when the member has none: never invented.
    expect(held()._emptyWeightBy).toBe("reg@example.dev");
    // Registration holds paperwork, not vehicles: the deal keeps the sourced
    // answer and the vehicle row is left to a role that may edit it.
    expect(state.vehicleUpdates).toBe(0);
  });

  it("needs no reason when the new figure gives the same box 11", async () => {
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3290", source: "texas_title" })).toEqual({ ok: true, box11: 3300 });
  });

  it("cannot be replaced by an estimate at all", async () => {
    state.estimate = makeEstimate();
    expect(await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3500 })).toMatchObject({ ok: false, code: "documentOnFile" });
  });
});

describe("a figure that differs from a document already on the deal", () => {
  it("needs a reason too", async () => {
    state.sale = makeSale({ emptyWeight: "3300", _emptyWeightSource: "texas_title", _emptyWeightBy: "Jo Smith" });
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3700", source: "mco" })).toMatchObject({
      ok: false,
      code: "reasonRequired",
    });
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3700", source: "mco", reason: "Title misread" })).toMatchObject({
      ok: true,
    });
    expect(held()._emptyWeightReason).toBe("Title misread");
  });
});

describe("replacing an estimate with a document", () => {
  it("needs no reason", async () => {
    state.sale = makeSale({ emptyWeight: "3500", _emptyWeightSource: "estimate_epa", _emptyWeightBy: "Jo Smith" });
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3150", source: "texas_title" })).toEqual({ ok: true, box11: 3200 });
    expect(held()._emptyWeightSource).toBe("texas_title");
  });
});

describe("a figure with no document named", () => {
  beforeEach(() => {
    state.sale = makeSale();
  });

  it.each(["", "estimate_epa", "door_jamb", "typed_unrecorded"])("is refused with source %j", async (source) => {
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3300", source })).toMatchObject({
      ok: false,
      code: "weightSourceMissing",
    });
  });

  it("is refused when it is not a weight", async () => {
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "about 3k", source: "texas_title" })).toMatchObject({
      ok: false,
      code: "weightInvalid",
    });
  });
});
