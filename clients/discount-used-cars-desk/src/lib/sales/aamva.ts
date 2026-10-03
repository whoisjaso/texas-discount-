/**
 * Reading a US driver's licence from the barcode on its back.
 *
 * Every US and Canadian licence carries a PDF417 barcode encoding the holder's
 * details to the AAMVA standard. This matters more than it sounds: it is the
 * difference between a machine *guessing* at a licence number from a photograph
 * of the front and a machine *reading* the number the issuing authority wrote.
 * OCR misreads 0 for O and 1 for I on a card that has been through a wash cycle.
 * The barcode does not.
 *
 * So the front of the card is photographed for the file, and the back is read
 * for the values. Nothing here is a candidate that a person has to squint at
 * and compare; it is what the DMV encoded.
 *
 * The parse is deliberately forgiving. Licences in the wild carry truncated
 * names, literal "NONE" in unused fields, postal codes padded to nine digits,
 * and two mutually incompatible date orders depending on the issuing country
 * and the standard revision. Every one of those is handled here rather than
 * being allowed to reach a title application.
 */

/** AAMVA element identifiers, only the ones a sale actually needs. */
const ELEMENT = {
  familyName: "DCS",
  firstName: "DAC",
  middleName: "DAD",
  dateOfBirth: "DBB",
  expires: "DBA",
  licenseNumber: "DAQ",
  street: "DAG",
  street2: "DAH",
  city: "DAI",
  state: "DAJ",
  postal: "DAK",
  country: "DCG",
} as const;

/**
 * An address as the issuing authority encoded it, in pieces.
 *
 * The pieces are the point. A licence carries DAG, DAI, DAJ and DAK as four
 * separate elements, and flattening them into one line throws away structure
 * that was handed to us for free. Everything downstream wants it back: a
 * title application has four boxes, and so does the form a person fills in
 * at the desk.
 */
export type AamvaAddress = {
  street: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  /**
   * The county, which no licence barcode carries and a person types.
   *
   * It lives here rather than beside the address because the 130-U asks for
   * it in box 19 and webDEALER asks for it separately, so it travels with the
   * address it belongs to. A card scan leaves it null; intake fills it.
   */
  county: string | null;
};

export type AamvaFields = {
  name: string | null;
  licenseNumber: string | null;
  dateOfBirth: string | null;
  expires: string | null;
  /** The pieces, joined, for anywhere that genuinely wants one line of text. */
  address: string | null;
  /** The pieces, which is what the card actually said. */
  addressParts: AamvaAddress;
};

export const EMPTY_ADDRESS: AamvaAddress = {
  street: null,
  city: null,
  state: null,
  postal: null,
  county: null,
};

/** One line, for a label or a search box. Never for a form with four fields. */
export function joinAddress(parts: AamvaAddress): string | null {
  const locality = [parts.city, [parts.state, parts.postal].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const line = [parts.street, locality].filter(Boolean).join(", ");
  return line.length > 0 ? line : null;
}

/**
 * Values a licence uses to mean "this field is empty". Treated as absent, so a
 * middle-name field reading NONE does not put the word NONE on a bill of sale.
 */
const EMPTY_MARKERS = new Set(["", "NONE", "N/A", "UNAVL", "UNAVAIL", "NOT APPLICABLE"]);

function clean(value: string | undefined): string | null {
  if (value === undefined) return null;
  // Licences pad fields to fixed widths, and some issuers use commas as filler.
  const trimmed = value.replace(/[\s,]+$/, "").trim();
  if (EMPTY_MARKERS.has(trimmed.toUpperCase())) return null;
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Splits the raw barcode into its element map.
 *
 * The payload is a compliance header, then subfile designators, then the data
 * elements themselves as three-letter codes each followed by a value and a
 * line separator. Records are separated by LF in practice, though CR and the
 * ASCII record separator both appear on real cards, so all three are accepted.
 */
export function parseElements(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw) return out;

  // Some decoders hand back non-graphical characters as angle-bracket escapes
  // rather than as bytes, so a record separator arrives as the literal text
  // "<LF>". The reader used here is configured not to, but this parser is the
  // thing that decides whether a licence is readable, and it should not depend
  // on one caller's options being right. Normalised before splitting.
  const normalised = raw.replace(/<(LF|CR|RS|GS|US)>/g, "\n");

  for (const line of normalised.split(/[\r\n\x1e]+/)) {
    // A data element is a three-letter code followed by its value. Anything
    // shorter is a header fragment or a subfile designator, not data.
    const match = /^([A-Z]{3})(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, code, value] = match;
    // First occurrence wins. A malformed card that repeats an element should
    // not have its later, likelier-truncated copy overwrite the good one.
    if (!out.has(code)) out.set(code, value);
  }
  return out;
}

/**
 * AAMVA dates, which come in two orders that cannot be told apart by length.
 *
 * The 2000 standard used CCYYMMDD. Later revisions switched US cards to
 * MMDDCCYY and left Canadian cards on CCYYMMDD. The country element usually
 * says which, but it is not always present, so the digits are checked for
 * self-consistency too: a leading pair above 12 cannot be a month, and a
 * leading pair that looks like a century is read as a year.
 */
export function parseDate(raw: string | null, country: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const asMonthFirst = () => ({
    month: digits.slice(0, 2),
    day: digits.slice(2, 4),
    year: digits.slice(4, 8),
  });
  const asYearFirst = () => ({
    year: digits.slice(0, 4),
    month: digits.slice(4, 6),
    day: digits.slice(6, 8),
  });

  const leading = Number(digits.slice(0, 2));
  // 19xx or 20xx in front can only be a year, whatever the country claims.
  const looksYearFirst = leading === 19 || leading === 20;
  const canBeMonthFirst = leading >= 1 && leading <= 12;

  let parts: { year: string; month: string; day: string };
  if (looksYearFirst && !canBeMonthFirst) parts = asYearFirst();
  else if (!canBeMonthFirst) parts = asYearFirst();
  else if (country && country.toUpperCase() !== "USA") parts = asYearFirst();
  else parts = asMonthFirst();

  const month = Number(parts.month);
  const day = Number(parts.day);
  const year = Number(parts.year);
  // A date that cannot exist is not reported as a date. Better an empty field
  // a person fills in than a plausible wrong one they skim past.
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  return `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
}

/** Nine-digit ZIPs are stored padded; the trailing block is dropped when unused. */
export function formatPostal(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) {
    const plus4 = digits.slice(5);
    return plus4 === "0000" ? digits.slice(0, 5) : `${digits.slice(0, 5)}-${plus4}`;
  }
  if (digits.length === 5) return digits;
  return raw.trim() || null;
}

/**
 * Title case for names and streets, which licences store in block capitals.
 *
 * Kept deliberately simple. Particles and hyphenated names are handled, but
 * this does not try to be clever about McDonald or O'Brien: the value is shown
 * to a person who can correct it, and a wrong-looking capital is a far smaller
 * problem than a name silently mangled by a rule nobody can see.
 */
export function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/(^|[\s'\-/.])([a-z])/g, (_, boundary: string, letter: string) =>
      boundary + letter.toUpperCase(),
    );
}

/** Reads the fields a sale needs out of a decoded barcode payload. */
export function readAamva(raw: string): AamvaFields {
  const el = parseElements(raw);
  const get = (code: string) => clean(el.get(code));
  const country = get(ELEMENT.country);

  const name = [
    titleCase(get(ELEMENT.firstName)),
    titleCase(get(ELEMENT.middleName)),
    titleCase(get(ELEMENT.familyName)),
  ]
    .filter(Boolean)
    .join(" ");

  const street = [titleCase(get(ELEMENT.street)), titleCase(get(ELEMENT.street2))]
    .filter(Boolean)
    .join(", ");

  const addressParts: AamvaAddress = {
    street: street.length > 0 ? street : null,
    city: titleCase(get(ELEMENT.city)),
    state: get(ELEMENT.state)?.toUpperCase() ?? null,
    postal: formatPostal(get(ELEMENT.postal)),
    // No AAMVA element carries the county, so a scan never supplies it.
    county: null,
  };

  return {
    name: name.length > 0 ? name : null,
    // Licence numbers are never title-cased: the case is significant.
    licenseNumber: get(ELEMENT.licenseNumber),
    dateOfBirth: parseDate(get(ELEMENT.dateOfBirth), country),
    expires: parseDate(get(ELEMENT.expires), country),
    address: joinAddress(addressParts),
    addressParts,
  };
}

/**
 * Recover the pieces from a line that was once four fields.
 *
 * Needed for two cases, both real. A deal saved before this code existed holds
 * only the joined line, and the reader that looks at the front of the card
 * produces prose rather than elements. Neither is a reason to hand somebody a
 * single box holding a street, a city, a state and a postal code.
 *
 * Deliberately conservative: the last comma-separated chunk is read as state
 * and postal code only when it actually looks like one, and anything this
 * cannot make sense of stays in the street line where a person will see it and
 * fix it. A wrong guess in four boxes is worse than an honest one in one.
 */
const STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  // Territories and the military post codes, all of which appear on real cards.
  "AS", "GU", "MP", "PR", "VI", "AA", "AE", "AP",
]);

export function splitAddress(line: string | null): AamvaAddress {
  if (!line) return EMPTY_ADDRESS;
  const parts: AamvaAddress = { ...EMPTY_ADDRESS };

  let rest = line.trim();
  if (rest.length === 0) return EMPTY_ADDRESS;

  // Peeled off the end rather than found by position, because the separator
  // is not reliable. "Houston, TX 77042" and "Houston TX 77042" are the same
  // address, and the second is what a reader looking at printed lines
  // produces, since a card does not print commas.
  const postal = /[\s,]+(\d{5}(?:-\d{4})?)$/.exec(rest);
  if (postal) {
    parts.postal = postal[1];
    rest = rest.slice(0, postal.index).trim();
  }

  // Checked against the real list rather than "any two letters", so a city
  // whose name ends in a short word does not lose it to the state box.
  const state = /[\s,]+([A-Za-z]{2})$/.exec(rest);
  if (state && STATES.has(state[1].toUpperCase())) {
    parts.state = state[1].toUpperCase();
    rest = rest.slice(0, state.index).trim();
  }

  const chunks = rest.replace(/,+$/, "").split(",").map((chunk) => chunk.trim()).filter(Boolean);
  // A single chunk with nothing peeled off it is a street, not a city. Guessing
  // otherwise would empty the street box on every address this cannot read.
  if (chunks.length > 1) parts.city = chunks.pop() ?? null;
  else if (chunks.length === 1 && (parts.state || parts.postal)) parts.city = null;

  parts.street = chunks.join(", ") || null;
  return parts;
}

/**
 * Whether a decoded payload is actually a licence.
 *
 * A camera pointed at a shipping label will happily decode a PDF417 that is not
 * an ID at all, and filling a sale from one would be worse than reading nothing.
 */
export function looksLikeLicence(raw: string): boolean {
  if (!raw) return false;
  if (!raw.includes("ANSI ") && !raw.includes("AAMVA")) return false;
  const el = parseElements(raw);
  // A licence without a licence number is not usable here whatever else it has.
  return clean(el.get(ELEMENT.licenseNumber)) !== null;
}
