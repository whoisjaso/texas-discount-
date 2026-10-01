import { factOr } from "@/lib/dealership-config";
import type { DealType } from "@/lib/sales/deal-type";
import type { Lender } from "@/lib/sales/lenders";

/**
 * Whose lien goes on the title, and how long the dealer has to file it.
 *
 * Two facts the funding answer already settles, written down once so no
 * document has to ask them again:
 *
 * 1. A financed car always carries a lien. On an in-house note the seller
 *    holds it; on a bank deal the bank holds it; on a cash deal with money
 *    still owed the seller holds it; on a cash deal paid in full there is
 *    none. The 130-U prints it in boxes 32 to 34 and the bill of sale
 *    discloses it, and both read it from here rather than from a question.
 *
 * 2. The filing clock. A dealer files title and registration within 30 days
 *    of the sale, or 45 days when the dealer financed it (43 TAC
 *    §215.144(f)(3); Tax Code §152.069). A seller-financed sale also defers
 *    the sales tax, remitted as the payments arrive (Tax Code §152.047(e)),
 *    and that deferral has a cliff: if title is not filed by the 60th day
 *    after delivery, the whole tax on the whole price is due at once
 *    (§152.047(f)). Thirty days is the habit, forty-five the law, sixty the
 *    bill.
 *
 * "Seller-financed" is the Tax Code's own term (§152.001): a dealer that
 * collects the price in periodic payments and retains a lien until it is
 * paid. That is the in-house note, and nothing else this lot writes.
 *
 * Nothing here reads config or a database. The dealership comes in as an
 * argument, so the module is the same for the next dealership this software
 * is set up for.
 */

export type LienHolder = "seller" | "lender";

export type Lienholder = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** TxDMV certified (eTitle) lienholder id, box 32, when the holder has one. */
  certifiedLienholderId: string | null;
};

export type TitleLien = {
  holder: LienHolder;
  lienholder: Lienholder;
  /** ISO date for box 33. The note starts the day the car is sold. */
  lienDate: string;
  /**
   * What the seller's lien secures. Zero on a bank deal: the note is the
   * bank's, and its figure is not ours to print.
   */
  amountSecured: number;
  reason: string;
};

export type LienInput = {
  funding: DealType | null;
  /** ISO date of sale. */
  saleDate: string;
  /** What the buyer still owes the seller once today's money is counted. */
  balanceOwed: number;
  /** What the seller's lien is for, in the words the bill of sale uses. */
  reason: string;
  seller: Lienholder;
  /** The lender picked from the directory, when funding is "lender". */
  lender: Lender | null;
  /** A lender typed in because the directory did not carry it. */
  lenderOther: string | null;
};

/** The dealership as it appears in a lienholder box. */
export function sellerAsLienholder(dealership: {
  legalName: string | null;
  address: { street: string; locality: string; region: string; postalCode: string };
  titleWork: { certifiedLienholderId: string | null };
}): Lienholder {
  return {
    name: factOr(dealership.legalName, "dealer legal name"),
    street: dealership.address.street,
    city: dealership.address.locality,
    state: dealership.address.region,
    zip: dealership.address.postalCode,
    certifiedLienholderId: dealership.titleWork.certifiedLienholderId,
  };
}

/**
 * A lender as it appears in a lienholder box.
 *
 * The address and id come from the directory entry when the entry carries
 * them, and are left blank when it does not. A blank box is one a clerk
 * completes from the lender's paperwork; a guessed address is one a clerk
 * trusts, and that was the audit's worst finding.
 */
export function lenderAsLienholder(lender: Lender | null, lenderOther: string | null): Lienholder | null {
  const name = lender?.lienholder?.name ?? lender?.name ?? lenderOther?.trim() ?? "";
  if (!name) return null;
  const box = lender?.lienholder;
  return {
    name,
    street: box?.street ?? "",
    city: box?.city ?? "",
    state: box?.state ?? "",
    zip: box?.zip ?? "",
    certifiedLienholderId: box?.certifiedLienholderId ?? null,
  };
}

/**
 * The lien the title carries, or null when it carries none.
 *
 * An in-house note always answers with the seller's lien, whatever the
 * balance says. A zero there is a data problem for the money step to raise,
 * not a reason to title a financed car free and clear.
 */
export function lienFor(input: LienInput): TitleLien | null {
  switch (input.funding) {
    case "lender": {
      const lienholder = lenderAsLienholder(input.lender, input.lenderOther);
      if (!lienholder) return null;
      return {
        holder: "lender",
        lienholder,
        lienDate: input.saleDate,
        amountSecured: 0,
        reason: `Purchase money financed by ${lienholder.name}`,
      };
    }
    case "inHouse":
      return {
        holder: "seller",
        lienholder: input.seller,
        lienDate: input.saleDate,
        amountSecured: Math.max(0, input.balanceOwed),
        reason: input.reason,
      };
    case "cash":
      if (input.balanceOwed <= 0) return null;
      return {
        holder: "seller",
        lienholder: input.seller,
        lienDate: input.saleDate,
        amountSecured: input.balanceOwed,
        reason: input.reason,
      };
    default:
      return null;
  }
}

// ── The filing clock ──

/** 43 TAC §215.144(f)(3); Tax Code §152.069 for the dealer-financed period. */
export const TITLE_FILING_DAYS = { standard: 30, dealerFinanced: 45 } as const;

/** Tax Code §152.047(f): the day the deferred tax stops being deferred. */
export const SELLER_FINANCED_TAX_CLIFF_DAYS = 60;

/** Tax Code §152.001: the dealer keeps the lien and takes the price in payments. */
export function isSellerFinanced(funding: DealType | null): boolean {
  return funding === "inHouse";
}

export type FilingWindow = {
  days: (typeof TITLE_FILING_DAYS)[keyof typeof TITLE_FILING_DAYS];
  /** ISO date. The last day to file title and registration. */
  fileBy: string;
  /** ISO date, seller-financed only. Miss it and the whole tax is due at once. */
  taxDueInFullBy: string | null;
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function titleFilingWindow(funding: DealType | null, deliveredOn: string): FilingWindow {
  const sellerFinanced = isSellerFinanced(funding);
  const days = sellerFinanced ? TITLE_FILING_DAYS.dealerFinanced : TITLE_FILING_DAYS.standard;
  return {
    days,
    fileBy: addDays(deliveredOn, days),
    taxDueInFullBy: sellerFinanced ? addDays(deliveredOn, SELLER_FINANCED_TAX_CLIFF_DAYS) : null,
  };
}

/** Whole days from today to the date, negative once it has passed. */
export function daysUntil(iso: string, today: string): number {
  const day = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(day(iso) - day(today));
}
