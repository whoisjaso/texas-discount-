import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

import ContractPreview from "@/components/documents/ContractPreview";
import type { ContractData } from "@/lib/documents/finance";
import { addMonths, firstPaymentChoices } from "@/lib/sales/date-choices";
import { asked, paperworkQuestions, unansweredSwornFacts, type PaperworkContext } from "@/lib/sales/paperwork";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * The first payment is two taps worked out from the contract date and how
 * often they pay, or a typed date; never a blank. Every BHPH contract the
 * walks filed read "Monthly beginning" with no date and no schedule.
 */
describe("the first payment is a date, not a blank", () => {
  it("offers the dates a note on this frequency starts on", () => {
    expect(firstPaymentChoices("2026-10-03", "Weekly").map((o) => o.value)).toEqual(["2026-10-10", "2026-10-17"]);
    expect(firstPaymentChoices("2026-10-03", "Bi-weekly").map((o) => o.value)).toEqual(["2026-10-17", "2026-10-31"]);
    expect(firstPaymentChoices("2026-10-03", "Monthly").map((o) => o.value)).toEqual(["2026-11-03", "2026-12-03"]);
    expect(firstPaymentChoices("2026-10-03", "Monthly")[0]).toMatchObject({ label: "In One Month", gloss: "11/03/2026" });
  });

  it("holds a contract on the 31st to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
  });

  it("is a tap with a typed date for anything else, and files only from an answer", () => {
    const context: PaperworkContext = {
      funding: "inHouse", bodyStyle: "sedan", licenceState: "TX", paidToday: 1500, buyerCity: "Houston", buyerCounty: "Harris",
      contractDate: "2026-10-03", answers: { paymentFrequency: "Weekly", termsBy: "count", numberOfPayments: "36" },
    };
    const question = paperworkQuestions("financing", context).find((q) => q.key === "firstPaymentDate")!;
    const shown = asked(question, context);
    expect(shown.kind).toBe("dateChoice");
    expect(shown.options?.map((o) => o.value)).toEqual(["2026-10-10", "2026-10-17"]);
    expect(shown.other?.kind).toBe("date");
    expect(unansweredSwornFacts("financing", context).map((fact) => fact.key)).toEqual(["firstPaymentDate"]);
  });

  it("prints the date and the amortization schedule once answered", () => {
    const formData = filedFormData("financing", ROUTES.bhphTrade);
    const dd = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES.bhphTrade, "financing", formData, "https://x.test")!)!.dd;
    expect(dd.firstPaymentDate).toBe("2026-11-03");
    const page = renderToStaticMarkup(createElement(ContractPreview, { data: dd as unknown as ContractData, signatures: {} as never }));
    expect(page).toContain("Amortization Schedule");
    expect(page).toContain("11/03/2026");
    // Without the date the schedule is not printed at all.
    const undated = renderToStaticMarkup(
      createElement(ContractPreview, { data: { ...dd, firstPaymentDate: "" } as unknown as ContractData, signatures: {} as never }),
    );
    expect(undated).not.toContain("Amortization Schedule");
  });
});
