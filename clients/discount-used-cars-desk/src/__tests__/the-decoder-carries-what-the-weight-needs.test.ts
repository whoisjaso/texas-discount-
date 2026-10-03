import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The VIN decode carries what the weight estimate reads.
 *
 * The estimate matches EPA's test data on vPIC's raw Model, Series, engine
 * displacement, drive and electrification, and decides the registration
 * class and the heavy-duty gate from VehicleType, BodyClass and the GVWR
 * class. The decode used to work out a curb weight and drop it; now the
 * route answers with a sourced estimate beside the decode, and Start A Sale
 * still submits nothing it decoded (the operator types what they see).
 */

const CAMRY_2019 = {
  Make: "TOYOTA",
  Model: "Camry",
  ModelYear: "2019",
  Series: "",
  Trim: "L/LE/SE/XLE",
  BodyClass: "Sedan/Saloon",
  VehicleType: "PASSENGER CAR",
  DriveType: "4x2",
  DisplacementL: "2.5",
  EngineCylinders: "4",
  FuelTypePrimary: "Gasoline",
  ElectrificationLevel: "",
  GVWR: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)",
  CurbWeightLB: "3572",
  ErrorCode: "0",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/lib/nhtsa");
});

describe("nhtsa.ts", () => {
  it("maps every field the estimate reads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Results: [CAMRY_2019] }), { status: 200 })));
    const { decodeVin } = await import("@/lib/nhtsa");
    const decoded = await decodeVin("4T1B11HK5KU812345");
    expect(decoded).toMatchObject({
      make: "Toyota",
      model: "Camry L/LE/SE/XLE",
      modelName: "Camry",
      series: null,
      displacementL: 2.5,
      driveType: "4x2",
      electrificationLevel: null,
      bodyClass: "Sedan/Saloon",
      vehicleType: "PASSENGER CAR",
      gvwr: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)",
      gvwrClass: "1C",
      curbWeightLbs: 3572,
    });
  });

  it("takes a shorter timeout when the caller has a budget, and keeps ten seconds otherwise", () => {
    const source = readFileSync("src/lib/nhtsa.ts", "utf8");
    expect(source).toContain("AbortSignal.timeout(opts.timeoutMs ?? 10000)");
  });

  it("calls vPIC's curb weight a cross-check, never box 11", () => {
    const source = readFileSync("src/lib/nhtsa.ts", "utf8");
    expect(source).toMatch(/A cross-check for the empty-weight estimate only, never\s+\* box 11 on its own/);
  });
});

describe("the decode route", () => {
  it("answers with the estimate and its source beside the decode", async () => {
    vi.doMock("@/lib/nhtsa", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/nhtsa")>();
      return {
        ...real,
        decodeVin: async () => ({
          make: "Toyota",
          model: "Camry L/LE/SE/XLE",
          year: 2019,
          trim: "L/LE/SE/XLE",
          bodyStyle: "Sedan",
          vehicleType: "PASSENGER CAR",
          doors: 4,
          drivetrain: "2WD",
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
          modelName: "Camry",
          series: null,
          displacementL: 2.5,
          driveType: "4x2",
          electrificationLevel: null,
          bodyClass: "Sedan/Saloon",
          errorCode: "0",
        }),
      };
    });
    // Transport Canada unreachable: the route still answers, with EPA's figure.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const { GET } = await import("@/app/api/vin-decode/route");
    const response = await GET(new NextRequest(new URL("http://localhost/api/vin-decode?vin=4T1B11HK5KU812345")));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.make).toBe("Toyota");
    expect(body.emptyWeightEstimate).toMatchObject({
      source: "epa",
      curbLbs: 3325,
      vpic: { curbLbs: 3572 },
      vehicle: { cls: "passenger", from: "decode" },
    });
    expect(body.emptyWeightEstimate.epa.etwMedian).toBe(3625);
  });
});

describe("Start A Sale", () => {
  it("still decodes nothing on the server and submits nothing it decoded", () => {
    const startSale = readFileSync("src/lib/actions/start-sale.ts", "utf8");
    expect(startSale).not.toContain("decodeVin");
    expect(startSale).not.toContain("vin-decode");
    expect(startSale).not.toMatch(/emptyWeight|weight_estimate|weight_lbs/);
  });

  it("shows the estimate read-only, labelled as an estimate", () => {
    const screen = readFileSync("src/components/admin/StartSale.tsx", "utf8");
    expect(screen).toContain("t.weight.start");
    expect(screen).toContain("data.emptyWeightEstimate");
  });
});
