import { dealerFees, dealership, factOr } from "@/lib/dealership-config";
import { laidOutByPages } from "@/lib/documents/page-layout";

// ============================================================
// Texas Tax & Fee Constants
//
// The jurisdiction seam. Everything below this comment is Texas: the 6.25%
// rate, the $33 title fee, and the forms these numbers feed (130-U, VTR-271).
// A dealership in another state needs this block and its form set replaced,
// not edited. Deliberately left as Texas-only for now, but named so it is
// findable rather than discovered.
// ============================================================

export const TEXAS_TAX_RATE = dealerFees.taxRate;

export const TEXAS_TITLE_FEE = dealerFees.titleFee;
export const DEFAULT_REG_FEE = dealerFees.registrationFee;
/**
 * The dealer's documentary fee, the one line the dealer sets. $225 is presumed
 * reasonable (7 TAC §84.205(b)(1)); above that only up to a maximum the dealer
 * filed with the OCCC (rulebook, `src/lib/legal/texas-dealer-fees.ts`). This
 * is the config's seed: an owner sets the figure at onboarding, each sale
 * keeps a copy (`fee-schedule.ts`), and the limit is checked when the owner
 * saves it and again at filing. Until it is supplied the figure is 0 on
 * screen, the receipt marks it "Not set", and `missingDealerFacts()` refuses
 * to file any document.
 */
export const DEFAULT_DOC_FEE = dealerFees.docFee ?? 0;
/** Whether the documentary fee above is a real figure or a missing one. */
export const DOC_FEE_SET = dealerFees.docFee !== null && Number.isFinite(dealerFees.docFee);

/** The config's three fee lines over the price and the tax (the default; each sale keeps its own). */
export const DEALER_FEE_TOTAL = TEXAS_TITLE_FEE + DEFAULT_REG_FEE + DEFAULT_DOC_FEE;
export const DEFAULT_SELLER_LIEN_REASON = 'Unpaid title, registration, tax office, or buyer balance advanced by seller';
export const DEFAULT_SELLER_LIENHOLDER = {
  name: factOr(factOr(dealership.legalName, "dealer legal name"), "dealer legal name"),
  address: dealership.address.street,
  city: dealership.address.locality,
  state: dealership.address.region,
  zip: dealership.address.postalCode,
};

/** Calculate Texas sales tax (6.25%) rounded to cents */
export function calcTexasTax(price: number): number {
  if (!price || isNaN(price) || price <= 0) return 0;
  return Math.round(price * TEXAS_TAX_RATE * 100) / 100;
}

/** Reverse-calculate sale price from out-the-door total */
export function reverseTTL(
  outTheDoor: number,
  titleFee = TEXAS_TITLE_FEE,
  docFee = DEFAULT_DOC_FEE,
  regFee = DEFAULT_REG_FEE
): { salePrice: number; tax: number } {
  if (!outTheDoor || isNaN(outTheDoor) || outTheDoor <= 0) {
    return { salePrice: 0, tax: 0 };
  }
  const afterFees = outTheDoor - titleFee - docFee - regFee;
  if (afterFees <= 0) return { salePrice: 0, tax: 0 };
  const salePrice = Math.round((afterFees / (1 + TEXAS_TAX_RATE)) * 100) / 100;
  const tax = Math.round(salePrice * TEXAS_TAX_RATE * 100) / 100;
  return { salePrice, tax };
}

// ============================================================
// Bill of Sale Data
// ============================================================

export interface BillOfSaleData {
  saleDate: string;
  stockNumber: string;
  buyerName: string;
  buyerAddress: string;
  buyerCity: string;
  buyerState: string;
  buyerZip: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerLicense: string;
  /** The issuer: a state for a licence or ID card, a country code for a passport. */
  buyerLicenseState: string;
  /** Licence, ID card, passport or military ID. Absent on older records: a licence. */
  buyerIdKind?: string;
  buyerIdFrontImage?: string;
  buyerIdBackImage?: string;
  coBuyerName: string;
  coBuyerAddress: string;
  coBuyerCity: string;
  coBuyerState: string;
  coBuyerZip: string;
  coBuyerPhone: string;
  coBuyerEmail: string;
  coBuyerLicense: string;
  coBuyerLicenseState: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleTrim: string;
  vehicleVin: string;
  vehiclePlate: string;
  vehicleColor: string;
  vehicleBodyStyle: string;
  vehicleMileage: string;
  odometerReading: string;
  odometerStatus: 'actual' | 'exceeds' | 'not_actual';
  salePrice: number;
  tradeInAllowance: number;
  tradeInDescription: string;
  tradeInVin: string;
  tradeInPayoff: number;
  tax: number;
  titleFee: number;
  docFee: number;
  registrationFee: number;
  /**
   * The government vehicle inspection program replacement fee and the
   * license plate fee, each on its own line, once the sale's government
   * fees are confirmed from webDEALER. Absent on copies without them.
   */
  inspectionFee?: number;
  plateFee?: number;
  /**
   * Printed as zero by the desk. Texas allows no dealer line outside the
   * documentary fee, the dealer-deputy title fee and the inventory tax
   * (Tex. Fin. Code §348.005), so a filing carrying any is refused.
   */
  otherFees: number;
  otherFeesDescription: string;
  /**
   * The documentary fee notice's version, stamped at filing; absent on a copy
   * filed before the notice existed, which prints exactly as it did.
   */
  docFeeNotice?: number;
  /** The approved Spanish notice beside the English one (a Spanish sale). */
  docFeeNoticeSpanish?: boolean;
  paymentMethod: 'Cash' | 'Certified Check' | 'Cashier Check' | 'Zelle' | 'CashApp' | 'Apple Pay' | 'PayPal' | 'Financing' | 'Other';
  paymentMethodOther: string;
  conditionType: 'as_is' | 'warranty';
  warrantyDuration: string;
  warrantyDescription: string;
  sellerLienEnabled?: boolean;
  sellerLienAmount?: number;
  sellerLienReason?: string;
  sellerLienDate?: string;
  sellerLienDueDate?: string;
  sellerLienholderName?: string;
  sellerLienholderAddress?: string;
  sellerLienholderCity?: string;
  sellerLienholderState?: string;
  sellerLienholderZip?: string;
  /**
   * A lien on the title that is not the seller's: the bank's, on a
   * lender-funded deal. Named so the bill of sale discloses whose lien the
   * title will carry; the amount is the bank's to state, so none is here.
   */
  titleLienholderName?: string;
  titleLienholderAddress?: string;
  titleLienholderCity?: string;
  titleLienholderState?: string;
  titleLienholderZip?: string;
  titleLienReason?: string;
}

export interface TitleLienSummary {
  enabled: boolean;
  lienholderName: string;
  lienholderAddress: string;
  lienholderCity: string;
  lienholderState: string;
  lienholderZip: string;
  lienDate: string;
  reason: string;
}

/** The bank's lien as the bill of sale discloses it. Off unless a holder is named. */
export function getTitleLienSummary(data: BillOfSaleData): TitleLienSummary {
  const name = (data.titleLienholderName ?? '').trim();
  return {
    enabled: name.length > 0,
    lienholderName: name,
    lienholderAddress: data.titleLienholderAddress ?? '',
    lienholderCity: data.titleLienholderCity ?? '',
    lienholderState: data.titleLienholderState ?? '',
    lienholderZip: data.titleLienholderZip ?? '',
    lienDate: data.saleDate,
    reason: data.titleLienReason ?? '',
  };
}

export interface SellerLienSummary {
  enabled: boolean;
  amount: number;
  reason: string;
  lienDate: string;
  dueDate: string;
  lienholderName: string;
  lienholderAddress: string;
  lienholderCity: string;
  lienholderState: string;
  lienholderZip: string;
}

export function calculateBillOfSale(data: BillOfSaleData) {
  const netTradeIn = Math.max(0, data.tradeInAllowance - data.tradeInPayoff);
  const balanceAfterTrade = Math.max(0, data.salePrice - netTradeIn);
  const feesSubtotal =
    data.tax + data.titleFee + data.docFee + data.registrationFee + (data.inspectionFee ?? 0) + (data.plateFee ?? 0) + data.otherFees;
  const totalDue = balanceAfterTrade + feesSubtotal;
  return { netTradeIn, balanceAfterTrade, feesSubtotal, totalDue };
}

export function getSellerLienSummary(data: BillOfSaleData): SellerLienSummary {
  const amount = Math.max(0, Number(data.sellerLienAmount ?? 0) || 0);
  const enabledFlag = data.sellerLienEnabled === true || String(data.sellerLienEnabled).toLowerCase() === 'true';
  const enabled = enabledFlag && amount > 0;

  return {
    enabled,
    amount,
    reason: data.sellerLienReason || DEFAULT_SELLER_LIEN_REASON,
    lienDate: data.sellerLienDate || data.saleDate,
    dueDate: data.sellerLienDueDate || '',
    lienholderName: data.sellerLienholderName || DEFAULT_SELLER_LIENHOLDER.name,
    lienholderAddress: data.sellerLienholderAddress || DEFAULT_SELLER_LIENHOLDER.address,
    lienholderCity: data.sellerLienholderCity || DEFAULT_SELLER_LIENHOLDER.city,
    lienholderState: data.sellerLienholderState || DEFAULT_SELLER_LIENHOLDER.state,
    lienholderZip: data.sellerLienholderZip || DEFAULT_SELLER_LIENHOLDER.zip,
  };
}

/**
 * What the acknowledgment's "Total Paid" says, and the lines beside it, from
 * the copy itself. One function for the sheet, the review and the tests.
 *
 *   cash or in-house   what was paid today; the balance is the seller's lien
 *   bank deal          the total due: the lot is paid in full, the buyer's
 *                      part today and the lender's at funding, with the
 *                      lender's part on its own line
 *   an old copy        the total due, as every copy printed before the
 *                      page-by-page stamp (documents/page-layout.ts)
 */
export function billOfSaleTotalPaid(data: BillOfSaleData): {
  stamped: boolean;
  totalPaid: number;
  paidToday: number | null;
  bankFinanced: boolean;
  financedByLender: number;
  lenderName: string;
} {
  const calc = calculateBillOfSale(data);
  const sellerLien = getSellerLienSummary(data);
  const titleLien = getTitleLienSummary(data);
  const stamped = laidOutByPages(data as unknown as Record<string, unknown>);
  const raw = (data as { amountPaidToday?: unknown }).amountPaidToday;
  const paidToday = stamped && typeof raw === "number" ? raw : null;
  const bankFinanced = titleLien.enabled || (data.paymentMethod === "Financing" && !sellerLien.enabled);
  const financedByLender =
    stamped && bankFinanced && paidToday !== null ? Math.max(0, Math.round((calc.totalDue - paidToday) * 100) / 100) : 0;
  return {
    stamped,
    totalPaid: paidToday !== null && !bankFinanced ? paidToday : calc.totalDue,
    paidToday,
    bankFinanced,
    financedByLender,
    lenderName: titleLien.lienholderName || data.paymentMethodOther || "",
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
