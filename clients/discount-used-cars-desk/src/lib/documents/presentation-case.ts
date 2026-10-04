/**
 * How a value is cased on paper, whatever was typed.
 *
 * The owner's standard, from reading a filled 130-U whose body style said
 * "pickup": the VIN is always capitals, and every other field starts each
 * word with a capital. It is a rule about the paper, not about the desk, so
 * it lives in one place the documents read through rather than in the
 * screens that collect the values. A value typed in capitals, lowercase or
 * off a decoder that shouts prints the same way.
 *
 * A value somebody typed in mixed case is left alone. "DeShawn", "McDonald"
 * and "iPhone" are deliberate, and a rule that flattened them would be
 * wrong more often than the typist. Only a value that is all one case, which
 * is a value nobody cased on purpose, is recased.
 */

import { toTitleCaseDisplay } from "@/lib/display/title-case";

/** Every letter the same case: nobody chose it, so the paper chooses. */
function isOneCase(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return false;
  return letters === letters.toUpperCase() || letters === letters.toLowerCase();
}

/**
 * Title case for a name, a street, a colour, a make, a model, a body style.
 *
 * Empty in, empty out. A mixed-case value is returned as typed.
 */
export function fieldCase(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return isOneCase(text) ? toTitleCaseDisplay(text) : text;
}

/** A VIN, a plate, a state code: capitals, always. */
export function codeCase(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** A VIN with the spaces and dashes a person adds removed, in capitals. */
export function vinCase(value: string | null | undefined): string {
  return codeCase(value).replace(/[^A-Z0-9]/g, "");
}
