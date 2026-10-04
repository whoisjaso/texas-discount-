import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SELLER_FINANCED_TAX_CLIFF_DAYS,
  TITLE_FILING_DAYS,
  daysUntil,
  isSellerFinanced,
  lenderAsLienholder,
  lienFor,
  sellerAsLienholder,
  titleFilingWindow,
  type Lienholder,
} from "@/lib/documents/lien";
import { getTitleLienSummary } from "@/lib/documents/billOfSale";
import type { Lender } from "@/lib/sales/lenders";
import { dealership } from "@/lib/dealership-config";
import { stripComments } from "./helpers/strip-comments";

/**
 * A financed car always carries a lien, and the paperwork says whose.
 *
 * The owner's rule, in his words: on a buy-here-pay-here or any financed
 * deal there is always a lien on the 130-U, disclosed on the bill of sale
 * too. In-house, the dealership holds it. Through a lender, the lender
 * does. The corridor already knew the funding answer; what it did not do
 * was let that answer decide the lien on both sheets without asking again.
 *
 * The second half is the clock. Thirty days to file, forty-five when the
 * lot financed it, and on a seller-financed sale the deferred tax comes due
 * in full on day sixty. That last one is the expensive one to forget.
 */

const SELLER: Lienholder = {
  name: "Triple J Auto Investment LLC",
  street: "1 Lot Rd",
  city: "South Houston",
  state: "TX",
  zip: "77587",
  certifiedLienholderId: null,
};

const CAC: Lender = {
  id: "creditAcceptance",
  name: "Credit Acceptance",
  kind: "lender",
  portal: null,
  gloss: "Deep subprime programme",
};

const CAC_WITH_BOX: Lender = {
  ...CAC,
  lienholder: {
    name: "Credit Acceptance Corporation",
    street: "25505 W 12 Mile Rd",
    city: "Southfield",
    state: "MI",
    zip: "48034",
    certifiedLienholderId: "00000000",
  },
};

const base = { saleDate: "2026-09-17", reason: "Balance owed", seller: SELLER, lender: null, lenderOther: null };

describe("whose lien the title carries", () => {
  it("is the dealership's on an in-house note, whatever the balance says", () => {
    const lien = lienFor({ ...base, funding: "inHouse", balanceOwed: 7500 });
    expect(lien?.holder).toBe("seller");
    expect(lien?.lienholder.name).toBe(SELLER.name);
    expect(lien?.amountSecured).toBe(7500);
    // A zero balance on a note is a data problem, not a free-and-clear title.
    expect(lienFor({ ...base, funding: "inHouse", balanceOwed: 0 })?.holder).toBe("seller");
  });

  it("is the bank's on a lender deal, and never the dealership's", () => {
    const lien = lienFor({ ...base, funding: "lender", balanceOwed: 7500, lender: CAC });
    expect(lien?.holder).toBe("lender");
    expect(lien?.lienholder.name).toBe("Credit Acceptance");
    expect(lien?.lienholder.name).not.toBe(SELLER.name);
    // The note is the bank's; its figure is not ours to print.
    expect(lien?.amountSecured).toBe(0);
  });

  it("carries the bank's titling address only when the directory has it", () => {
    // A blank box is one a clerk completes; a guessed address is one a clerk trusts.
    const blank = lenderAsLienholder(CAC, null);
    expect(blank?.street).toBe("");
    expect(blank?.certifiedLienholderId).toBeNull();

    const boxed = lenderAsLienholder(CAC_WITH_BOX, null);
    expect(boxed).toMatchObject({
      name: "Credit Acceptance Corporation",
      street: "25505 W 12 Mile Rd",
      city: "Southfield",
      state: "MI",
      zip: "48034",
      certifiedLienholderId: "00000000",
    });
  });

  it("names a lender typed in when the directory does not carry it", () => {
    const lien = lienFor({ ...base, funding: "lender", balanceOwed: 0, lenderOther: "  First Street Bank " });
    expect(lien?.lienholder.name).toBe("First Street Bank");
  });

  it("has no holder on a lender deal with no lender named", () => {
    expect(lienFor({ ...base, funding: "lender", balanceOwed: 0 })).toBeNull();
  });

  it("is the seller's on a cash deal only while money is owed", () => {
    expect(lienFor({ ...base, funding: "cash", balanceOwed: 600 })?.holder).toBe("seller");
    expect(lienFor({ ...base, funding: "cash", balanceOwed: 0 })).toBeNull();
  });

  it("is nothing until the funding question is answered", () => {
    expect(lienFor({ ...base, funding: null, balanceOwed: 600 })).toBeNull();
  });

  it("puts the dealership in the box as the config spells it", () => {
    const seller = sellerAsLienholder({
      legalName: "Next Lot LLC",
      address: { street: "2 Main", locality: "Austin", region: "TX", postalCode: "78701" },
      titleWork: { certifiedLienholderId: "12345678" },
    });
    expect(seller).toEqual({
      name: "Next Lot LLC",
      street: "2 Main",
      city: "Austin",
      state: "TX",
      zip: "78701",
      certifiedLienholderId: "12345678",
    });
  });
});

describe("the filing clock", () => {
  it("is the law's numbers", () => {
    // 43 TAC §215.144(f)(3); Tax Code §152.069; Tax Code §152.047(f).
    expect(TITLE_FILING_DAYS.standard).toBe(30);
    expect(TITLE_FILING_DAYS.dealerFinanced).toBe(45);
    expect(SELLER_FINANCED_TAX_CLIFF_DAYS).toBe(60);
  });

  it("gives a cash or bank deal thirty days and no tax cliff", () => {
    for (const funding of ["cash", "lender"] as const) {
      const window = titleFilingWindow(funding, "2026-09-17");
      expect(window.days).toBe(30);
      expect(window.fileBy).toBe("2026-10-17");
      expect(window.taxDueInFullBy).toBeNull();
    }
  });

  it("gives the in-house note forty-five days, and names the day the tax is due in full", () => {
    const window = titleFilingWindow("inHouse", "2026-09-17");
    expect(window.days).toBe(45);
    expect(window.fileBy).toBe("2026-11-01");
    expect(window.taxDueInFullBy).toBe("2026-11-16");
  });

  it("counts across a month end and a year end without drifting", () => {
    expect(titleFilingWindow("cash", "2026-12-15").fileBy).toBe("2027-01-14");
    expect(titleFilingWindow("inHouse", "2026-02-01").taxDueInFullBy).toBe("2026-04-02");
  });

  it("knows seller-financed is the in-house note and nothing else", () => {
    // Tax Code §152.001: the dealer keeps the lien and takes the price in payments.
    expect(isSellerFinanced("inHouse")).toBe(true);
    expect(isSellerFinanced("lender")).toBe(false);
    expect(isSellerFinanced("cash")).toBe(false);
  });

  it("counts days to a date, negative once it has passed", () => {
    expect(daysUntil("2026-10-17", "2026-09-17")).toBe(30);
    expect(daysUntil("2026-09-16", "2026-09-17")).toBe(-1);
  });
});

describe("the bill of sale discloses the bank's lien", () => {
  it("is off unless a holder is named", () => {
    expect(getTitleLienSummary({ saleDate: "2026-09-17" } as never).enabled).toBe(false);
    expect(getTitleLienSummary({ saleDate: "2026-09-17", titleLienholderName: "  " } as never).enabled).toBe(false);
  });

  it("carries the holder, the date, and the reason", () => {
    const summary = getTitleLienSummary({
      saleDate: "2026-09-17",
      titleLienholderName: "Credit Acceptance",
      titleLienholderCity: "Southfield",
      titleLienholderState: "MI",
      titleLienReason: "Purchase money financed by Credit Acceptance",
    } as never);
    expect(summary).toMatchObject({
      enabled: true,
      lienholderName: "Credit Acceptance",
      lienholderCity: "Southfield",
      lienDate: "2026-09-17",
    });
  });
});

// ── The clock on the sale summary ──

import { buildSaleSummary, summaryRows, type SummaryFacts } from "@/lib/sales/sale-summary";

function summaryFacts(overrides: Partial<SummaryFacts> = {}): SummaryFacts {
  return {
    dealId: "d1",
    vehicleLabel: "2019 BMW 530i",
    vin: "WBAJA5C50KB123456",
    buyerName: "Marcus Reed",
    dealLanguage: "en",
    licenceOnFile: true,
    funding: "inHouse",
    lenderName: null,
    titleStatus: "clean",
    titleOriginState: null,
    salvagePath: null,
    money: { amount: "12000", priceBasis: "vehicleOnly", total: 13000, paidToday: 2000, lien: 11000 },
    plan: {
      registrationBy: "dealer",
      titleSignedBy: "buyer",
      priceIncludesRegistration: null,
      insuranceShown: true,
      inspectionBy: "done",
    },
    documents: [{ type: "billOfSale", state: "signed" }],
    plate: null,
    deliveredOn: "2026-09-17",
    financing: null,
    steps: [
      { key: "funding", done: true },
      { key: "document:billOfSale", done: true },
      { key: "title", done: false },
    ],
    ...overrides,
  };
}

describe("the clock on the sale summary", () => {
  const rowsOf = (facts: SummaryFacts) => summaryRows(buildSaleSummary(facts));

  it("shows the in-house note both dates", () => {
    const rows = rowsOf(summaryFacts());
    expect(rows.find((r) => r.key === "titleFileBy")?.value).toEqual({ kind: "date", date: "2026-11-01" });
    expect(rows.find((r) => r.key === "taxDueInFullBy")?.value).toEqual({ kind: "date", date: "2026-11-16" });
  });

  it("shows a cash or bank deal thirty days and no cliff", () => {
    for (const funding of ["cash", "lender"] as const) {
      const rows = rowsOf(summaryFacts({ funding }));
      expect(rows.find((r) => r.key === "titleFileBy")?.value).toEqual({ kind: "date", date: "2026-10-17" });
      expect(rows.find((r) => r.key === "taxDueInFullBy")).toBeUndefined();
    }
  });

  it("settles when the title step settles", () => {
    const open = rowsOf(summaryFacts()).find((r) => r.key === "titleFileBy");
    expect(open?.done).toBe(false);
    const filed = rowsOf(
      summaryFacts({ steps: [{ key: "funding", done: true }, { key: "title", done: true }] }),
    ).find((r) => r.key === "titleFileBy");
    expect(filed?.done).toBe(true);
  });

  it("shows nothing until the deal has a date and a funding answer", () => {
    expect(rowsOf(summaryFacts({ deliveredOn: null })).find((r) => r.key === "titleFileBy")).toBeUndefined();
    expect(rowsOf(summaryFacts({ funding: null })).find((r) => r.key === "titleFileBy")).toBeUndefined();
  });
});

// ── How it is wired ──

const src = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));
const CORRIDOR = src("src/lib/sales/corridor-link.ts");
const PREVIEW = src("src/components/documents/BillOfSalePreview.tsx");
const SUMMARY = src("src/lib/sales/sale-summary.ts");
const EN = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8"));
const ES = JSON.parse(readFileSync(join(process.cwd(), "messages/es.json"), "utf8"));

describe("the wiring", () => {
  it("decides the lien once and hands it to both sheets", () => {
    expect(CORRIDOR).toContain("lienFor({");
    expect(CORRIDOR).toContain("...bankLienKeys(lien)");
    expect(CORRIDOR).toContain("...form130ULienKeys(lien)");
  });

  it("never blanks a lienholder address by hand again", () => {
    // The old lender branch wrote four empty strings and a comment saying
    // why. The directory now says whether there is an address.
    expect(CORRIDOR).not.toMatch(/lienholderAddress:\s*""/);
  });

  it("keeps the seller-lien keys off a lender-funded 130-U", () => {
    expect(CORRIDOR).toMatch(/lien\?\.holder === "seller" \? sellerLien : \{\}/);
  });

  it("prints the bank's lien beside the seller's on the bill of sale", () => {
    expect(PREVIEW).toContain("titleLien.enabled");
    expect(PREVIEW).toContain("b.titleLienTitle");
    expect(PREVIEW).toContain("b.ackTitleLien");
  });

  it("puts the filing clock on the sale summary", () => {
    expect(SUMMARY).toContain("titleFilingWindow(facts.funding, facts.deliveredOn)");
    expect(SUMMARY).toContain('key: "taxDueInFullBy"');
  });

  it("says it in both languages", () => {
    for (const messages of [EN, ES]) {
      const bos = messages.documents.billOfSale;
      expect(bos.titleLienTitle).toBeTruthy();
      expect(bos.titleLienDescription).toBeTruthy();
      expect(bos.titleLienAcknowledgment).toContain("{dealerLegal}");
      expect(bos.ackTitleLien).toBeTruthy();
      const rows = messages.funnel.summary.rows;
      expect(rows.titleFileBy).toBeTruthy();
      expect(rows.taxDueInFullBy).toBeTruthy();
    }
  });

  it("gives the dealership a lienholder id and a seller-financed permit to fill in", () => {
    // Null until typed in; nothing invented.
    expect(dealership.titleWork).toHaveProperty("certifiedLienholderId");
    expect(dealership.titleWork).toHaveProperty("sellerFinancedPermit");
  });
});
