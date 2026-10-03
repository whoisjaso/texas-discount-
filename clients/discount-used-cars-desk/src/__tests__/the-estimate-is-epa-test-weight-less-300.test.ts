import { describe, expect, it } from "vitest";
import fixture from "./helpers/empty-weight-crash-tests.json";
import { epaEstimate, pyRound1, type EpaSpec } from "@/lib/vehicles/empty-weight/epa";

/**
 * The bundled EPA estimate: Equivalent Test Weight less 300 lb.
 *
 * EPA's ETW is the inertia class of the loaded vehicle weight, and loaded
 * vehicle weight is curb weight plus 300 lb (40 CFR 86.1803-01; 40 CFR
 * 1066.805). The TypeScript port must give exactly what the Python reference
 * (scripts/empty-weight/reference_estimate.py) gives, on every row of a
 * crash-test sample whose curb weights were measured in a lab, and it must be
 * as accurate as the research measured it.
 */

type FixtureRow = {
  vin: string;
  decode: Record<string, string>;
  measuredCurbLbs: number;
  reference: { curbLbs: number; lowLbs: number; highLbs: number; yearUsed: number; level: string } | null;
  canadaMedianLbs: number | null;
};
const rows = (fixture as { rows: FixtureRow[] }).rows;

const CAMRY_2019: EpaSpec = {
  ModelYear: "2019",
  Make: "TOYOTA",
  Model: "Camry",
  Trim: "SE",
  DisplacementL: "2.5",
  DriveType: "FWD/Front-Wheel Drive",
  FuelTypePrimary: "Gasoline",
  GVWR: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)",
};

describe("the TypeScript estimate is the reference estimate", () => {
  it("has a fixture worth testing against", () => {
    expect(rows.length).toBeGreaterThanOrEqual(380);
    const years = new Set(rows.map((r) => Number(r.decode.ModelYear)));
    expect(Math.min(...years)).toBeLessThan(2000);
    expect(Math.max(...years)).toBeGreaterThan(2022);
    expect(new Set(rows.map((r) => r.decode.VehicleType)).size).toBeGreaterThanOrEqual(3);
  });

  it("matches reference_estimate.py exactly on every crash-test row", () => {
    const mismatches: string[] = [];
    for (const row of rows) {
      const got = epaEstimate(row.decode as EpaSpec);
      const want = row.reference;
      const same =
        want === null
          ? got === null
          : got !== null &&
            got.curbLbs === want.curbLbs &&
            got.lowLbs === want.lowLbs &&
            got.highLbs === want.highLbs &&
            got.yearUsed === want.yearUsed &&
            got.level === want.level;
      if (!same) mismatches.push(`${row.vin}: want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("is as accurate as the research measured: coverage, median and p95 error", () => {
    const errors: number[] = [];
    for (const row of rows) {
      const got = epaEstimate(row.decode as EpaSpec);
      if (got) errors.push(Math.abs(got.curbLbs - row.measuredCurbLbs));
    }
    errors.sort((a, b) => a - b);
    const coverage = errors.length / rows.length;
    const median = errors[Math.floor(errors.length / 2)];
    const p95 = errors[Math.floor(errors.length * 0.95)];
    expect(coverage).toBeGreaterThanOrEqual(0.85);
    expect(median).toBeLessThanOrEqual(75);
    expect(p95).toBeLessThanOrEqual(400);
  });

  it("rounds a displacement the way Python does, half to even on an exact tie", () => {
    expect(pyRound1(1.25)).toBe(1.2);
    expect(pyRound1(0.75)).toBe(0.8);
    expect(pyRound1(2.45)).toBe(2.5);
    expect(pyRound1(3.564)).toBe(3.6);
    expect(pyRound1(2.0)).toBe(2);
  });
});

describe("the rules the estimate follows", () => {
  it("gives a 2019 Camry 2.5 FWD its ETW less 300, with the class bounds as the range", () => {
    const got = epaEstimate(CAMRY_2019);
    expect(got).not.toBeNull();
    expect(got!.curbLbs).toBe(got!.etwMedian - 300);
    expect(got!.etwMedian).toBe(3625);
    expect(got!.curbLbs).toBe(3325);
    // Up to ETW 4,000 the classes are 125 lb wide: half a class either side.
    expect(got!.lowLbs).toBe(Math.floor(got!.etwMin - 62.5 - 300));
    expect(got!.highLbs).toBe(Math.ceil(got!.etwMax + 62.5 - 300));
    expect(got!.yearUsed).toBe(2019);
    expect(got!.models.every((m) => m.includes("CAMRY"))).toBe(true);
    expect(got!.sourceUrls.some((u) => /epa\.gov/.test(u))).toBe(true);
  });

  it("never lets a Silverado 2500 borrow a light-duty or Suburban weight", () => {
    // EPA lists light duty only. A 2011 2500 HD has no Silverado 2500 row.
    const hd2011 = epaEstimate({
      ModelYear: "2011", Make: "CHEVROLET", Model: "Silverado", Series: "2500 HD",
      DisplacementL: "6.0", DriveType: "4WD/4-Wheel Drive/4x4", FuelTypePrimary: "Gasoline",
      GVWR: "Class 2H: 9,001 - 10,000 lb (4,082 - 4,536 kg)",
    });
    expect(hd2011).toBeNull();
    // The 1500 of the same year does have one.
    expect(
      epaEstimate({ ModelYear: "2011", Make: "CHEVROLET", Model: "Silverado", Series: "1500", DisplacementL: "5.3", DriveType: "4WD/4-Wheel Drive/4x4", FuelTypePrimary: "Gasoline" }),
    ).not.toBeNull();
    // When EPA does list a 2500 Silverado, only that series matches.
    const hd2000 = epaEstimate({
      ModelYear: "2000", Make: "CHEVROLET", Model: "Silverado", Series: "2500",
      DisplacementL: "6.0", DriveType: "RWD/Rear-Wheel Drive", FuelTypePrimary: "Gasoline",
      GVWR: "Class 2G: 8,001 - 9,000 lb (3,629 - 4,082 kg)",
    });
    expect(hd2000).not.toBeNull();
    expect(hd2000!.models.every((m) => m.includes("2500") && m.includes("SILVERADO"))).toBe(true);
    expect(hd2000!.models.some((m) => m.includes("SUBURBAN"))).toBe(false);
  });

  it("never takes a weight from a different engine: a 3.6 V6 Challenger or Durango gets none", () => {
    for (const model of ["Challenger", "Durango"]) {
      expect(
        epaEstimate({ ModelYear: "2019", Make: "DODGE", Model: model, DisplacementL: "3.6", DriveType: "RWD/Rear-Wheel Drive", FuelTypePrimary: "Gasoline" }),
      ).toBeNull();
    }
  });

  it("matches an EV only to EVs", () => {
    const leaf = epaEstimate({ ModelYear: "2019", Make: "NISSAN", Model: "Leaf", FuelTypePrimary: "Electric", ElectrificationLevel: "BEV (Battery Electric Vehicle)" });
    expect(leaf).not.toBeNull();
    expect(leaf!.models.every((m) => m.includes("LEAF"))).toBe(true);
    // The same name as a petrol car finds nothing: there is no petrol Leaf.
    expect(
      epaEstimate({ ModelYear: "2019", Make: "NISSAN", Model: "Leaf", FuelTypePrimary: "Gasoline", DisplacementL: "1.6" }),
    ).toBeNull();
  });

  it("fills a year EPA skipped from the neighbouring year", () => {
    const rlx = rows.find((r) => r.decode.Make === "ACURA" && r.decode.Model === "RLX" && r.decode.ModelYear === "2015");
    expect(rlx).toBeDefined();
    const got = epaEstimate(rlx!.decode as EpaSpec);
    expect(got).not.toBeNull();
    expect(got!.yearUsed).toBe(2014);
  });
});
