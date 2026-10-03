import { describe, expect, it } from "vitest";
import { fieldMapFor, printedFields } from "@/lib/documents/field-maps";
import { allFields } from "@/lib/documents/field-maps/types";
import { questionFact, paperworkQuestions } from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { ROUTES, owedDocuments } from "./fixtures/sales";

/**
 * A document asks only what its pages leave open: every question it asks
 * is read by a box it prints, or is an answer it holds for another paper
 * (the warranty's kind for the Buyers Guide; how a tow-away car leaves for
 * the acknowledgment), or decides which of its boxes are on the sale (is
 * there a trade-in). The bill of sale used to ask the warranty's labor and
 * parts shares for no box of its own, and the rebuilt disclosure asked the
 * licence's state for a box its state page does not have.
 */
function allowed(documentType: string): Set<string> {
  const map = fieldMapFor(documentType)!;
  const ids = new Set<string>();
  for (const field of printedFields(map)) if (field.source.from === "answer") ids.add(field.source.fact);
  for (const field of allFields(map)) {
    if ((field.carriedFor || field.decides) && field.source.from === "answer") ids.add(field.source.fact);
  }
  return ids;
}

describe("every question is for a box on its document", () => {
  for (const [route, sale] of Object.entries(ROUTES)) {
    for (const documentType of owedDocuments(sale)) {
      it(`${route}: ${documentType}`, () => {
        const county = (sale.stepData as { buyerId?: { mailing?: { county?: string } } }).buyerId?.mailing?.county ?? "";
        const { context } = paperworkFilingContext(sale, documentType, county);
        // Every question the walk could reach: with every answer cleared.
        const fresh = { ...context, answers: {}, allAnswers: {} };
        for (const question of [...paperworkQuestions(documentType, context), ...paperworkQuestions(documentType, fresh)]) {
          const fact = questionFact(documentType, question.key);
          expect(fact, `${documentType}.${question.key}`).toBeDefined();
          expect(allowed(documentType).has(fact!.id), `${documentType} asks ${fact!.id}`).toBe(true);
        }
      });
    }
  }

  it("asks the trade-in's VIN right after the trade-in, before it is described", () => {
    // The car is identified before it is described (corridor-changes.md, the SOP).
    const order = fieldMapFor("billOfSale")!.askOrder.map((id) => id.split(".")[1]);
    const at = (key: string) => order.indexOf(key);
    expect(at("tradeInVin")).toBe(at("tradeIn") + 1);
    expect(at("tradeInDescription")).toBe(at("tradeInVin") + 1);
    expect(at("tradeInAllowance")).toBeGreaterThan(at("tradeInDescription"));
    // And the walk meets them in that order.
    const { context } = paperworkFilingContext(ROUTES.bhphTrade, "billOfSale", "Harris");
    const fresh = { ...context, answers: { tradeIn: "yes" }, allAnswers: {} };
    const asked = paperworkQuestions("billOfSale", fresh).map((question) => question.key);
    expect(asked.indexOf("tradeInVin")).toBe(asked.indexOf("tradeIn") + 1);
    expect(asked.indexOf("tradeInDescription")).toBe(asked.indexOf("tradeInVin") + 1);
  });

  it("the rebuilt disclosure asks nothing, even with no licence state on file", () => {
    const sale = { ...ROUTES.rebuilt, buyer: { ...ROUTES.rebuilt.buyer!, idState: "" } };
    const { context } = paperworkFilingContext(sale, "rebuiltDisclosure", "Harris");
    expect(paperworkQuestions("rebuiltDisclosure", context)).toEqual([]);
  });
});
