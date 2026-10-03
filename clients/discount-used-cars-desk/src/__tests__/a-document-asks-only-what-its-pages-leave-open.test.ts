import { describe, expect, it } from "vitest";
import { paperworkAnswers, paperworkQuestions, questionFact, type PaperworkContext } from "@/lib/sales/paperwork";
import { askOrderFor } from "@/lib/documents/field-maps";
import { factById } from "@/lib/sales/deal-facts";

/**
 * A document's questions are derived from its pages: the facts it owns, in
 * its map's ask order, that apply and that the deal does not already hold;
 * then the facts its pages print that another document owns and nobody has
 * answered. Nothing else is a question.
 */
const base = (over: Partial<PaperworkContext> = {}): PaperworkContext => ({
  funding: "cash",
  bodyStyle: "sedan",
  licenceState: "TX",
  paidToday: null,
  buyerCity: "Houston",
  buyerCounty: "Harris",
  answers: {},
  ...over,
});

const keys = (doc: string, context: PaperworkContext) => paperworkQuestions(doc, context).map((q) => q.key);

describe("the questions are what the pages leave open", () => {
  it("asks the bill of sale's own facts in its ask order", () => {
    const order = askOrderFor("billOfSale").map((id) => factById(id)!.key);
    const asked = keys("billOfSale", base());
    expect(asked).toEqual(order.filter((key) => asked.includes(key)));
    expect(asked).toEqual(["odometerStatus", "paymentMethod", "tradeIn", "conditionType"]);
  });

  it("grows the trade-in and warranty questions only when they apply", () => {
    expect(keys("billOfSale", base({ answers: { tradeIn: "yes" } }))).toEqual(
      expect.arrayContaining(["tradeInVin", "tradeInDescription", "tradeInAllowance"]),
    );
    expect(keys("billOfSale", base({ answers: { conditionType: "warranty", warrantyKind: "limited" } }))).toEqual(
      expect.arrayContaining(["warrantyKind", "warrantyLaborPercent", "warrantyPartsPercent", "warrantySystems", "warrantyDuration"]),
    );
    expect(keys("billOfSale", base({ answers: { conditionType: "warranty", warrantyKind: "full" } }))).not.toContain("warrantyLaborPercent");
  });

  it("does not ask what the intake already said: the county, the licence state", () => {
    expect(keys("form130U", base({ intakeCounty: "Harris" }))).not.toContain("countyOfResidence");
    expect(keys("form130U", base({ intakeCounty: "" }))).toContain("countyOfResidence");
    expect(keys("billOfSale", base({ licenceState: "TX" }))).not.toContain("buyerLicenseState");
    expect(keys("billOfSale", base({ licenceState: "" }))).toContain("buyerLicenseState");
    // A passport has a country, not a state: the state question is not its question.
    expect(keys("billOfSale", base({ licenceState: "", idKind: "passport" }))).not.toContain("buyerLicenseState");
  });

  it("reads a known fact back with Change, and Change reopens it", () => {
    const known = base({ intakeCounty: "Fort Bend" });
    expect(paperworkAnswers("form130U", known).countyOfResidence).toBe("Fort Bend");
    expect(keys("form130U", { ...known, reopen: "countyOfResidence" })).toContain("countyOfResidence");
  });

  it("borrows another document's unanswered sworn fact, stored with its owner", () => {
    const allAnswers = { billOfSale: {} };
    const asked = keys("form130U", base({ intakeCounty: "Harris", allAnswers }));
    expect(asked).toContain("odometerStatus");
    expect(questionFact("form130U", "odometerStatus")?.owner).toBe("billOfSale");
    // Answered on the bill of sale, it is not asked again, and prints on the 130-U.
    const answered = base({ intakeCounty: "Harris", allAnswers: { billOfSale: { odometerStatus: "not_actual" } } });
    expect(keys("form130U", answered)).not.toContain("odometerStatus");
    expect(paperworkAnswers("form130U", answered).odometerStatus).toBe("not_actual");
  });

  it("asks box 27 only when there is an email to send to", () => {
    expect(keys("form130U", base({ intakeCounty: "Harris", buyerEmail: "" }))).not.toContain("renewalReminders");
    expect(keys("form130U", base({ intakeCounty: "Harris", buyerEmail: "a@b.co" }))).toContain("renewalReminders");
  });

  it("asks a business its name and FEIN, and a person neither", () => {
    expect(keys("form130U", base({ answers: { applicantType: "Business" } }))).toEqual(expect.arrayContaining(["businessName", "businessFein"]));
    expect(keys("form130U", base({ answers: { applicantType: "Individual" } }))).not.toContain("businessName");
  });
});
