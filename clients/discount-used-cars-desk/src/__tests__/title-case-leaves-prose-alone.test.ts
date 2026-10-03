import { describe, expect, it } from "vitest";
import { toTitleCaseDisplay } from "@/lib/display/title-case";

/**
 * The owner's rule: titles and headings capitalise every word, body copy stays
 * sentence case. Call sites across the admin wrapped everything in this helper,
 * sentences included, so the audit found 42 distinct sentences being read back
 * at a person in title case.
 */
describe("title case", () => {
  it("still capitalises every word of a title", () => {
    expect(toTitleCaseDisplay("bill of sale")).toBe("Bill Of Sale");
    expect(toTitleCaseDisplay("start here")).toBe("Start Here");
    expect(toTitleCaseDisplay("power of attorney")).toBe("Power Of Attorney");
    // Including the small words, which is the part that overrides house style.
    expect(toTitleCaseDisplay("what is owed and when")).toBe("What Is Owed And When");
  });

  it("leaves a sentence as it was written", () => {
    for (const sentence of [
      "Check bought price, problems, and next step.",
      "Human approves before it goes public.",
      "Name, username, and bio for the team dashboard.",
      "Leave blank unless changing it now.",
      "No sold vehicles with cost data yet.",
    ]) {
      expect(toTitleCaseDisplay(sentence)).toBe(sentence);
    }
  });

  it("does not mistake a short label with a period for prose", () => {
    // "Est. Potential" and "No. 3" are titles that happen to carry a full stop.
    expect(toTitleCaseDisplay("est. potential")).toBe("Est. Potential");
    expect(toTitleCaseDisplay("no. of payments")).toBe("No. Of Payments");
  });

  it("keeps preserving acronyms in titles", () => {
    expect(toTitleCaseDisplay("vin decoder")).toBe("VIN Decoder");
  });
});
