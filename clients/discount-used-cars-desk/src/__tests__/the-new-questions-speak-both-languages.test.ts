import { describe, expect, it } from "vitest";
import { DOCUMENT_FACTS } from "@/lib/sales/deal-facts";
import { getFunnelStrings } from "@/lib/sales/i18n";
import { localizeQuestion } from "@/lib/sales/question-i18n";
import { asked, paperworkQuestions, type PaperworkContext } from "@/lib/sales/paperwork";
import { firstPaymentChoices } from "@/lib/sales/date-choices";

/**
 * Every question a document's pages leave open is asked in the operator's
 * language: the question, its note, every tap's label, the "another"
 * card, and the labels worked out from the deal (the payment dates, the
 * house rate). English is the embedded text; Spanish is its own words.
 */

type Overlay = { question?: string; note?: string; options?: Record<string, { label?: string }>; other?: { label?: string } };

const en = getFunnelStrings("en");
const es = getFunnelStrings("es");
const overlay = (strings: typeof en, owner: string, key: string): Overlay | undefined =>
  ((strings.paperwork as Record<string, unknown>)[owner] as Record<string, Overlay> | undefined)?.[key];

describe("the new questions speak both languages", () => {
  it.each(DOCUMENT_FACTS.map((fact) => [fact.id, fact] as const))("%s", (_id, fact) => {
    const english = overlay(en, fact.owner, fact.key);
    const spanish = overlay(es, fact.owner, fact.key);
    expect(english?.question, `${fact.id} EN`).toBe(fact.question);
    expect(typeof spanish?.question, `${fact.id} ES`).toBe("string");
    expect(spanish!.question).not.toBe(fact.question);
    if (fact.note) {
      expect(typeof spanish?.note, `${fact.id} ES note`).toBe("string");
    }
    for (const option of fact.options ?? []) {
      expect(typeof spanish?.options?.[option.value]?.label, `${fact.id} ES option ${option.value}`).toBe("string");
    }
    if (fact.other) {
      expect(typeof spanish?.other?.label, `${fact.id} ES other`).toBe("string");
    }
  });

  it("names the worked-out dates in Spanish", () => {
    const context: PaperworkContext = {
      funding: "inHouse", bodyStyle: "sedan", licenceState: "TX", paidToday: 1500, buyerCity: "Houston", buyerCounty: "Harris",
      contractDate: "2026-10-03", answers: { paymentFrequency: "Monthly", termsBy: "count", numberOfPayments: "36" },
    };
    const question = asked(paperworkQuestions("financing", context).find((q) => q.key === "firstPaymentDate")!, context);
    const spanish = localizeQuestion(es, "financing", question);
    const english = localizeQuestion(en, "financing", question);
    expect(english.options?.map((o) => o.label)).toEqual(firstPaymentChoices("2026-10-03", "Monthly").map((o) => o.label));
    expect(spanish.options?.map((o) => o.label)).not.toEqual(english.options?.map((o) => o.label));
    // The date itself is the same date in either language.
    expect(spanish.options?.map((o) => o.value)).toEqual(english.options?.map((o) => o.value));
  });
});
