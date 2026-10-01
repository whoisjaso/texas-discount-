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
