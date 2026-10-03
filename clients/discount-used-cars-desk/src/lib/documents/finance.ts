export interface ContractData {
  /**
   * The day the contract is executed, and the stock number of the car it is
   * written against. Every other document in the packet identified its own
   * copy; the contract, which is the legally operative one, did not. A signed
   * retail installment contract with no date on its face cannot be filed
   * against a payment schedule.
   */
  contractDate: string;
  stockNumber: string;
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  buyerEmail: string;
  coBuyerName: string;
  coBuyerAddress: string;
  coBuyerPhone: string;
  coBuyerEmail: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVin: string;
  vehiclePlate: string;
  vehicleMileage: string;
  cashPrice: number;
  downPayment: number;
  tax: number;
  titleFee: number;
  registrationFee: number;
  /** The inspection program replacement fee and the plate fee, own lines; absent on copies without them. */
  inspectionFee?: number;
  plateFee?: number;
  docFee: number;
  apr: number;
  numberOfPayments: number;
  paymentFrequency: 'Weekly' | 'Bi-weekly' | 'Monthly';
  firstPaymentDate: string;
  dueAtSigning: number;
  /**
   * The payment as agreed at the desk, when it was the payment that was
   * agreed. Absent, every payment is the equal one the rate and count
   * produce. Present, every payment is this and the last is the remainder.
   */
  paymentAmount?: number;
  /** The last payment, when it differs from the rest. */
  lastPaymentAmount?: number;
  /**
   * The trade-in the bill of sale took, which is part of the down payment on
   * the note. Absent on contracts filed before it was carried, which compute
   * exactly as they did (SOP "Money": one set of figures per sale, so the
   * amount financed equals the bill of sale's balance).
   */
  tradeInAllowance?: number;
  /** The documentary fee notice's version, stamped at filing; clause 16 prints it exactly. */
  docFeeNotice?: number;
  /** The approved Spanish notice beside the English one (a Spanish sale). */
  docFeeNoticeSpanish?: boolean;
}

/**
 * The contract's money, worked out once for the sheet and its tests.
 *
 * Total cash price is the car, the tax and the fees; the total down payment
 * is the cash put down plus the trade-in; the amount financed is what is left
 * (SOP "Money": total = salePrice - tradeIn + registrationCost, balance =
 * total - paidToday).
 */
export function contractFigures(data: ContractData) {
  const totalCashPrice =
    data.cashPrice + data.tax + data.titleFee + data.registrationFee + (data.inspectionFee ?? 0) + (data.plateFee ?? 0) + data.docFee;
  const tradeIn = Math.max(0, Number(data.tradeInAllowance) || 0);
  const cashDown = data.downPayment;
  const totalDown = cashDown + tradeIn;
  const amountFinanced = Math.max(0, totalCashPrice - totalDown);
  // The payment as agreed when the desk agreed the payment; otherwise the
  // equal one the rate and count produce. The last payment is the remainder.
  const payment =
    data.paymentAmount && data.paymentAmount > 0
      ? data.paymentAmount
      : calculatePayment(amountFinanced, data.apr, data.numberOfPayments, data.paymentFrequency);
  const lastPayment = data.lastPaymentAmount && data.lastPaymentAmount > 0 ? data.lastPaymentAmount : payment;
  const totalOfPayments = data.numberOfPayments > 0 ? payment * (data.numberOfPayments - 1) + lastPayment : 0;
  const financeCharge = totalOfPayments - amountFinanced;
  return { totalCashPrice, tradeIn, cashDown, totalDown, amountFinanced, payment, lastPayment, totalOfPayments, financeCharge };
}

export function calculatePayment(
  principal: number,
  apr: number,
  numberOfPayments: number,
  frequency: 'Weekly' | 'Bi-weekly' | 'Monthly'
): number {
  if (principal <= 0 || numberOfPayments <= 0) return 0;
  let periodsPerYear = 12;
  if (frequency === 'Weekly') periodsPerYear = 52;
  if (frequency === 'Bi-weekly') periodsPerYear = 26;
  const ratePerPeriod = apr / 100 / periodsPerYear;
  if (ratePerPeriod === 0) return principal / numberOfPayments;
  return (principal * ratePerPeriod * Math.pow(1 + ratePerPeriod, numberOfPayments)) /
    (Math.pow(1 + ratePerPeriod, numberOfPayments) - 1);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
