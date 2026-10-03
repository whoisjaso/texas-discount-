import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { factById } from "@/lib/sales/deal-facts";
import { firstPaymentProblem } from "@/lib/sales/date-choices";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * A tap question has a way in for every real answer. The licence state
 * list had no escape for a Puerto Rico or a Mexican licence; the payment
 * method had no cashier's check or money order; "Another Date" for the
 * first payment took a date before the contract existed.
 */
describe("a real answer has a way in", () => {
  it("types a licence from a place the state list does not carry", () => {
    const pick = readFileSync("src/components/admin/paperwork/ListPickStep.tsx", "utf8");
    expect(pick).toMatch(/const typedPlace = list === "usStates" && needle\.length >= 2 && !exact \? search\.trim\(\) : "";/);
    expect(pick).toContain("t.chrome.useTypedPlace");
    expect(en.funnel.chrome.useTypedPlace).toBe("Another state or country: {value}");
    expect(es.funnel.chrome.useTypedPlace).toBe("Otro estado o país: {value}");
  });

  it("types another way of paying, and the paper prints the words", () => {
    for (const id of ["billOfSale.paymentMethod", "salvageBillOfSale.paymentMethod"]) {
      expect(factById(id)?.other, id).toEqual({ label: "Another Way", kind: "text" });
    }
    expect(es.funnel.paperwork.billOfSale.paymentMethod.other.label).toBe("Otra forma");
    const sale = ROUTES.cashPaid;
    const formData = { ...filedFormData("billOfSale", sale), paymentMethod: "Cashier's Check" };
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "billOfSale", formData, "https://x.test")!)!;
    expect(renderToStaticMarkup(createElement(DocumentSheet, { decoded }))).toContain("Cashier&#x27;s Check");
  });

  it("refuses a first payment before the contract date, or one that is not a date", () => {
    expect(firstPaymentProblem("2026-10-02", "2026-10-03")).toBe("beforeContract");
    expect(firstPaymentProblem("2026-10-03", "2026-10-03")).toBeNull();
    expect(firstPaymentProblem("2026-11-03", "2026-10-03")).toBeNull();
    expect(firstPaymentProblem("next week", "2026-10-03")).toBe("notADate");
    const action = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    expect(action).toMatch(/firstPaymentProblem\(value, contractDate\)/);
    expect(es.funnel.chrome.firstPaymentTooEarly).toMatch(/fecha del contrato/);
  });

  it("counts the first payment's taps from the contract's own date", () => {
    const page = readFileSync("src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "utf8");
    expect(page).toContain("contractDate: saleDate ?? extras.contractDate,");
  });
});
