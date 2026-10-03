import { describe, expect, it } from "vitest";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { makeEstimate } from "./helpers/empty-weight";

/**
 * The state form prints box 11 from what was filed, or from a document.
 *
 * A filed 130-U carries its own `emptyWeight` (the figure a person settled,
 * with its source in form_data). When an older record filed without one, the
 * printer falls back to the vehicle row, but only to a figure the row says
 * came from a document. An estimate on the row, or a weight nobody recorded
 * the source of, is never printed on a state form.
 */

const decoded = (dd: Record<string, unknown> = {}) =>
  ({ s: "form130U", dd: { vehicleVin: "4T1B11HK5KU812345", ...dd }, cd: { buyerName: "Maria Delgado" } }) as never;

describe("box 11 on the printed 130-U", () => {
  it("prints the filed figure", () => {
    expect(buildAgreementData(decoded({ emptyWeight: "3500" }), {}, { weight_lbs: 3765 }).empty_weight).toBe("3500");
  });

  it("falls back to the vehicle row only when the row names a document", () => {
    const row = { weight_lbs: 3300, weight_source: "texas_title", weight_reading_lbs: 3252 };
    expect(buildAgreementData(decoded(), {}, row).empty_weight).toBe("3300");
    expect(buildAgreementData(decoded(), {}, { ...row, weight_source: "weight_certificate" }).empty_weight).toBe("3300");
  });

  it("never prints a weight nobody recorded the source of", () => {
    expect(buildAgreementData(decoded(), {}, { weight_lbs: 3765 }).empty_weight).toBeUndefined();
    expect(buildAgreementData(decoded(), {}, { weight_lbs: 3765, weight_source: null }).empty_weight).toBeUndefined();
  });

  it("never prints an estimate", () => {
    const row = { weight_lbs: null, weight_estimate: makeEstimate(), weight_estimated_at: "2026-10-02T15:00:00.000Z" };
    expect(buildAgreementData(decoded(), {}, row).empty_weight).toBeUndefined();
    expect(buildAgreementData(decoded(), {}, { ...row, weight_source: "estimate_epa", weight_lbs: 3500 }).empty_weight).toBeUndefined();
  });
});
