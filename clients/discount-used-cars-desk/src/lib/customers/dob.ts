// Date-of-birth validation for write-back from signed documents to
// customers.date_of_birth (powers birthday/occasion messaging).
//
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Validate a date-of-birth value and return it as "yyyy-MM-dd", or null if
 * the value is missing, malformed, an impossible calendar date, or outside
 * the plausible 1900..today range.
 */
export function parseDateOfBirth(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;

  const [iso, year, month, day] = match;
  const date = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  if (Number(year) < 1900 || date.getTime() > Date.now()) return null;
  return iso;
}

// Stricter driver/customer DOB validation for rental portal and signed
// document write-back paths.
export function parseValidDateOfBirth(raw: unknown): string | null {
  const iso = parseDateOfBirth(raw);
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  const currentYear = new Date().getFullYear();
  if (year > currentYear - 15) return null;
  return iso;
}
