import { dealerFees, dealership, factOr } from "@/lib/dealership-config";

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
 * The dealer's documentary fee, the one line the dealer sets. Texas puts no cap
 * on it. Read from the dealer config; until the owner supplies it the figure
 * is 0 on screen, the receipt marks it "Not set", and `missingDealerFacts()`
 * refuses to file any document.
 */
export const DEFAULT_DOC_FEE = dealerFees.docFee ?? 0;
/** Whether the documentary fee above is a real figure or a missing one. */
export const DOC_FEE_SET = dealerFees.docFee !== null && Number.isFinite(dealerFees.docFee);

/** What this lot charges over the price and the tax: the three fee lines. */
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
  otherFees: number;
  otherFeesDescription: string;
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
  const feesSubtotal = data.tax + data.titleFee + data.docFee + data.registrationFee + data.otherFees;
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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
