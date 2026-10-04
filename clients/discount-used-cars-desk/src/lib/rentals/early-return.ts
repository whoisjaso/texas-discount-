export const EARLY_RETURN_POLICY_REVISION = "04/2026";

export type RentalBillingPeriod = "Daily" | "Weekly" | "Monthly";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculateDailyRentalRate(
  rentalRate: number | null | undefined,
  rentalPeriod: RentalBillingPeriod | string | null | undefined = "Weekly",
): number {
  const rate = Number(rentalRate) || 0;
  if (rate <= 0) return 0;

  if (rentalPeriod === "Daily") return roundMoney(rate);
  if (rentalPeriod === "Monthly") return roundMoney(rate / 30);
  return roundMoney(rate / 7);
}

export function calculateRemainingRentalDays(
  paidThroughDate: string | null | undefined,
  returnDate: string | null | undefined,
): number {
  const paidThrough = parseIsoDateToUtc(paidThroughDate);
  const returned = parseIsoDateToUtc(returnDate);
  if (!paidThrough || !returned) return 0;

  return Math.max(0, Math.ceil((paidThrough.getTime() - returned.getTime()) / MS_PER_DAY));
}

export function calculateEarlyReturnBalance(input: {
  rentalRate: number | null | undefined;
  rentalPeriod?: RentalBillingPeriod | string | null;
  paidThroughDate?: string | null;
  returnDate?: string | null;
}): {
  dailyRate: number;
  daysRemaining: number;
  amountDue: number;
} {
  const dailyRate = calculateDailyRentalRate(input.rentalRate, input.rentalPeriod ?? "Weekly");
  const daysRemaining = calculateRemainingRentalDays(input.paidThroughDate, input.returnDate);

  return {
    dailyRate,
    daysRemaining,
    amountDue: roundMoney(dailyRate * daysRemaining),
  };
}

export function formatEarlyReturnFormula(dailyRate: number, daysRemaining: number): string {
  if (daysRemaining <= 0) return "$0.00";
  return `$${dailyRate.toFixed(2)} x ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
}

function parseIsoDateToUtc(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
