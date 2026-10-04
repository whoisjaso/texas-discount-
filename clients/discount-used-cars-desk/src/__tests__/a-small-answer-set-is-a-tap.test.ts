import { describe, expect, it } from "vitest";
import { DEAL_FACTS, TAP_KINDS, factById } from "@/lib/sales/deal-facts";

/**
 * A tap is the default. A fact is typed only when its answer has no small
 * set (names, money and other open numbers, VINs, addresses, a plate, a
 * duration in the dealer's words) and it says why; a long set (states,
 * counties) is a searchable tap list, not a box to type two letters into.
 */
describe("a small answer set is a tap", () => {
  it("types only a fact that says why it cannot be a tap", () => {
    const typed = DEAL_FACTS.filter((fact) => !TAP_KINDS.has(fact.kind));
    for (const fact of typed) expect(fact.freeText, `${fact.id} is typed without a reason`).toBeTruthy();
  });

  it.each([
    "billOfSale.buyerLicenseState",
    "salvageBillOfSale.buyerLicenseState",
    "form130U.countyOfResidence",
    "financing.firstPaymentDate",
    "financing.apr",
    "financing.numberOfPayments",
    "form130U.renewalReminders",
    "billOfSale.warrantyKind",
    "billOfSale.warrantySystems",
  ])("%s is a tap", (id) => {
    expect(TAP_KINDS.has(factById(id)!.kind)).toBe(true);
  });

  it("keeps a way to type the rare answer on the taps that need one", () => {
    expect(factById("financing.apr")!.other?.kind).toBe("number");
    expect(factById("financing.numberOfPayments")!.other?.kind).toBe("number");
    expect(factById("financing.firstPaymentDate")!.other?.kind).toBe("date");
  });
});
