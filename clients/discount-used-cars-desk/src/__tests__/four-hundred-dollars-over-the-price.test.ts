import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  calcTexasTax,
  reverseTTL,
  DEALER_FEE_TOTAL,
  DEFAULT_DOC_FEE,
  DEFAULT_REG_FEE,
  TEXAS_TITLE_FEE,
  TEXAS_TAX_RATE,
} from "@/lib/documents/billOfSale";
import { DEFAULT_FEES, paperworkMoney } from "@/lib/sales/paperwork";

/**
 * What this lot charges, stated once.
 *
 * The dealer's rule is a sentence: vehicle price, plus 6.25% sales tax, plus
 * $400. The software held it as three separate constants adding to $258, which
 * is not the rule and had never been checked against it, because nothing in the
 * codebase knew what the total was supposed to be.
 *
 * So the total is now the source figure and the split is derived from it. These
 * tests exist to fail if that split ever stops adding up: a statutory fee moved
 * and nobody adjusted the line that absorbs it, or somebody set the doc fee
 * directly and quietly changed what every buyer pays.
 */

const REVIEW = readFileSync("src/components/admin/paperwork/ReviewStep.tsx", "utf8");
const PAGE = readFileSync("src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "utf8");

describe("the fee schedule", () => {
  it("adds up to what the dealer quotes", () => {
    expect(TEXAS_TITLE_FEE + DEFAULT_DOC_FEE + DEFAULT_REG_FEE).toBe(DEALER_FEE_TOTAL);
    expect(DEALER_FEE_TOTAL).toBe(400);
  });

  it("leaves the statutory figures at their real values", () => {
    // The difference lives in the doc fee, which is the line Texas leaves to
    // the dealer. Moving title or registration to make the sum work would be
    // writing a false figure onto a state form.
    expect(TEXAS_TITLE_FEE).toBe(33);
    expect(DEFAULT_REG_FEE).toBe(75);
  });

  it("is what the paperwork corridor starts a bill of sale with", () => {
    expect(DEFAULT_FEES.titleFee + DEFAULT_FEES.docFee + DEFAULT_FEES.registrationFee).toBe(400);
  });

  it("is what the out-the-door calculator backs out", () => {
    // Given a price, the total, then that total run backwards, returns the
    // price. If the calculator subtracted a different fee total than the one
    // the bill of sale adds, these would drift apart.
    const price = 12000;
    const outTheDoor = price + calcTexasTax(price) + DEALER_FEE_TOTAL;
    expect(reverseTTL(outTheDoor).salePrice).toBeCloseTo(price, 2);
  });
});

describe("what the buyer owes", () => {
  it("is price, plus 6.25%, plus four hundred", () => {
    const money = paperworkMoney(20000, {});
    expect(money.salePrice).toBe(20000);
    expect(money.tax).toBe(1250);
    expect(money.feeTotal).toBe(400);
    expect(money.total).toBe(21650);
  });

  it("uses the state's rate rather than a number typed here", () => {
    expect(paperworkMoney(9999, {}).tax).toBe(Math.round(9999 * TEXAS_TAX_RATE * 100) / 100);
  });

  it("takes the trade-in off what is owed, and off the tax base", () => {
    const money = paperworkMoney(20000, { tradeIn: "yes", tradeInAllowance: "3000" });
    expect(money.tradeInAllowance).toBe(3000);
    // The tax base moves with the trade: 6.25% of $17,000, per Tax Code
    // section 152.021 and the Comptroller's own worked example. Charging on
    // the full price overtaxed every trade-in deal.
    expect(money.tax).toBe(1062.5);
    expect(money.total).toBe(18462.5);
  });

  it("ignores a trade-in allowance when there is no trade-in", () => {
    // The answer survives if somebody says yes, types a figure, then goes back
    // and says no. Reading it anyway would silently discount the deal.
    const money = paperworkMoney(20000, { tradeIn: "no", tradeInAllowance: "3000" });
    expect(money.tradeInAllowance).toBe(0);
    expect(money.total).toBe(21650);
  });

  it("never goes below zero", () => {
    const money = paperworkMoney(1000, { tradeIn: "yes", tradeInAllowance: "99999" });
    expect(money.total).toBe(0);
  });

  it("holds up when the vehicle has no price on it", () => {
    const money = paperworkMoney(null, {});
    expect(money.salePrice).toBe(0);
    expect(money.tax).toBe(0);
    // The fees are still real: they are charged per deal, not per dollar.
    expect(money.total).toBe(400);
  });
});

describe("the money reaching the document", () => {
  it("is filed with the bill of sale, not just shown", () => {
    // A filed bill of sale carrying only the answered questions is a receipt
    // with no amount on it.
    expect(REVIEW).toContain("...(money ?? {})");
  });

  it("is computed on the server from the vehicle and what the price meant", () => {
    // The third argument is the money step's two answers, and it is the whole
    // difference between a $4,000 car and a $4,000 drive-away. The fourth is
    // how the deal is funded, which decides whose lien the remainder is:
    // computed here rather than typed on the document, so the bill of sale,
    // the 130-U and the vehicle responsibility form cannot disagree about one
    // deal, and a bank-funded one cannot print a seller lien.
    expect(PAGE).toContain("paperworkMoney(");
    expect(PAGE).toContain("readMoney(sale.stepData),");
    expect(PAGE).toContain("sale.funding.type,");
  });

  it("reaches every document, each reading only the figures it prints", () => {
    // This used to hand the money to the bill of sale and the contract alone,
    // on the theory that nothing else carried amounts. The 130-U does: box 38
    // is the sales and use tax computation, and the filed state form read
    // $0.00 sales price and $0.00 tax until the paper was read back. The
    // corridor's link builder is where each document picks its figures.
    expect(PAGE).toContain("money={money}");
    expect(PAGE).not.toMatch(/money=\{\s*entry\.documentType ===/);
  });

  it("shows the operator a total before it is signed", () => {
    // "Total", not "Total Due". The words on these screens were cut to what a
    // dealer reading at a sixth grade level says out loud to a buyer, and Due
    // was doing no work that Total was not already doing. The word itself
    // lives in the catalogue now, in both languages, and stays pinned there.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const funnel = (require("../../messages/en.json") as {
      funnel: { review: { money: { total: string } } };
    }).funnel;
    expect(funnel.review.money.total).toBe("Total");
    expect(REVIEW).toContain("t.review.money.total");
    expect(REVIEW).toContain("money.total");
  });
});
