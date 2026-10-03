import { describe, expect, it } from "vitest";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { epaEstimate } from "@/lib/vehicles/empty-weight/epa";
import { estimateEmptyWeight, specFromRow } from "@/lib/vehicles/empty-weight/estimate";
import { emptyWeightContext, weightPrompt } from "@/lib/vehicles/empty-weight/on-the-sale";
import { epaModelList, epaModelName, estimateMethod } from "@/lib/vehicles/empty-weight/copy";
import { estimateCorroborated } from "@/lib/vehicles/empty-weight/types";
import { makeEstimate } from "./helpers/empty-weight";

/**
 * An estimate stands on the EPA rows it matched, and says which.
 *
 * Review findings 4 and 5, reproduced and fixed:
 *   4  a short name matched longer, different vehicles (ProMaster took
 *      PROMASTER CITY's weight, Bronco blended in BRONCO SPORT, Range Rover
 *      took EVOQUE and SPORT) at "medium" confidence, one-tap. Now the
 *      query's own model wins when EPA has it, a match on other vehicles
 *      only is marked +partial, and +partial, a range over 600 lb or a lot
 *      row with no engine size is low confidence; low confidence that no
 *      second source supports needs a document.
 *   5  the method sentence said "the 2016 Ram ProMaster tested at ..." when
 *      EPA tested the ProMaster City. It now names the EPA models.
 */

const { en, es } = getFunnelBundles();

describe("the query's own model wins over longer EPA names", () => {
  it("a 2021 Bronco is weighed as a Bronco, never a Bronco Sport", () => {
    const got = epaEstimate({ ModelYear: "2021", Make: "FORD", Model: "Bronco", DisplacementL: "2.3", DriveType: "4WD/4-Wheel Drive/4x4" });
    expect(got).not.toBeNull();
    expect(got!.models.some((m) => m.includes("SPORT"))).toBe(false);
    expect(got!.level).not.toContain("+partial");
  });

  it("a 2015 Cherokee is never weighed as a Grand Cherokee", () => {
    const got = epaEstimate({ ModelYear: "2015", Make: "JEEP", Model: "Cherokee", DisplacementL: "2.4" });
    expect(got).not.toBeNull();
    expect(got!.models.some((m) => m.includes("GRAND"))).toBe(false);
  });

  it("marks a match on other vehicles only as +partial: a 2016 ProMaster has only PROMASTER CITY rows", () => {
    const got = epaEstimate({ ModelYear: "2016", Make: "RAM", Model: "ProMaster" });
    expect(got).not.toBeNull();
    expect(got!.models).toEqual(["PROMASTER CITY"]);
    expect(got!.level).toContain("+partial");
    const rover = epaEstimate({ ModelYear: "2014", Make: "LAND ROVER", Model: "Range Rover" });
    expect(rover!.level).toContain("+partial");
  });

  it("a decode that names the variant keeps only its rows: a 2018 Civic, Series Type R, is weighed as a Type R", () => {
    // The review's probe: Series "Type R" with 2.0 L blended the plain Civic
    // 2.0 L rows in and came out at 2,700 lb, the sedan's figure (a Type R
    // is about 3,100 lb).
    const typeR = epaEstimate({ ModelYear: "2018", Make: "HONDA", Model: "Civic", Series: "Type R", DisplacementL: "2.0", DriveType: "FWD/Front-Wheel Drive" });
    expect(typeR).not.toBeNull();
    expect(typeR!.models).toEqual(["CIVIC 5DR TYPE-R"]);
    expect(typeR!.level).toContain("+variant");
    expect(typeR!.curbLbs).toBe(3075);
    // The plain Civic is untouched: never the Type R's rows.
    const plain = epaEstimate({ ModelYear: "2018", Make: "HONDA", Model: "Civic", DisplacementL: "2.0", DriveType: "FWD/Front-Wheel Drive" });
    expect(plain!.models.some((m) => m.includes("TYPE"))).toBe(false);
    expect(plain!.curbLbs).toBe(2700);
  });

  it("keeps a trim's own rows: a 2019 Camry still stands on CAMRY LE/SE", () => {
    const got = epaEstimate({ ModelYear: "2019", Make: "TOYOTA", Model: "Camry", DisplacementL: "2.5", DriveType: "FWD/Front-Wheel Drive" });
    expect(got!.models).toContain("CAMRY LE/SE");
    expect(got!.curbLbs).toBe(3325);
  });
});

describe("a weak match is low confidence, and low confidence alone needs a document", () => {
  it("is low for a partial match (the ProMaster)", async () => {
    const e = await estimateEmptyWeight(specFromRow({ year: 2016, make: "Ram", model: "ProMaster", bodyStyle: "Van", engine: null }), { network: false });
    expect(e!.confidence).toBe("low");
  });

  it("is low for a range wider than 600 lb (a 2021 Bronco, 4,325 to 5,325 lb)", async () => {
    const e = await estimateEmptyWeight(
      specFromRow({ year: 2021, make: "Ford", model: "Bronco", bodyStyle: "SUV", engine: "2.3L I4", drivetrain: "4WD" }),
      { network: false },
    );
    expect(e!.highLbs - e!.lowLbs).toBeGreaterThan(600);
    expect(e!.confidence).toBe("low");
    const ctx = emptyWeightContext({ year: 2021, make: "Ford", model: "Bronco", bodyStyle: "SUV", weightLbs: null }, e);
    expect(ctx.gate).toMatchObject({ ok: "document" });
  });

  it("is low for a lot row with no engine size: every engine blended (a Civic Type R, a Camry)", async () => {
    for (const row of [
      { year: 2018, make: "Honda", model: "Civic Type R", bodyStyle: "Hatchback", engine: null },
      { year: 2019, make: "Toyota", model: "Camry", bodyStyle: "Sedan", engine: null },
    ]) {
      const e = await estimateEmptyWeight(specFromRow(row), { network: false });
      expect(e!.confidence, row.model).toBe("low");
      const ctx = emptyWeightContext({ ...row, weightLbs: null }, e);
      expect(ctx.gate, row.model).toEqual({ ok: "document", reason: "lowConfidence" });
    }
  });

  it("still offers one tap when a second source stands within 250 lb", () => {
    const e = makeEstimate({ confidence: "low", canada: { curbLbs: 3400, lowLbs: 3300, highLbs: 3500, n: 4, models: [] }, vpic: undefined });
    expect(estimateCorroborated(e)).toBe(true);
    const ctx = emptyWeightContext({ year: 2019, make: "Toyota", model: "Camry", bodyStyle: "Sedan", weightLbs: null }, e);
    expect(ctx.gate).toEqual({ ok: "confirm" });
    const alone = makeEstimate({ confidence: "low", canada: undefined, vpic: { curbLbs: 3990 } });
    expect(estimateCorroborated(alone)).toBe(false);
  });
});

describe("the method sentence names what EPA tested", () => {
  it("names the matched EPA model, not the car being sold", async () => {
    const e = await estimateEmptyWeight(specFromRow({ year: 2016, make: "Ram", model: "ProMaster", bodyStyle: "Van", engine: null }), { network: false });
    const prompt = weightPrompt(emptyWeightContext({ year: 2016, make: "Ram", model: "ProMaster", bodyStyle: "Van", weightLbs: null }, e), {});
    const sentence = estimateMethod(en, prompt.estimate!);
    expect(sentence).toContain("EPA tested the Promaster City (2016)");
    expect(estimateMethod(es, prompt.estimate!)).toContain("la EPA probó el Promaster City (2016)");
  });

  it("reads EPA's names the way a person writes them", () => {
    expect(epaModelName("CAMRY LE/SE")).toBe("Camry LE/SE");
    expect(epaModelName("F-150 4X4 SUPER CREW CAB")).toBe("F-150 4X4 Super Crew Cab");
    expect(epaModelList(en, ["CAMRY", "CAMRY LE/SE", "CAMRY XLE/XSE", "CAMRY XSE"])).toBe("Camry, Camry LE/SE and Camry XLE/XSE");
    expect(epaModelList(es, ["CAMRY", "CAMRY LE/SE"])).toBe("Camry y Camry LE/SE");
  });

  it("is stored with the confirmed estimate: the EPA rows it stood on", () => {
    // _emptyWeightEstimate keeps epa.models (actions/empty-weight.ts).
    const e = makeEstimate();
    expect(e.epa!.models.length).toBeGreaterThan(0);
  });
});
