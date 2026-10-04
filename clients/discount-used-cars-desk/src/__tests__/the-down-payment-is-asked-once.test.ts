import { describe, expect, it } from "vitest";
import { paperworkAnswers, paperworkQuestions, type PaperworkContext } from "@/lib/sales/paperwork";

/**
 * The money step's paid-today figure is the contract's down payment: read
 * back on the review with Change, never asked twice. A nothing-down deal,
 * which the money step leaves without a figure, is still asked.
 */
const context = (over: Partial<PaperworkContext>): PaperworkContext => ({
  funding: "inHouse", bodyStyle: "sedan", licenceState: "TX", paidToday: null, buyerCity: "Houston", buyerCounty: "Harris", answers: {}, ...over,
});
const keys = (c: PaperworkContext) => paperworkQuestions("financing", c).map((q) => q.key);

describe("the down payment is asked once", () => {
  it("skips the question when the money step answered it, and files that figure", () => {
    const answered = context({ paidToday: 1500 });
    expect(keys(answered)).not.toContain("downPayment");
    expect(paperworkAnswers("financing", answered).downPayment).toBe("1500");
  });

  it("reopens it from the review's Change link", () => {
    expect(keys(context({ paidToday: 1500, reopen: "downPayment" }))).toContain("downPayment");
  });

  it("asks a deal the money step left without a figure", () => {
    expect(keys(context({ paidToday: null }))).toContain("downPayment");
  });

  it("files a stored answer over the money step's figure", () => {
    expect(paperworkAnswers("financing", context({ paidToday: 1500, answers: { downPayment: "2000" } })).downPayment).toBe("2000");
  });
});
