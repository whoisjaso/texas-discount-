import { beforeEach, describe, expect, it, vi } from "vitest";
import { box11, estimateGate, isCargoVanBody, workVehicleByName } from "@/lib/vehicles/empty-weight/rules";
import { estimateEmptyWeight, specFromRow } from "@/lib/vehicles/empty-weight/estimate";
import { emptyWeightContext, weightPrompt } from "@/lib/vehicles/empty-weight/on-the-sale";
import { makeEstimate, makeSale } from "./helpers/empty-weight";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import type { WeightEstimate } from "@/lib/vehicles/empty-weight/types";

/**
 * A pickup with no body style on the lot row and no decode (vPIC failed,
 * timed out, or the car has no VIN) used to come out as class "unknown", and
 * an unknown class was treated as a passenger car: one-tap Confirm, and the
 * passenger +100 on box 11. Review finding 1, reproduced with the reviewer's
 * own cars (2018 F-150, 2021 Gladiator, 2016 Frontier, 2019 Ranger, 2022
 * Maverick, 2022 Santa Cruz) and fixed: a pickup or a work van is known by
 * name, and a class nobody knows needs a document.
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

/** The lot row as Start A Sale may write it: no body style. */
function bareRow(year: number, make: string, model: string, engine: string | null, drivetrain: string | null = null) {
  return { year, make, model, trim: null, bodyStyle: null, engine, drivetrain, fuelType: "Gasoline" };
}

const PICKUPS = [
  bareRow(2018, "Ford", "F-150 XLT", "2.7L V6", "4WD"),
  bareRow(2021, "Jeep", "Gladiator", "3.6L V6", "4WD"),
  bareRow(2016, "Nissan", "Frontier", "4.0L V6", "4WD"),
  bareRow(2019, "Ford", "Ranger", "2.3L I4", "4WD"),
  bareRow(2022, "Ford", "Maverick", "2.5L I4", "FWD"),
  bareRow(2022, "Hyundai", "Santa Cruz", "2.5L I4", "AWD"),
];

describe("a pickup or a work van is known by its name", () => {
  it.each([
    ["Ford", "F-150"],
    ["Ford", "F150 Lariat"],
    ["Jeep", "Gladiator"],
    ["Nissan", "Frontier"],
    ["Ford", "Ranger"],
    ["Ford", "Maverick"],
    ["Hyundai", "Santa Cruz"],
    ["Chevrolet", "Silverado 1500"],
    ["GMC", "Sierra"],
    ["Toyota", "Tacoma"],
    ["Honda", "Ridgeline"],
    ["Ram", "1500"],
    ["Dodge", "Ram 2500"],
  ])("%s %s is a pickup", (make, model) => {
    expect(workVehicleByName(make, model)).toBe("pickup");
  });

  it.each([
    ["Ram", "ProMaster"],
    ["Ram", "ProMaster City"],
    ["Ford", "Transit 250"],
    ["Ford", "Transit Connect"],
    ["Ford", "E-350"],
    ["Chevrolet", "Express 2500"],
    ["Mercedes-Benz", "Sprinter"],
  ])("%s %s is a work van", (make, model) => {
    expect(workVehicleByName(make, model)).toBe("van");
  });

  it.each([
    ["Toyota", "Camry"],
    ["Mercedes-Benz", "E 350"],
    ["Mercedes-Benz", "B 250"],
    ["Lexus", "RX 350"],
    ["Land Rover", "Range Rover"],
    ["Honda", "Odyssey"],
  ])("%s %s is neither", (make, model) => {
    expect(workVehicleByName(make, model)).toBeNull();
  });

  it("reads a lot body style of Van or Cargo Van as a work van, and Minivan as not", () => {
    expect(isCargoVanBody("Van")).toBe(true);
    expect(isCargoVanBody("Cargo Van")).toBe(true);
    expect(isCargoVanBody("Minivan")).toBe(false);
    expect(isCargoVanBody("Sedan")).toBe(false);
  });
});

describe("the gate never lets an unknown class through", () => {
  it("sends an unknown class to a document", () => {
    expect(estimateGate({ highLbs: 3388, kind: "estimate_epa" }, "unknown", {})).toEqual({ ok: "document", reason: "classUnknown" });
  });

  it("sends a work van to a document", () => {
    expect(estimateGate({ highLbs: 3388, kind: "estimate_epa" }, "passengerTruck", { cargoVan: true })).toEqual({
      ok: "document",
      reason: "cargoVan",
    });
  });

  it.each(PICKUPS)("a bare $year $make $model with no decode is a truck, needs a document, and gets no +100", async (row) => {
    const estimate = await estimateEmptyWeight(specFromRow(row), { network: false });
    expect(estimate).not.toBeNull();
    expect(estimate!.vehicle.cls).toBe("truck");
    const ctx = emptyWeightContext({ ...row, weightLbs: null }, estimate);
    expect(ctx.cls).toBe("truck");
    expect(ctx.gate).toEqual({ ok: "document", reason: "pickup" });
    const prompt = weightPrompt(ctx, {});
    expect(prompt.state).toBe("documentRequired");
    // A truck's figure is rounded up, never +100.
    expect(prompt.estimate!.rule).toBe("roundUp");
    expect(box11(4900, "mco", ctx.cls)).toEqual({ lbs: 4900, rule: "roundUp" });
  });

  it("knows a pickup by name even with no estimate at all, so a typed MCO gets no +100", () => {
    const ctx = emptyWeightContext({ ...bareRow(2018, "Ford", "F-150", null), weightLbs: null }, null);
    expect(ctx.cls).toBe("truck");
  });

  it("sends a bare 2016 Ram ProMaster (body style Van) to a document as a work van", async () => {
    const row = { ...bareRow(2016, "Ram", "ProMaster", null), bodyStyle: "Van" };
    const estimate = await estimateEmptyWeight(specFromRow(row), { network: false });
    expect(estimate).not.toBeNull();
    const ctx = emptyWeightContext({ ...row, weightLbs: null }, estimate);
    expect(ctx.gate).toMatchObject({ ok: "document" });
    expect(weightPrompt(ctx, {}).state).toBe("documentRequired");
  });

  it("sends a car whose class nobody recorded to a document, even a Camry", async () => {
    const row = bareRow(2019, "Toyota", "Camry", "2.5L I4", "FWD");
    const estimate = await estimateEmptyWeight(specFromRow(row), { network: false });
    expect(estimate!.vehicle.cls).toBe("unknown");
    const ctx = emptyWeightContext({ ...row, weightLbs: null }, estimate);
    expect(ctx.gate).toEqual({ ok: "document", reason: "classUnknown" });
  });

  it("still offers one tap on a Camry the lot calls a Sedan", async () => {
    const row = { ...bareRow(2019, "Toyota", "Camry", "2.5L I4", "FWD"), bodyStyle: "Sedan" };
    const estimate = await estimateEmptyWeight(specFromRow(row), { network: false });
    const ctx = emptyWeightContext({ ...row, weightLbs: null }, estimate);
    expect(ctx.gate).toEqual({ ok: "confirm" });
  });
});

describe("the server refuses the same confirm the screen would not offer", () => {
  it("refuses a one-tap confirm on a bare F-150 whose estimate says unknown", async () => {
    // An estimate stored before this fix: class unknown, from the lot row.
    state.estimate = makeEstimate({
      curbLbs: 4950,
      lowLbs: 4825,
      highLbs: 5075,
      vehicle: { make: "Ford", model: "F-150 XLT", year: 2018, cls: "unknown", vehicleType: null, bodyClass: null, from: "row" },
    });
    state.sale = makeSale({}, { year: 2018, make: "Ford", model: "F-150 XLT", bodyStyle: null, vin: null });
    const result = await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 5100 });
    expect(result).toMatchObject({ ok: false, code: "estimateNeedsDocument" });
    expect(state.written).toBeNull();
  });

  it("refuses an unknown class that is not a pickup by name either", async () => {
    state.estimate = makeEstimate({ vehicle: { cls: "unknown", vehicleType: null, from: "row" } });
    state.sale = makeSale({}, { bodyStyle: null });
    const result = await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3500 });
    expect(result).toMatchObject({ ok: false, code: "estimateNeedsDocument" });
  });
});
