import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateGate, isHeavyDuty } from "@/lib/vehicles/empty-weight/rules";
import { emptyWeightContext, weightPrompt } from "@/lib/vehicles/empty-weight/on-the-sale";
import { makeEstimate, makeSale } from "./helpers/empty-weight";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import type { WeightEstimate } from "@/lib/vehicles/empty-weight/types";

/**
 * Some vehicles are never filed on an estimate.
 *
 * Measured on 1,706 crash-test vehicles: an EPA estimate lands on the wrong
 * side of a Texas weight line for about 1 pickup in 10, and EPA has no data
 * at all above 8,500 lb GVWR. So a pickup or work truck, a cab-chassis, a
 * heavy-duty vehicle, a bus, and (a house rule) any estimate whose box 11
 * could reach within 300 lb of the 6,000 lb line needs a title, an MCO or a
 * scale ticket. The estimate is shown as a hint, and the server refuses a
 * one-tap confirm even if a screen offered one.
 */

const state = vi.hoisted(() => ({
  sale: null as SaleDetail | null,
  estimate: null as WeightEstimate | null,
  written: null as Record<string, unknown> | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", member: { id: "m1", full_name: "Jo Smith" }, user: { id: "u1", email: "jo@example.dev" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
}));
vi.mock("@/lib/admin/sale-desk", () => ({ getSaleDetail: async () => state.sale }));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => ({ signerName: "Jo Smith" }) }));
vi.mock("@/lib/vehicles/empty-weight/ensure", () => ({ resolveVehicleWeight: async () => state.estimate }));
vi.mock("@/lib/sales/step-data-write", () => ({
  casMergeStepData: async (_client: unknown, _deal: string, build: (current: Record<string, unknown>) => Record<string, unknown>) => {
    state.written = build((state.sale?.stepData as Record<string, unknown>) ?? {});
    return { ok: true, version: 1, stepData: state.written };
  },
}));

import { confirmEmptyWeight } from "@/lib/actions/empty-weight";

beforeEach(() => {
  state.sale = null;
  state.estimate = null;
  state.written = null;
});

const far = { highLbs: 3388, kind: "estimate_epa" as const };

describe("the gate", () => {
  it("lets a passenger car far from the line be confirmed", () => {
    expect(estimateGate(far, "passenger", {})).toEqual({ ok: "confirm" });
    expect(estimateGate(far, "passengerTruck", {})).toEqual({ ok: "confirm" });
  });

  it("sends a pickup or work truck to a document", () => {
    expect(estimateGate(far, "truck", {})).toEqual({ ok: "document", reason: "pickup" });
  });

  it("sends a cab-chassis (INCOMPLETE VEHICLE) to a document", () => {
    expect(estimateGate(far, "truck", { incomplete: true })).toEqual({ ok: "document", reason: "incomplete" });
  });

  it("sends a heavy-duty vehicle to a document", () => {
    expect(estimateGate(far, "passengerTruck", { heavy: true })).toEqual({ ok: "document", reason: "heavyDuty" });
  });

  it("sends a bus to a document", () => {
    expect(estimateGate(far, "bus", {})).toEqual({ ok: "document", reason: "bus" });
  });

  it("sends an estimate whose box 11 could reach 5,700 lb to a document (house rule)", () => {
    // 5,550 + 100, rounded up: 5,700.
    expect(estimateGate({ highLbs: 5550, kind: "estimate_epa" }, "passengerTruck", {})).toEqual({
      ok: "document",
      reason: "nearSixThousand",
    });
    expect(estimateGate({ highLbs: 5499, kind: "estimate_epa" }, "passengerTruck", {})).toEqual({ ok: "confirm" });
  });
});

describe("what counts as heavy duty", () => {
  it("a GVWR class of 2G (8,001 lb) or more", () => {
    expect(isHeavyDuty({ gvwrClass: "2G", cls: "truck" })).toBe(true);
    expect(isHeavyDuty({ gvwrClass: "3", cls: "truck" })).toBe(true);
    expect(isHeavyDuty({ gvwrClass: "2F", cls: "truck" })).toBe(false);
  });

  it("2500, 3500, HD or Super Duty in the name", () => {
    for (const text of ["Silverado 2500", "Ram 3500", "Sierra 2500 HD", "F-250 Super Duty"]) {
      expect(isHeavyDuty({ text, cls: "truck" })).toBe(true);
    }
  });

  it("250 or 350 only on a truck: an RX 350 is a passenger vehicle", () => {
    expect(isHeavyDuty({ text: "F-350", cls: "truck" })).toBe(true);
    expect(isHeavyDuty({ text: "RX 350", cls: "passengerTruck" })).toBe(false);
    expect(isHeavyDuty({ text: "E 350", cls: "passenger" })).toBe(false);
  });
});

describe("the screen and the server agree", () => {
  it("shows a pickup's estimate as a hint and offers no confirm", () => {
    const estimate = makeEstimate({ curbLbs: 4950, lowLbs: 4825, highLbs: 5075, vehicle: { cls: "truck", vehicleType: "TRUCK", bodyClass: "Pickup" } });
    const ctx = emptyWeightContext(makeSale({}, { bodyStyle: "Truck" }).vehicle, estimate);
    const prompt = weightPrompt(ctx, {});
    expect(prompt.state).toBe("documentRequired");
    expect(prompt.gateReason).toBe("pickup");
    expect(prompt.estimate?.curbLbs).toBe(4950);
  });

  it("treats the lot's Truck body style as a truck even when the decode could not tell", () => {
    const estimate = makeEstimate({ vehicle: { cls: "unknown", vehicleType: null } });
    const ctx = emptyWeightContext(makeSale({}, { bodyStyle: "Truck" }).vehicle, estimate);
    expect(ctx.cls).toBe("truck");
    expect(ctx.gate).toEqual({ ok: "document", reason: "pickup" });
  });

  it.each([
    ["pickup", { cls: "truck" as const }, "Truck"],
    ["cab-chassis", { cls: "truck" as const, incomplete: true }, "Truck"],
    ["heavy duty", { cls: "passengerTruck" as const, heavy: true }, "SUV"],
    ["bus", { cls: "bus" as const }, "Bus"],
  ])("refuses a one-tap confirm on a %s", async (_name, vehicle, bodyStyle) => {
    state.estimate = makeEstimate({ vehicle });
    state.sale = makeSale({}, { bodyStyle });
    const result = await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3500 });
    expect(result).toMatchObject({ ok: false, code: "estimateNeedsDocument" });
    expect(state.written).toBeNull();
  });

  it("refuses near 6,000 lb, and confirms a car far from it", async () => {
    state.sale = makeSale();
    state.estimate = makeEstimate({ curbLbs: 5450, lowLbs: 5325, highLbs: 5575, vehicle: { cls: "passengerTruck" } });
    expect(await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 5600 })).toMatchObject({
      ok: false,
      code: "estimateNeedsDocument",
    });
    state.estimate = makeEstimate();
    expect(await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3500 })).toEqual({ ok: true, box11: 3500 });
  });

  it("still takes a pickup's weight typed from its title", async () => {
    state.estimate = makeEstimate({ vehicle: { cls: "truck" } });
    state.sale = makeSale({}, { bodyStyle: "Truck" });
    const result = await confirmEmptyWeight("deal-1", { mode: "typed", reading: "5,012", source: "texas_title" });
    expect(result).toEqual({ ok: true, box11: 5100 });
  });
});
