import {
  calcTexasTax,
  TEXAS_TAX_RATE,
  TEXAS_TITLE_FEE,
  DEFAULT_DOC_FEE,
  DEFAULT_REG_FEE,
} from "@/lib/documents/billOfSale";
import type { DealType } from "@/lib/sales/deal-type";
import type { DealFeeLines } from "@/lib/sales/fee-schedule";

/**
 * What the advertised price means, and what is still owed after today.
 *
 * The price on a windscreen at this lot is ambiguous and always has been. On
 * some cars it is the vehicle alone and the tax and fees go on top; on others
 * it is the figure the buyer drives away for, registration included. Nobody
 * writes down which, so two people can agree on "four thousand" and mean two
 * numbers $618.75 apart.
 *
 * The second ambiguity is worse, because it is money that walks out of the
 * door. A buyer can pay for the car today and leave the registration for
 * later. In Texas a dealer who hands over plates has to complete the
 * registration, so if that buyer never comes back the dealership files it out
 * of its own pocket or answers to the DMV. The lien is the answer: the unpaid
 * registration is secured against the title, the title comes to the dealership
 * rather than to the buyer's house, and it is released when they pay.
 *
 * So two questions, asked once, on their own screen:
 *
 *   is the price with registration or without it
 *   are they paying the registration today
 *
 * Everything else here is arithmetic, and arithmetic is not a question.
 */

/** What the number on the vehicle row already includes. */
export type PriceBasis =
  /** The drive-away figure. Tax and fees are inside it. */
  | "outTheDoor"
  /** The car alone. Tax and fees go on top. */
  | "vehicleOnly";

export type MoneyAnswers = {
  /**
   * The figure of the deal as spoken at the desk, typed by the dealer, in
   * dollars.
   *
   * Asked first, and asked as an open box, because it is the one plain fact in
   * the deal: a number two people agreed on out loud. Everything after it is
   * what that number means. It starts prefilled from the vehicle row when the
   * row has a price, but it is the dealer's answer and not the inventory's:
   * the walkthrough that forced this change was a car listed at $0, which made
   * every later figure $0 with no screen anywhere to say otherwise.
   */
  amount: string;
  /**
   * What was actually handed over today, when it differs from the amount.
   *
   * Empty means it does not differ: on a cash deal the spoken figure is what
   * crosses the desk. This exists for the sale where somebody pays part and
   * owes the rest, and it is an override rather than a question of its own.
   */
  paidTodayAmount: string;
  /**
   * Whether the spoken figure already has tax and fees inside it.
   *
   * Second, because it is what turns the amount into a balance. The same
   * $3,500 handed over is a paid deal on an out-the-door car and $618.75 owing
   * on one priced without.
   */
  priceBasis: PriceBasis | "";
};

export const EMPTY_MONEY: MoneyAnswers = {
  amount: "",
  paidTodayAmount: "",
  priceBasis: "",
};

export type SaleMoney = {
  basis: PriceBasis;
  /** The figure on the vehicle row, whatever it turns out to mean. */
  advertised: number;
  /** The car alone. Back-solved when the advertised price was out-the-door. */
  salePrice: number;
  tax: number;
  titleFee: number;
  docFee: number;
  registrationFee: number;
  /** The inspection program replacement fee, its own line; only when charged. */
  inspectionFee?: number;
  /** The license plate fee, its own line; only when charged. */
  plateFee?: number;
  /** The fee lines together, which is what this lot quotes. */
  feeTotal: number;
  tradeInAllowance: number;
  /** Price, less the trade-in, plus tax and fees. */
  total: number;
  /**
   * Tax and all three fees.
   *
   * This is what "the registration" costs a buyer here, and it is the figure
   * quoted on the vehicle responsibility form: the state's tax, its title fee,
   * its registration fee and our documentary fee. Not the state's portion
   * alone, because the buyer handing the filing back to us pays all of it.
   */
  registrationCost: number;
  /** What is being handed over at the desk today. */
  paidToday: number;
  /** What is still owed, and therefore what goes on the title as a lien. */
  lien: number;
};

/**
 * The three fee lines from the config, the default for every caller that
 * does not pass a sale's own (`fee-schedule.ts`: each sale keeps a copy of
 * the fees it started with, and the server resolves it). The Texas limits are
 * never applied here: this module is arithmetic, and the doc fee cap is a
 * separate check when the owner saves the fees and again at filing.
 */
export const FEE_LINES = {
  titleFee: TEXAS_TITLE_FEE,
  docFee: DEFAULT_DOC_FEE,
  registrationFee: DEFAULT_REG_FEE,
} as const;

export const FEE_TOTAL = TEXAS_TITLE_FEE + DEFAULT_DOC_FEE + DEFAULT_REG_FEE;

/**
 * What the printed lien says it is for.
 *
 * It says the buyer owes the seller money and stops there. It does not say
 * registration, on purpose. A reason line naming one part of the deal invites
 * an argument about whether that part was really owed, and the lien secures
 * the balance either way. What it is made of is on the same page, in the
 * column above it.
 */
export const BALANCE_OWED_REASON =
  "Balance owed by the buyer to the seller under this bill of sale";

const cents = (amount: number) => Math.round(amount * 100) / 100;

/**
 * Split an out-the-door figure back into a car, a tax and the fees.
 *
 * The tax is taken as the remainder rather than recomputed from the
 * back-solved price, and that is not laziness. Round the price to cents and
 * then charge 6.25% of the rounded number and the three lines add up to a cent
 * either side of what the buyer was quoted. A bill of sale whose own column
 * does not sum to its own total is the kind of thing a customer notices and
 * nobody can explain at the desk. The remainder is exact by construction.
 */
export function splitOutTheDoor(
  outTheDoor: number,
  feeTotal: number = FEE_TOTAL,
  /**
   * The trade-in allowance, which comes off the tax base (Tax Code
   * §152.002(b)(5): total consideration does not include "the value of a
   * motor vehicle taken by a seller as all or a part of the consideration
   * for sale of another motor vehicle"). An out-the-door figure quoted on a
   * trade-in deal is the car, the tax on (car - trade-in) and the fees, so
   * the car is backed out of it with the trade-in inside the tax base:
   *
   *   car = (outTheDoor - fees + 6.25% x tradeIn) / 1.0625
   *
   * and the tax stays the remainder, so the three lines still sum to the
   * quoted figure to the cent and the tax is 6.25% of (car - trade-in) to
   * within a cent: the same tax the 130-U computes and remits. Zero (every
   * caller before trade-ins were honoured here) is the old split exactly.
   */
  tradeIn: number = 0,
): { salePrice: number; tax: number } {
  const beforeTax = cents(outTheDoor) - feeTotal;
  if (beforeTax <= 0) return { salePrice: 0, tax: 0 };
  const allowance = Math.max(0, Number(tradeIn) || 0);
  // A trade-in worth the whole car or more leaves nothing to tax.
  if (allowance >= beforeTax) return { salePrice: cents(beforeTax), tax: 0 };
  const salePrice = cents((beforeTax + TEXAS_TAX_RATE * allowance) / (1 + TEXAS_TAX_RATE));
  return { salePrice, tax: cents(beforeTax - salePrice) };
}

/**
 * What was handed over, or the whole total until somebody says otherwise.
 *
 * The fallback is the total, and it is the total on purpose. An unanswered
 * question must not manufacture a balance: a lien is a deliberate act this
 * dealership holds a title over, and it is not going to appear on a deal
 * because a screen went unvisited. The screen that asks prefills the box with
 * the likely figure instead, which is a different thing entirely, because a
 * prefill only becomes an answer when somebody moves past it.
 *
 * Clamped to the total, because paying more than the deal is worth is a typo
 * rather than an instruction, and a negative balance is not a thing.
 */
function handedOver(typed: string | undefined, total: number): number {
  // Stripped before it is measured, because a box mid-keystroke holds "$" and
  // a dealer typing from a receipt writes "$3,000.00". Emptiness is checked
  // after the strip and not before: `Number("")` is zero, so a box holding
  // nothing but a dollar sign would otherwise read as nothing paid and put the
  // whole deal on the title as a balance.
  const digits = (typed ?? "").replace(/[$,\s]/g, "");
  const parsed = digits === "" ? Number.NaN : Number(digits);
  const amount = Number.isFinite(parsed) ? parsed : total;
  return Math.min(total, Math.max(0, cents(amount)));
}

/**
 * A typed dollar figure, or null when the box has not been answered.
 *
 * Null and zero are different answers here and the difference is the whole
 * fix: an empty box means "fall back to the vehicle row", while a typed 0 is
 * somebody's answer and gets used as given.
 */
export function typedDollars(typed: string | undefined): number | null {
  const digits = (typed ?? "").replace(/[$,\s]/g, "");
  if (digits === "") return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.max(0, cents(parsed)) : null;
}

/**
 * The whole of the money on one deal.
 *
 * `advertised` is the price on the vehicle row and nothing else is read from
 * anywhere: the rate is the state's, the fees are this lot's, and the two
 * answers say what the price meant and what is being paid.
 */
export function saleMoney(
  advertised: number | null | undefined,
  money: Partial<MoneyAnswers> = {},
  tradeInAllowance = 0,
  /**
   * How the deal is funded, because the same arithmetic means three things.
   *
   * On cash, what the buyer has not paid is a balance the seller holds the
   * title over. On buy-here-pay-here it is the note: the amount financed,
   * secured by the seller's own lien, which is the whole product. On a bank
   * deal it is neither: the lender pays the lot and takes the lien, so the
   * buyer owes the seller nothing and printing a seller balance on that deal
   * was wrong on two documents at once. Null reads as cash, which is how
   * every deal computed before this parameter existed.
   */
  funding: DealType | null = null,
  /**
   * The sale's own fee lines (its copy, resolved on the server), or the
   * config's. Only which three figures are added changes; the arithmetic is
   * the same either way.
   */
  fees: DealFeeLines = FEE_LINES,
): SaleMoney {
  const lines: DealFeeLines = {
    titleFee: fees.titleFee,
    docFee: fees.docFee,
    registrationFee: fees.registrationFee,
  };
  /*
    The inspection program replacement fee and the plate fee, on lines of
    their own once the sale's government fees are confirmed from webDEALER
    (government-fees.ts). Untaxed like the other government lines. Carried
    only when charged, so a sale without them computes, and reports, exactly
    as before.
  */
  const inspectionFee = Math.max(0, Number(fees.inspectionFee) || 0);
  const plateFee = Math.max(0, Number(fees.plateFee) || 0);
  const governmentLines = {
    ...(inspectionFee > 0 ? { inspectionFee } : {}),
    ...(plateFee > 0 ? { plateFee } : {}),
  };
  const feeTotal = lines.titleFee + lines.docFee + lines.registrationFee + inspectionFee + plateFee;
  /**
   * The spoken figure outranks the vehicle row.
   *
   * The row's price is where the box starts, not where the deal ends: cars get
   * listed at $0, prices get negotiated on the kerb, and the dealer's typed
   * answer is the one two people actually agreed to.
   */
  const quoted = typedDollars(money.amount);
  const listed = quoted ?? Math.max(0, Number(advertised) || 0);
  const basis: PriceBasis = money.priceBasis === "outTheDoor" ? "outTheDoor" : "vehicleOnly";
  const allowance = Math.max(0, Number(tradeInAllowance) || 0);

  /*
    The tax is charged on the price LESS the trade-in, not on the price.

    That is Tax Code section 152.021 as the Comptroller applies it: a $42,000
    car with a $15,000 trade is taxed on $27,000. This code charged the full
    price and subtracted the trade afterwards, which overtaxed every trade-in
    deal by 6.25% of the allowance. Found by the research pass, verified
    against the Comptroller's own worked example, and fixed on the forward
    path. The out-the-door split honours it too: the car is backed out of
    the quoted figure with the trade-in inside the tax base, and the tax
    stays the remainder, so the lines still sum to the quoted figure to the
    cent and the tax is the one the 130-U remits (splitOutTheDoor). It used
    to tax the trade-in on these deals, charging the buyer 6.25% of the
    allowance as "tax" the state never received (fees review, 2026-10-03).
  */
  const { salePrice, tax } =
    basis === "outTheDoor"
      ? splitOutTheDoor(listed, feeTotal, allowance)
      : { salePrice: listed, tax: calcTexasTax(Math.max(0, listed - allowance)) };

  const registrationCost = cents(tax + feeTotal);
  const total = Math.max(0, cents(salePrice - allowance + registrationCost));

  /*
    What crossed the desk is worked out, not asked twice.

    The spoken figure is what a cash buyer hands over, so it is the default:
    on an out-the-door deal that figure is the total and nothing is owed, and
    on a car-alone deal it covers the car and leaves the tax and fees owing,
    which is exactly the balance the basis answer implies. The override exists
    for the sale that fits neither, and an unanswered deal still defaults to
    paid in full: a balance is a deliberate act with a title behind it, and it
    is not going to appear because a screen went unvisited.
  */
  const impliedPaid =
    funding === "lender" || funding === "inHouse"
      ? // On a bank deal nothing is implied to cross the desk: the lender's
        // check covers the deal. On buy here pay here nothing is implied
        // either, because the whole point is that the buyer is not paying it
        // all: the down payment is typed, and until it is, the note is the
        // full total rather than a deal quietly marked paid in full.
        0
      : quoted === null || money.priceBasis === ""
        ? total
        : basis === "outTheDoor"
          ? total
          : Math.min(total, Math.max(0, cents(salePrice - allowance)));
  const override = (money.paidTodayAmount ?? "").replace(/[$,\s]/g, "");
  const paidToday = override === "" ? impliedPaid : handedOver(money.paidTodayAmount, total);
  /*
    What is left is a seller's figure only when the seller is the one owed.
    On a lender deal the bank pays the lot and takes the lien, so the buyer's
    unpaid remainder is the bank's business and never a balance here.
  */
  const lien = funding === "lender" ? 0 : Math.max(0, cents(total - paidToday));

  return {
    basis,
    advertised: listed,
    salePrice,
    tax,
    ...lines,
    ...governmentLines,
    feeTotal,
    tradeInAllowance: allowance,
    total,
    registrationCost,
    paidToday,
    lien,
  };
}

export const MONEY_KEY = "money";

/** The two answers, off the deal. */
export function readMoney(stepData: unknown): MoneyAnswers {
  if (!stepData || typeof stepData !== "object") return { ...EMPTY_MONEY };
  const held = (stepData as Record<string, unknown>)[MONEY_KEY];
  if (!held || typeof held !== "object") return { ...EMPTY_MONEY };

  const bag = held as Record<string, unknown>;
  const basis = bag.priceBasis;
  const spoken = bag.amount;
  const paid = bag.paidTodayAmount;
  /*
    Deals written before the amount question existed hold only a paid figure,
    and it stays only a paid figure. It cannot stand in for the spoken amount:
    on a deal that paid the whole total, reading the total back as the car's
    price would recompute a bigger total and invent a balance on a sale that
    closed clean. Those deals keep anchoring on the vehicle row, which is the
    arithmetic they were closed under.
  */
  return {
    amount: typeof spoken === "string" ? spoken : "",
    paidTodayAmount: typeof paid === "string" ? paid : "",
    priceBasis: basis === "outTheDoor" || basis === "vehicleOnly" ? basis : "",
  };
}

/** Merge the answers in without disturbing the rest of `step_data`. */
export function writeMoney(stepData: unknown, money: MoneyAnswers): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object" ? { ...(stepData as Record<string, unknown>) } : {};
  base[MONEY_KEY] = { ...money };
  return base;
}

/**
 * Both money questions answered.
 *
 * Two, always. Neither has a default safe enough to assume: between them they
 * decide what this dealership will hold a title over. A deal from before the
 * amount question counts its paid figure as the answer, because on those deals
 * it was.
 */
export function isMoneySettled(money: MoneyAnswers): boolean {
  const amountAnswered =
    money.amount.trim() !== "" || money.paidTodayAmount.trim() !== "";
  return amountAnswered && money.priceBasis !== "";
}
