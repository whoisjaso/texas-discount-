import { calculatePayment } from "@/lib/documents/finance";

/**
 * The terms of a note: what was agreed, what follows from it, and the
 * ceiling the law puts over it.
 *
 * A dealer and a buyer agree on two of three things: the payment, how many
 * payments, or the rate. The third is arithmetic, and the corridor should do
 * the arithmetic rather than ask for a number the two of them never said.
 * "Four-twenty a month until it's paid" is a term sheet; this turns it into
 * a count, a rate, a payoff date and a finance charge, or says plainly why
 * it cannot.
 *
 * The ceiling is Texas Finance Code Chapter 348. A retail installment
 * contract may carry a time price differential up to the add-on rate for the
 * vehicle's class (§348.104: $7.50, $10, $12.50 or $15 per $100 per year,
 * by model year, with $18 when the balance is under $300 and a $25 minimum),
 * or, as an alternative, up to the Chapter 303 optional ceiling (§348.105),
 * whose floor is 18% a year (§303.009). Whichever is higher is the most the
 * note may carry. A solved rate above it is not a rate the contract can
 * print, so the solver caps it and says what the capped note comes to.
 *
 * One thing this cannot see and the dealer must: under Regulation Z a price
 * charged to a financed buyer above the cash price is itself a finance
 * charge. Marking a $10,000 car to $15,000 because it is financed puts the
 * $5,000 inside the APR, and inside this ceiling.
 *
 * Pure. No config, no database, no dates from the clock.
 */

export type Frequency = "Weekly" | "Bi-weekly" | "Monthly";

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  Weekly: 52,
  "Bi-weekly": 26,
  Monthly: 12,
};

/** Texas Finance Code §348.104: the vehicle's class by model year. */
export type VehicleClass = 1 | 2 | 3 | 4;

export function vehicleClass(saleYear: number, modelYear: number | null, isNew = false): VehicleClass {
  if (modelYear === null || !Number.isFinite(modelYear)) return 4;
  const age = saleYear - modelYear;
  if (isNew && age <= 0) return 1;
  if (age <= 2) return 2;
  if (age <= 4) return 3;
  return 4;
}

/** Add-on dollars per $100 per year, §348.104. */
export function addOnPer100(cls: VehicleClass, principal: number): number {
  switch (cls) {
    case 1:
      return 7.5;
    case 2:
      return 10;
    case 3:
      return 12.5;
    default:
      return principal <= 300 ? 18 : 15;
  }
}

/** §303.009: the optional ceiling is never below this. */
export const OPTIONAL_CEILING_APR = 18;

/** §348.104: the most time price differential the add-on method allows. */
export function maxFinanceCharge(principal: number, count: number, frequency: Frequency, cls: VehicleClass): number {
  if (principal <= 0 || count <= 0) return 0;
  const years = count / PERIODS_PER_YEAR[frequency];
  const addOn = principal * (addOnPer100(cls, principal) / 100) * years;
  return Math.max(addOn, 25);
}

/**
 * The rate that turns a principal into a given payment over a given count.
 * Bisection; monotone in the rate, so it converges. Zero when the payments
 * do not even return the principal.
 */
export function aprFor(principal: number, payment: number, count: number, frequency: Frequency): number {
  if (principal <= 0 || count <= 0 || payment <= 0) return 0;
  if (payment * count <= principal) return 0;
  let low = 0;
  let high = 400;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (calculatePayment(principal, mid, count, frequency) > payment) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

/**
 * How many payments of a given size clear a principal at a rate. Null when
 * the payment does not cover a period's interest, because then the balance
 * never falls and no count is honest.
 */
export function countFor(principal: number, apr: number, payment: number, frequency: Frequency): number | null {
  if (principal <= 0 || payment <= 0) return null;
  const r = apr / 100 / PERIODS_PER_YEAR[frequency];
  if (r === 0) return Math.ceil(principal / payment);
  if (payment <= principal * r) return null;
  const n = -Math.log(1 - (principal * r) / payment) / Math.log(1 + r);
  return Math.max(1, Math.ceil(n - 1e-9));
}

/**
 * What the last payment is when every payment before it was `payment`.
 *
 * The balance is carried period by period at the rate, so this is exact:
 * on a note of equal solved payments it is the same figure to the cent, and
 * on a note where the desk agreed the payment it is the remainder that
 * clears the balance, which is smaller than the rest.
 */
export function finalPayment(principal: number, apr: number, payment: number, count: number, frequency: Frequency): number {
  if (principal <= 0 || count <= 0) return 0;
  const r = apr / 100 / PERIODS_PER_YEAR[frequency];
  let balance = principal;
  for (let i = 1; i < count; i++) balance = balance * (1 + r) - payment;
  return Math.max(0, Math.round(balance * (1 + r) * 100) / 100);
}

/** The highest rate the note may carry, by either ceiling, whichever is higher. */
export function maxApr(principal: number, count: number, frequency: Frequency, cls: VehicleClass): number {
  if (principal <= 0 || count <= 0) return OPTIONAL_CEILING_APR;
  const charge = maxFinanceCharge(principal, count, frequency, cls);
  const payment = (principal + charge) / count;
  return Math.max(aprFor(principal, payment, count, frequency), OPTIONAL_CEILING_APR);
}

export type TermsInput = {
  principal: number;
  frequency: Frequency;
  vehicleClass: VehicleClass;
  /** The rate to use when only one of payment or count was agreed. */
  defaultApr: number;
  apr?: number | null;
  payment?: number | null;
  count?: number | null;
};

export type Terms = {
  apr: number;
  /** Every payment but the last. The agreed figure when the payment was what was agreed. */
  payment: number;
  /** The last payment: the remainder that clears the balance. */
  lastPayment: number;
  count: number;
  totalOfPayments: number;
  financeCharge: number;
  /** The most this note may carry. */
  ceilingApr: number;
  /** True when the agreed figures implied a rate above the ceiling and the rate was brought down to it. */
  capped: boolean;
  /**
   * When capped and the payment was the agreed figure: the count that keeps
   * the payment at the ceiling instead of keeping the count. The desk picks.
   */
  alternative: { payment: number; count: number } | null;
};

export type TermsProblem =
  | { problem: "nothing_agreed" }
  | { problem: "no_principal" }
  | { problem: "payment_never_clears"; minimumPayment: number };

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * From what was agreed to the whole note.
 *
 * Both payment and count: the rate is solved. Payment alone: the count is
 * solved at the default rate. Count alone: the payment is solved at the
 * default rate. Either way the rate is then held to the ceiling, and if it
 * had to be brought down, the payment is recomputed at the ceiling for the
 * agreed count, with the other way round offered as the alternative.
 */
export function solveTerms(input: TermsInput): Terms | TermsProblem {
  const principal = cents(input.principal);
  if (principal <= 0) return { problem: "no_principal" };
  const { frequency } = input;
  const agreedPayment = input.payment && input.payment > 0 ? cents(input.payment) : null;
  const agreedCount = input.count && input.count > 0 ? Math.round(input.count) : null;
  const givenApr = input.apr != null && input.apr >= 0 ? input.apr : null;

  let apr: number;
  let count: number;
  let payment: number;
  /*
    Whether the payment figure is the desk's word or the solver's.

    When the desk agreed the payment, the note keeps it: every payment is
    that figure and the last one is whatever remains, which is smaller.
    "Four-twenty a month" printed as thirteen payments of $401.70 is a
    contract that says something nobody said. When the count or the rate
    is what was agreed, the payments are the equal ones that clear it.
  */
  let keepAgreedPayment = false;

  if (agreedPayment && agreedCount) {
    apr = aprFor(principal, agreedPayment, agreedCount, frequency);
    count = agreedCount;
    payment = agreedPayment;
  } else if (agreedPayment) {
    apr = givenApr ?? input.defaultApr;
    const solved = countFor(principal, apr, agreedPayment, frequency);
    if (solved === null) {
      const r = apr / 100 / PERIODS_PER_YEAR[frequency];
      return { problem: "payment_never_clears", minimumPayment: cents(principal * r + 1) };
    }
    count = solved;
    payment = agreedPayment;
    keepAgreedPayment = true;
  } else if (agreedCount) {
    apr = givenApr ?? input.defaultApr;
    count = agreedCount;
    payment = cents(calculatePayment(principal, apr, count, frequency));
  } else {
    return { problem: "nothing_agreed" };
  }

  const ceilingApr = maxApr(principal, count, frequency, input.vehicleClass);
  let capped = false;
  let alternative: Terms["alternative"] = null;
  if (apr > ceilingApr + 1e-9) {
    capped = true;
    apr = ceilingApr;
    const altCount = agreedPayment ? countFor(principal, apr, agreedPayment, frequency) : null;
    if (altCount !== null) alternative = { payment: agreedPayment as number, count: altCount };
    keepAgreedPayment = false;
    payment = cents(calculatePayment(principal, apr, count, frequency));
  }

  // The rate the contract prints is two decimals, and the payments on the
  // contract are what that printed rate produces, so the two never disagree.
  apr = Math.round(apr * 100) / 100;
  if (!keepAgreedPayment) payment = cents(calculatePayment(principal, apr, count, frequency));
  const lastPayment = finalPayment(principal, apr, payment, count, frequency);
  const totalOfPayments = cents(payment * (count - 1) + lastPayment);
  return {
    apr,
    payment,
    lastPayment,
    count,
    totalOfPayments,
    financeCharge: cents(totalOfPayments - principal),
    ceilingApr: Math.round(ceilingApr * 100) / 100,
    capped,
    alternative,
  };
}

export function isProblem(result: Terms | TermsProblem): result is TermsProblem {
  return "problem" in result;
}

/** ISO date of the last payment, from the first due date and the cadence. */
export function paidOffOn(firstDue: string, count: number, frequency: Frequency): string | null {
  const m = firstDue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || count <= 0) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const steps = count - 1;
  const last =
    frequency === "Monthly"
      ? new Date(Date.UTC(y, mo - 1 + steps, d))
      : new Date(Date.UTC(y, mo - 1, d + steps * (frequency === "Weekly" ? 7 : 14)));
  return last.toISOString().slice(0, 10);
}
