import { describe, expect, it } from "vitest";
import {
  box11,
  minimumCarryingCapacity,
  parseWeightReading,
  roundUp100,
  vehicleWeightClass,
} from "@/lib/vehicles/empty-weight/rules";

/**
 * Box 11 of the 130-U, rounded the way TxDMV rounds it.
 *
 *   VTR-130-UIF box 11: "rounded up to the next 100 pounds".
 *   Vehicle Weight Verification Guidelines (June 2026): an MCO figure is
 *   rounded up, then +100 for a passenger class vehicle, not for a truck; a
 *   Texas or out-of-state title is rounded up and never gets +100.
 *   Title Manual 10-4: the 6,415 lb MCO example registers at 6,600 lb; a
 *   weight certificate is rounded up with nothing added.
 *   Transp. Code 502.055(d)(1), RTB 010-16: +100 for a passenger vehicle's
 *   web (KBB / JD Power) figure.
 *   Registration Manual Table 2-1: a truck's minimum carrying capacity.
 */

describe("rounding", () => {
  it("rounds up to the next 100, and leaves a round figure alone", () => {
    expect(roundUp100(3201)).toBe(3300);
    expect(roundUp100(3200)).toBe(3200);
    expect(roundUp100(3299)).toBe(3300);
  });
});

describe("the vectors TxDMV prints", () => {
  it("MCO 3,589 on a passenger car is 3,700", () => {
    expect(box11(3589, "mco", "passenger")).toEqual({ lbs: 3700, rule: "plus100RoundUp" });
  });

  it("MCO 3,589 on a truck is 3,600", () => {
    expect(box11(3589, "mco", "truck")).toEqual({ lbs: 3600, rule: "roundUp" });
  });

  it("the Title Manual's 6,415 MCO is 6,600", () => {
    expect(box11(6415, "mco", "passenger").lbs).toBe(6600);
  });

  it("a Texas title's 4,200 stays 4,200, and 3,821 becomes 3,900", () => {
    expect(box11(4200, "texas_title", "passenger")).toEqual({ lbs: 4200, rule: "roundUp" });
    expect(box11(3821, "texas_title", "passenger").lbs).toBe(3900);
  });

  it("an out-of-state title's 4,256 becomes 4,300", () => {
    expect(box11(4256, "out_of_state_title", "passengerTruck")).toEqual({ lbs: 4300, rule: "roundUp" });
  });

  it("a weight certificate's 3,765 becomes 3,800", () => {
    expect(box11(3765, "weight_certificate", "passenger")).toEqual({ lbs: 3800, rule: "roundUp" });
  });
});

describe("who gets the 100 lb", () => {
  it("never a title or a weight certificate, on any class", () => {
    for (const kind of ["texas_title", "out_of_state_title", "weight_certificate"] as const) {
      for (const cls of ["passenger", "passengerTruck", "truck", "bus", "unknown"] as const) {
        expect(box11(3550, kind, cls)).toEqual({ lbs: 3600, rule: "roundUp" });
      }
    }
  });

  it("an MCO, KBB/JD Power or estimate figure on a passenger or PASS-TRK vehicle", () => {
    for (const kind of ["mco", "kbb_jdpower", "estimate_epa", "estimate_canada", "estimate_vpic"] as const) {
      for (const cls of ["passenger", "passengerTruck"] as const) {
        expect(box11(3325, kind, cls)).toEqual({ lbs: 3500, rule: "plus100RoundUp" });
      }
    }
  });

  it("not on a truck or a bus", () => {
    for (const kind of ["mco", "kbb_jdpower", "estimate_epa", "estimate_canada", "estimate_vpic"] as const) {
      for (const cls of ["truck", "bus"] as const) {
        expect(box11(3325, kind, cls)).toEqual({ lbs: 3400, rule: "roundUp" });
      }
    }
  });
});

describe("Table 2-1, the minimum carrying capacity", () => {
  it.each([
    [6000, 1000],
    [6001, 1500],
    [7500, 1500],
    [7501, 2000],
    [10000, 2000],
    [10001, 3000],
    [14000, 3000],
    [14001, 4000],
    [16001, 5000],
    [19501, 6000],
    [26001, 7000],
    [33000, 7000],
  ])("an empty weight of %i lb carries at least %i lb", (empty, minimum) => {
    expect(minimumCarryingCapacity(empty)).toBe(minimum);
  });

  it("has no figure past 33,000 lb or for nonsense", () => {
    expect(minimumCarryingCapacity(33001)).toBeNull();
    expect(minimumCarryingCapacity(0)).toBeNull();
    expect(minimumCarryingCapacity(Number.NaN)).toBeNull();
  });
});

describe("the class, from what the decode or the lot says", () => {
  it("reads vPIC's vehicle type first", () => {
    expect(vehicleWeightClass({ vehicleType: "PASSENGER CAR" })).toBe("passenger");
    expect(vehicleWeightClass({ vehicleType: "MULTIPURPOSE PASSENGER VEHICLE (MPV)" })).toBe("passengerTruck");
    expect(vehicleWeightClass({ vehicleType: "TRUCK" })).toBe("truck");
    expect(vehicleWeightClass({ vehicleType: "INCOMPLETE VEHICLE" })).toBe("truck");
    expect(vehicleWeightClass({ vehicleType: "BUS" })).toBe("bus");
  });

  it("falls back to the body style", () => {
    expect(vehicleWeightClass({ bodyStyle: "Sedan" })).toBe("passenger");
    expect(vehicleWeightClass({ bodyStyle: "SUV" })).toBe("passengerTruck");
    expect(vehicleWeightClass({ bodyStyle: "Van" })).toBe("passengerTruck");
    expect(vehicleWeightClass({ bodyStyle: "Truck" })).toBe("truck");
    expect(vehicleWeightClass({ bodyStyle: "" })).toBe("unknown");
  });
});

describe("a typed reading", () => {
  it("takes digits with commas or a unit, within reason", () => {
    expect(parseWeightReading("3,252")).toBe(3252);
    expect(parseWeightReading("3252 lbs")).toBe(3252);
    expect(parseWeightReading(" 4200 ")).toBe(4200);
  });

  it("refuses what is not a weight", () => {
    for (const bad of ["", "abc", "32.5", "-3000", "40", "900000", "3 252"]) {
      expect(parseWeightReading(bad)).toBeNull();
    }
  });
});
