import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVehicleWeight, resetWeightCache } from "@/lib/vehicles/empty-weight/ensure";
import { epaTableInfo } from "@/lib/vehicles/empty-weight/epa";
import { emptyWeightContext } from "@/lib/vehicles/empty-weight/on-the-sale";
import { estimateFitsVehicle, weightFingerprint } from "@/lib/vehicles/empty-weight/types";
import { makeEstimate } from "./helpers/empty-weight";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { decodeVin } from "@/lib/nhtsa";

/**
 * A stored estimate is about one car, worked out one way.
 *
 * Review findings 2, 3 and 9, reproduced and fixed:
 *   2  a single vPIC outage was kept for good: the lot-row stand-in was
 *      written to weight_estimate and reused forever, so the VIN was never
 *      decoded again. Now only a decoded estimate (or one for a car with no
 *      VIN) is kept; a lot-row one is held for minutes and retried.
 *   3  a corrected VIN, year, make or model kept the old car's estimate (and
 *      its one-tap Confirm). Now a stored estimate carries the row it was
 *      made for, and anything else is stale.
 *   9  a mistyped VIN that decodes to another make of the same year drove
 *      the estimate. Now the decode must agree on the make too.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

type Call = { patch: Record<string, unknown>; filters: Array<[string, string, unknown]> };
function recordingClient() {
  const calls: Call[] = [];
  const client = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const call: Call = { patch, filters: [] };
        calls.push(call);
        const chain = {
          eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), chain),
          is: (column: string, value: unknown) => (call.filters.push(["is", column, value]), chain),
          then: (resolve: (value: unknown) => void) => resolve({ error: null }),
        };
        return chain;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

type Decoded = Awaited<ReturnType<typeof decodeVin>>;
function decoded(over: Partial<NonNullable<Decoded>>): NonNullable<Decoded> {
  return {
    make: "FORD",
    model: "F-150 XLT",
    modelName: "F-150",
    year: 2018,
    trim: "XLT",
    series: "XLT",
    bodyStyle: "Truck",
    bodyClass: "Pickup",
    vehicleType: "TRUCK",
    doors: 4,
    drivetrain: "4WD",
    driveType: "4WD/4-Wheel Drive/4x4",
    transmission: null,
    fuelType: "Gasoline",
    engine: "2.7L V6",
    engineHP: null,
    turbo: true,
    manufacturer: null,
    plantCountry: null,
    curbWeightLbs: null,
    gvwr: "Class 2E: 6,001 - 7,000 lb (2,722 - 3,175 kg)",
    gvwrClass: "2E",
    displacementL: 2.7,
    electrificationLevel: null,
    errorCode: "0",
    ...over,
  } as NonNullable<Decoded>;
}

const F150 = {
  id: "veh-f150",
  vin: "1FTEW1EP5JFA00001",
  year: 2018,
  make: "Ford",
  model: "F-150 XLT",
  trim: null,
  bodyStyle: null,
  engine: "2.7L V6",
  drivetrain: "4WD",
  fuelType: "Gasoline",
  weightLbs: null,
  weightSource: null,
  weightEstimate: null as unknown,
};

const throwingFetch = vi.fn(async () => {
  throw new Error("network");
}) as unknown as typeof fetch;
const failingDecode = vi.fn(async () => {
  throw new Error("vPIC is down");
}) as unknown as typeof decodeVin;

beforeEach(() => {
  resetWeightCache();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a lot-row stand-in for a failed decode is never kept", () => {
  it("shows the row estimate but does not write it to the vehicle", async () => {
    const { client, calls } = recordingClient();
    const got = await resolveVehicleWeight(F150, { network: true, client, decode: failingDecode, fetcher: throwingFetch });
    expect(got).not.toBeNull();
    expect(got!.vehicle.from).toBe("row");
    expect(calls).toEqual([]);
  });

  it("tries the decode again a few minutes later, and keeps the decoded one", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T15:00:00Z"), toFake: ["Date"] });
    const { client, calls } = recordingClient();
    await resolveVehicleWeight(F150, { network: true, client, decode: failingDecode, fetcher: throwingFetch });
    const healthy = vi.fn(async () => decoded({})) as unknown as typeof decodeVin;
    // Within the retry window: the held answer, no new request.
    await resolveVehicleWeight(F150, { network: true, client, decode: healthy, fetcher: throwingFetch });
    expect(healthy).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-10-02T15:06:00Z"));
    const got = await resolveVehicleWeight(F150, { network: true, client, decode: healthy, fetcher: throwingFetch });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(got!.vehicle.from).toBe("decode");
    expect(got!.vehicle.cls).toBe("truck");
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].patch).sort()).toEqual(["weight_estimate", "weight_estimated_at"]);
  });

  it("decodes again over a stored lot-row estimate instead of reusing it", async () => {
    const current = epaTableInfo();
    const stored = makeEstimate({
      curbLbs: 4950,
      vehicle: { year: 2018, make: "Ford", model: "F-150 XLT", cls: "unknown", vehicleType: null, from: "row" },
      table: { built: current.built, v: current.v },
      fingerprint: weightFingerprint(F150),
      at: "2026-10-01T00:00:00.000Z",
    });
    const healthy = vi.fn(async () => decoded({})) as unknown as typeof decodeVin;
    const { client, calls } = recordingClient();
    const got = await resolveVehicleWeight({ ...F150, weightEstimate: stored }, { network: true, client, decode: healthy, fetcher: throwingFetch });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(got!.vehicle.cls).toBe("truck");
    expect(calls[0].filters).toContainEqual(["eq", "weight_estimated_at", "2026-10-01T00:00:00.000Z"]);
  });

  it("keeps a row estimate for a car with no VIN, since no decode could ever add to it", async () => {
    const { client, calls } = recordingClient();
    await resolveVehicleWeight({ ...F150, vin: "" }, { network: true, client, decode: failingDecode, fetcher: throwingFetch });
    expect(calls).toHaveLength(1);
  });
});

describe("a stored estimate follows the car it was made for", () => {
  it("is stale once the lot row names another car, and is worked out again", async () => {
    const current = epaTableInfo();
    const stored = makeEstimate({
      curbLbs: 4950,
      vehicle: { year: 2018, make: "Ford", model: "F-150", cls: "truck", from: "decode" },
      table: { built: current.built, v: current.v },
      fingerprint: weightFingerprint(F150),
      at: "2026-10-01T00:00:00.000Z",
    });
    const corrected = {
      ...F150,
      vin: "4T1B11HK5KU812345",
      year: 2019,
      make: "Toyota",
      model: "Camry SE",
      bodyStyle: "Sedan",
      engine: "2.5L 4-Cylinder",
      drivetrain: "FWD",
      weightEstimate: stored,
    };
    expect(estimateFitsVehicle(stored, corrected)).toBe(false);
    const { client, calls } = recordingClient();
    const got = await resolveVehicleWeight(corrected, { network: false, client });
    expect(got!.vehicle.make).toBe("Toyota");
    expect(got!.curbLbs).toBe(3325);
    // Offline, with a VIN a decode could still read: shown, not kept.
    expect(calls).toEqual([]);
    // And the screen never offers the old car's estimate from the row either.
    expect(emptyWeightContext(corrected, null).estimate).toBeNull();

    // With no VIN to decode the new estimate is kept, written over the old
    // one only where it still stands.
    resetWeightCache();
    const noVin = { ...corrected, vin: "" };
    const second = recordingClient();
    await resolveVehicleWeight(noVin, { network: false, client: second.client });
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0].filters).toEqual([
      ["eq", "id", "veh-f150"],
      ["eq", "weight_estimated_at", "2026-10-01T00:00:00.000Z"],
    ]);
    expect((second.calls[0].patch.weight_estimate as { fingerprint: string }).fingerprint).toBe(weightFingerprint(noVin));
  });

  it("is reused while the row is unchanged", () => {
    const stored = makeEstimate({ fingerprint: weightFingerprint(F150) });
    expect(estimateFitsVehicle(stored, F150)).toBe(true);
    expect(estimateFitsVehicle(stored, { ...F150, engine: "5.0L V8" })).toBe(false);
    expect(estimateFitsVehicle(stored, { ...F150, vin: "1FTEW1EP5JFA00002" })).toBe(false);
  });

  it("checks an estimate stored before fingerprints by year, make and model", () => {
    const old = makeEstimate(); // a 2019 Toyota Camry, no fingerprint
    expect(estimateFitsVehicle(old, { year: 2019, make: "Toyota", model: "Camry SE" })).toBe(true);
    expect(estimateFitsVehicle(old, { year: 2018, make: "Ford", model: "F-150" })).toBe(false);
  });
});

describe("a decode for another car is not this car's decode", () => {
  it("ignores a VIN that decodes to another make of the same year", async () => {
    const wrong = vi.fn(async () =>
      decoded({ make: "HONDA", model: "Civic", modelName: "Civic", vehicleType: "PASSENGER CAR", bodyClass: "Sedan/Saloon", displacementL: 2.0 }),
    ) as unknown as typeof decodeVin;
    const { client } = recordingClient();
    const got = await resolveVehicleWeight(F150, { network: true, client, decode: wrong, fetcher: throwingFetch });
    expect(wrong).toHaveBeenCalledTimes(1);
    expect(got!.vehicle.from).toBe("row");
    expect(got!.vehicle.make).toBe("Ford");
    expect(got!.vehicle.cls).toBe("truck");
  });

  it("accepts the same make written differently (FORD and Ford, RAM and Dodge)", async () => {
    const ok = vi.fn(async () => decoded({})) as unknown as typeof decodeVin;
    const { client } = recordingClient();
    const got = await resolveVehicleWeight(F150, { network: true, client, decode: ok, fetcher: throwingFetch });
    expect(got!.vehicle.from).toBe("decode");
  });
});
