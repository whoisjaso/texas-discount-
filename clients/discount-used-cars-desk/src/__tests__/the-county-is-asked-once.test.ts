import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paperworkAnswers, paperworkQuestions } from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { poaFieldsFromSale } from "@/lib/documents/poa-fields";
import { routeSale } from "./fixtures/sales";

/**
 * The county is asked once, at intake. The 130-U reads it back with Change
 * rather than asking again, and the power of attorney prints the same one.
 */
describe("the county is asked once", () => {
  const sale = routeSale("county", {
    stepData: { buyerId: { mailing: { street: "1 Main St", city: "Houston", state: "TX", postal: "77001", county: "Fort Bend" }, mailingConfirmed: true } },
  });

  it("skips the 130-U question when the intake has the county, and files it", () => {
    const { context } = paperworkFilingContext(sale, "form130U", "Harris");
    expect(paperworkQuestions("form130U", context).map((q) => q.key)).not.toContain("countyOfResidence");
    expect(paperworkAnswers("form130U", context).countyOfResidence).toBe("Fort Bend");
  });

  it("prints that same county on the power of attorney", () => {
    expect(poaFieldsFromSale(sale).grantorCounty).toBe("Fort Bend");
  });

  it("prints the 130-U's corrected county on the power of attorney once it is changed there", () => {
    const corrected = routeSale("county-2", {
      stepData: {
        buyerId: { mailing: { street: "1 Main St", city: "Houston", state: "TX", postal: "77001", county: "Harris" }, mailingConfirmed: true },
        paperwork: { form130U: { countyOfResidence: "Fort Bend" } },
      },
    });
    expect(poaFieldsFromSale(corrected).grantorCounty).toBe("Fort Bend");
  });

  it("offers the county as a tap list with the typed name as a way out", () => {
    const source = readFileSync("src/components/admin/paperwork/ListPickStep.tsx", "utf8");
    expect(source).toContain("TEXAS_COUNTIES");
    expect(source).toContain("t.chrome.useTyped");
  });
});
