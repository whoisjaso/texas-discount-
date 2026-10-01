/**
 * A phone number types itself.
 *
 * We know how many digits a US number has, so the field should not accept an
 * eleventh and should not need the operator to type the punctuation. Nothing
 * here validates after the fact and complains: the box simply cannot hold a
 * wrong shape, which is a smaller thing to explain than an error message.
 *
 * Formatting happens as the value grows rather than on blur. A number that
 * rearranges itself the moment you look away reads as the field arguing with
 * you, and it hides a typo until after you have stopped looking at the card.
 */

/** A US number, without the country code. */
const NATIONAL_DIGITS = 10;

/** With a leading 1, which people type out of habit. */
const WITH_COUNTRY_CODE = 11;

/**
 * Keep only what a phone number is made of, and no more than fits.
 *
 * A leading 1 is dropped rather than counted, because somebody typing
 * 1 713 555 0101 means the same number as 713 555 0101 and should not be told
 * they have run out of room.
 */
export function phoneDigits(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === WITH_COUNTRY_CODE && digits.startsWith("1")) {
    return digits.slice(1);
  }
  if (digits.length > WITH_COUNTRY_CODE && digits.startsWith("1")) {
    return digits.slice(1, WITH_COUNTRY_CODE);
  }
  return digits.slice(0, NATIONAL_DIGITS);
}

/**
 * What to show in the box.
 *
 * Punctuation appears only once the digits it brackets exist, so the field is
 * never showing an empty pair of parentheses waiting to be filled. Typing four
 * digits gives "(713) 5", not "(713) ) -".
 */
export function formatPhone(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** A number is usable when it has all ten digits. */
export function isCompletePhone(value: string): boolean {
  return phoneDigits(value).length === NATIONAL_DIGITS;
}

/** How many digits are still missing, for a field that wants to say so. */
export function phoneDigitsRemaining(value: string): number {
  return Math.max(0, NATIONAL_DIGITS - phoneDigits(value).length);
}

/**
 * The storable form.
 *
 * One shape in the database, so looking a returning buyer up by phone actually
 * finds them whichever way the number was typed this time.
 */
export function phoneToE164(value: string): string | null {
  const digits = phoneDigits(value);
  return digits.length === NATIONAL_DIGITS ? `+1${digits}` : null;
}
