import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVehicleWeight, resetWeightCache } from "@/lib/vehicles/empty-weight/ensure";
import { epaTableInfo } from "@/lib/vehicles/empty-weight/epa";
import { makeEstimate } from "./helpers/empty-weight";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The lookup never stands between a person and a sale.
 *
 * Like the county lookup (documents/resolve.ts): a timeout, an outage, a
 * refused write or an odd answer is "nothing learned". What is left is the
 * bundled EPA figure for the car on the lot row, or nothing, and the 130-U
 * asks its question as it always has. It keeps what it learns only where
 * nobody wrote first, and never touches `weight_lbs`.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

/** The 2019 Camry SE the preview lot carries. */
const CAMRY = {
  id: "mock-1",
  vin: "4T1B11HK5KU812345",
  year: 2019,
  make: "Toyota",
  model: "Camry SE",
  bodyStyle: "Sedan",
  engine: "2.5L 4-Cylinder",
  drivetrain: "FWD",
  fuelType: "Gasoline",
  weightLbs: null,
  weightSource: null,
  weightEstimate: null,
};

type Call = { patch: Record<string, unknown>; filters: Array<[string, string, unknown]> };

function recordingClient(result: { error: unknown } | "throw" = { error: null }) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("vehicles");
      return {
        update: (patch: Record<string, unknown>) => {
          const call: Call = { patch, filters: [] };
          calls.push(call);
          const chain = {
            eq: (column: string, value: unknown) => {
              call.filters.push(["eq", column, value]);
              return chain;
            },
            is: (column: string, value: unknown) => {
              call.filters.push(["is", column, value]);
              return chain;
            },
            then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
              result === "throw" ? reject(new Error("offline")) : resolve(result),
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

/** vPIC's answer for that Camry, so an estimate worth keeping is made from a decode. */
const camryDecode = vi.fn(async () => ({
  make: "TOYOTA",
  model: "Camry SE",
  modelName: "Camry",
  year: 2019,
  trim: "SE",
  series: null,
  bodyStyle: "Sedan",
  bodyClass: "Sedan/Saloon",
  vehicleType: "PASSENGER CAR",
  doors: 4,
  drivetrain: "FWD",
  driveType: "FWD/Front-Wheel Drive",
  transmission: null,
  fuelType: "Gasoline",
  engine: "2.5L 4-Cylinder",
  engineHP: null,
  turbo: false,
  manufacturer: null,
  plantCountry: null,
  curbWeightLbs: 3572,
  gvwr: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)",
  gvwrClass: "1C",
  displacementL: 2.5,
  electrificationLevel: null,
  errorCode: "0",
}));

const failingDecode = vi.fn(async () => {
  throw new Error("vPIC is down");
});
const throwingFetch = vi.fn(async () => {
  throw new Error("network");
}) as unknown as typeof fetch;

beforeEach(() => {
  resetWeightCache();
  vi.clearAllMocks();
});

describe("when the network fails", () => {
  it("falls back to the bundled EPA figure for the lot row when vPIC and Canada both throw", async () => {
    const { client } = recordingClient();
    const got = await resolveVehicleWeight(CAMRY, { network: true, client, decode: failingDecode, fetcher: throwingFetch });
    expect(got).not.toBeNull();
    expect(got!.source).toBe("epa");
    expect(got!.curbLbs).toBe(3325);
    expect(got!.canada).toBeUndefined();
    expect(got!.vehicle.from).toBe("row");
  });

  it("treats a timeout the same way", async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as unknown as typeof fetch;
    const { client } = recordingClient();
    const got = await resolveVehicleWeight(CAMRY, { network: true, client, decode: failingDecode, fetcher: timeout });
    expect(got?.source).toBe("epa");
  });

  it("ignores an answer of the wrong shape", async () => {
    const odd = vi.fn(async () => new Response(JSON.stringify({ Results: "not a list" }), { status: 200 })) as unknown as typeof fetch;
    const notOk = vi.fn(async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
    for (const fetcher of [odd, notOk]) {
      resetWeightCache();
      const { client } = recordingClient();
      const got = await resolveVehicleWeight(CAMRY, { network: true, client, decode: failingDecode, fetcher });
      expect(got?.source).toBe("epa");
      expect(got?.canada).toBeUndefined();
    }
  });

  it("returns nothing, and does not throw, for a car no source knows", async () => {
    const { client, calls } = recordingClient();
    const got = await resolveVehicleWeight(
      { ...CAMRY, vin: "", make: "Zastava", model: "Yugo GV", engine: "1.1L" },
      { network: true, client, decode: failingDecode, fetcher: throwingFetch },
    );
    expect(got).toBeNull();
    expect(calls).toEqual([]);
  });

  it("does not throw on a vehicle with nothing on it", async () => {
    await expect(resolveVehicleWeight(null, { network: true })).resolves.toBeNull();
    await expect(
      resolveVehicleWeight({ id: "x", year: null, make: null, model: null }, { network: true, decode: failingDecode, fetcher: throwingFetch }),
    ).resolves.toBeNull();
  });
});

describe("what it keeps", () => {
  it("writes only the estimate, only over nothing, and never weight_lbs", async () => {
    const { client, calls } = recordingClient();
    // A decoded estimate: the kind that is kept (a lot-row stand-in for a
    // failed decode is not; a-weight-estimate-follows-the-car.test.ts).
    await resolveVehicleWeight(CAMRY, { network: true, client, decode: camryDecode, fetcher: throwingFetch });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].patch).sort()).toEqual(["weight_estimate", "weight_estimated_at"]);
    expect(calls[0].filters).toEqual([
      ["eq", "id", "mock-1"],
      ["is", "weight_estimate", null],
    ]);
  });

  it("replaces an estimate from an older table only where it still stands", async () => {
    const old = makeEstimate({ table: { built: "2025-01-01", v: 1 }, at: "2025-01-02T00:00:00.000Z" });
    const { client, calls } = recordingClient();
    await resolveVehicleWeight({ ...CAMRY, weightEstimate: old }, { network: true, client, decode: camryDecode, fetcher: throwingFetch });
    expect(calls[0].filters).toEqual([
      ["eq", "id", "mock-1"],
      ["eq", "weight_estimated_at", "2025-01-02T00:00:00.000Z"],
    ]);
  });

  it("swallows a refused or failed write and still answers", async () => {
    for (const result of [{ error: { code: "42501", message: "permission denied" } }, "throw" as const]) {
      resetWeightCache();
      const { client } = recordingClient(result);
      const got = await resolveVehicleWeight(CAMRY, { network: true, client, decode: failingDecode, fetcher: throwingFetch });
      expect(got?.source).toBe("epa");
    }
  });

  it("uses an estimate already stored against the current table, with no network at all", async () => {
    const stored = makeEstimate({ table: { built: epaTableInfo().built, v: epaTableInfo().v } });
    const { client, calls } = recordingClient();
    const got = await resolveVehicleWeight({ ...CAMRY, weightEstimate: stored }, { network: true, client, decode: failingDecode, fetcher: throwingFetch });
    expect(got).toEqual(stored);
    expect(failingDecode).not.toHaveBeenCalled();
    expect(throwingFetch).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("asks nothing for a car whose weight is on file from a document", async () => {
    const { client, calls } = recordingClient();
    const got = await resolveVehicleWeight(
      { ...CAMRY, weightLbs: 3300, weightSource: "texas_title" },
      { network: true, client, decode: failingDecode, fetcher: throwingFetch },
    );
    expect(got).toBeNull();
    expect(failingDecode).not.toHaveBeenCalled();
    expect(throwingFetch).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
