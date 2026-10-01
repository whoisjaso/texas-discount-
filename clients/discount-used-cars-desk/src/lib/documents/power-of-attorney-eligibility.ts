/** Existing VTR-271 eligibility rule shared by the guided form and PDF endpoint. */
export const ODOMETER_DISCLOSURE_EXEMPT_AGE_YEARS = 20;

export function isEligibleForPlainPoa(modelYear: number | null | undefined, currentYear: number): boolean | null {
  if (!modelYear || !Number.isFinite(modelYear)) return null;
  return currentYear - modelYear >= ODOMETER_DISCLOSURE_EXEMPT_AGE_YEARS;
}
