/**
 * What kind of identification this is, asked before the number.
 *
 * A single "ID Number" box cannot check anything, because the thing that makes
 * a number right or wrong is what kind of document it came off. A Texas licence
 * is eight digits. A US passport is nine characters. A Mexican passport is a
 * letter and eight digits. Asking the type first, and the issuer second, is
 * two extra taps that turn an unvalidatable free text field into one that can
 * catch a transposed digit at the desk rather than at the county window.
 *
 * The type is also worth recording for its own sake: the 130-U asks which form
 * of photo identification was presented, and it is a different tick box for a
 * licence, a passport and a military ID, with an "issued by" line for the
 * passport.
 *
 * ## What this deliberately does not do
 *
 * It does not reject a number it merely does not recognise. Every state issues
 * new formats, reissues old ones, and grandfathers numbers that no longer match
 * their own published rule. So a mismatch is a warning the operator can
 * override by carrying on, never a block. The failure of being too strict here
 * is a real customer standing at a desk unable to buy a car.
 */

export type IdDocumentKind = "stateLicence" | "stateIdCard" | "passport" | "militaryId" | "other";

export interface IdDocumentType {
  kind: IdDocumentKind;
  label: string;
  /** True when the document belongs to a state and the state must be asked. */
  needsState: boolean;
  /** True when the document belongs to a country and the country must be asked. */
  needsCountry: boolean;
  /** What to tell somebody who has not typed anything yet. */
  placeholder: string;
}

/**
 * Ordered by how often a lot in Texas actually sees them.
 *
 * A dropdown sorted alphabetically makes the common case as slow as the rare
 * one, and here the common case is overwhelmingly a driver licence.
 */
export const ID_DOCUMENT_TYPES: IdDocumentType[] = [
  {
    kind: "stateLicence",
    label: "Driver Licence",
    needsState: true,
    needsCountry: false,
    placeholder: "8 digits in Texas",
  },
  {
    kind: "stateIdCard",
    label: "State ID Card",
    needsState: true,
    needsCountry: false,
    placeholder: "Number on the card",
  },
  {
    kind: "passport",
    label: "Passport",
    needsState: false,
    needsCountry: true,
    placeholder: "Number on the photo page",
  },
  {
    kind: "militaryId",
    label: "Military ID",
    needsState: false,
    needsCountry: false,
    placeholder: "Number on the card",
  },
  {
    kind: "other",
    label: "Other",
    needsState: false,
    needsCountry: false,
    placeholder: "Number on the document",
  },
];

export function idDocumentType(kind: IdDocumentKind): IdDocumentType {
  return ID_DOCUMENT_TYPES.find((entry) => entry.kind === kind) ?? ID_DOCUMENT_TYPES[4];
}

/**
 * What a licence number is allowed to look like, per state.
 *
 * A state can accept more than one shape, because most of them have issued
 * more than one over the years. A number that matches any listed shape is
 * fine and gets no comment.
 *
 * kind "digits" means every character is a digit. "alpha+digits" means
 * letters and digits in any mix, which deliberately also accepts an all
 * digit number of the right length, because being loose here is safe and
 * being strict here stops a real customer. "any" accepts every character
 * the normalizer lets through.
 */
export type LicenceShapeKind = "digits" | "alpha+digits" | "any";

export interface LicenceShape {
  min: number;
  max: number;
  kind: LicenceShapeKind;
}

/**
 * Every state and DC, with the shapes the cards actually carry.
 *
 * Audited against the published state formats (the same table the
 * validators used by insurers and DMV vendors carry), one state at a time,
 * with every format a state has issued and still honours listed rather than
 * only the current one. Where the audit found the earlier table too narrow
 * (Illinois and Kentucky's newer lengths, New York's older shapes, Virginia's
 * longer numbers, Nevada's twelve digit cards, the letter-led numbers in
 * Colorado, Indiana and Ohio) the shape was widened, never narrowed: a card
 * that is real and refused is the one failure this table must not produce.
 *
 * These are checked as warnings only. States reissue formats, grandfather
 * old numbers, and print things their own published rule does not admit to,
 * so nothing here ever blocks. A code missing from this table falls through
 * to "we do not know", which stays an honest answer.
 */
export const STATE_LICENCE_SHAPES: Record<string, LicenceShape[]> = {
  // 7 or 8 digits.
  AL: [{ min: 7, max: 8, kind: "digits" }],
  // 1 to 7 digits.
  AK: [{ min: 1, max: 7, kind: "digits" }],
  // 1 letter then 8 digits, 9 digits, or (older) 2 letters then 3 to 6 digits.
  AZ: [
    { min: 9, max: 9, kind: "alpha+digits" },
    { min: 5, max: 8, kind: "alpha+digits" },
  ],
  // 4 to 9 digits.
  AR: [{ min: 4, max: 9, kind: "digits" }],
  // 1 letter then 7 digits.
  CA: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 9 digits, 1 letter then 3 to 6 digits, or 2 letters then 2 to 5 digits.
  CO: [
    { min: 9, max: 9, kind: "digits" },
    { min: 4, max: 7, kind: "alpha+digits" },
  ],
  // 9 digits.
  CT: [{ min: 9, max: 9, kind: "digits" }],
  // 1 to 7 digits.
  DE: [{ min: 1, max: 7, kind: "digits" }],
  // 7 digits, or 9 digits.
  DC: [
    { min: 7, max: 7, kind: "digits" },
    { min: 9, max: 9, kind: "digits" },
  ],
  // 1 letter then 12 digits.
  FL: [{ min: 13, max: 13, kind: "alpha+digits" }],
  // 7 to 9 digits.
  GA: [{ min: 7, max: 9, kind: "digits" }],
  // 1 letter then 8 digits, or 9 digits.
  HI: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 2 letters, 6 digits, 1 letter, or 9 digits.
  ID: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 11 or 12 digits.
  IL: [{ min: 12, max: 13, kind: "alpha+digits" }],
  // 10 digits, 9 digits, or 1 letter then 9 digits.
  IN: [
    { min: 9, max: 10, kind: "digits" },
    { min: 10, max: 10, kind: "alpha+digits" },
  ],
  // 9 digits, or 3 digits, 2 letters, 4 digits.
  IA: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 8 digits, 9 digits, or the older alternating 5 characters.
  KS: [
    { min: 9, max: 9, kind: "alpha+digits" },
    { min: 5, max: 5, kind: "alpha+digits" },
  ],
  // 1 letter then 8 or 9 digits, or 9 digits.
  KY: [{ min: 9, max: 10, kind: "alpha+digits" }],
  // 1 to 9 digits; current cards are 9 starting with two zeros.
  LA: [{ min: 1, max: 9, kind: "digits" }],
  // 7 digits, 8 digits, or 7 digits then 1 letter.
  ME: [{ min: 7, max: 8, kind: "alpha+digits" }],
  // 1 letter then 12 digits.
  MD: [{ min: 13, max: 13, kind: "alpha+digits" }],
  // 1 letter then 8 digits, or 9 digits.
  MA: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 10 digits, or 1 letter then 12 digits.
  MI: [
    { min: 11, max: 11, kind: "alpha+digits" },
    { min: 13, max: 13, kind: "alpha+digits" },
  ],
  // 1 letter then 12 digits.
  MN: [{ min: 13, max: 13, kind: "alpha+digits" }],
  // 9 digits.
  MS: [{ min: 9, max: 9, kind: "digits" }],
  // 1 letter then 5 to 9 digits, 9 digits, 8 digits then 2 letters, 9 digits then 1 letter.
  MO: [{ min: 6, max: 10, kind: "alpha+digits" }],
  // 1 letter then 8 digits, 9 digits, 13 digits, or 14 digits.
  MT: [
    { min: 9, max: 9, kind: "alpha+digits" },
    { min: 13, max: 14, kind: "digits" },
  ],
  // 1 letter then 6 to 8 digits.
  NE: [{ min: 7, max: 9, kind: "alpha+digits" }],
  // 9 or 10 digits, 12 digits, or X then 8 digits.
  NV: [
    { min: 9, max: 10, kind: "digits" },
    { min: 12, max: 12, kind: "digits" },
    { min: 9, max: 9, kind: "alpha+digits" },
  ],
  // 2 digits, 3 letters, 5 digits; or the newer 3 letters then 8 digits.
  NH: [{ min: 10, max: 11, kind: "alpha+digits" }],
  // 1 letter then 14 digits.
  NJ: [{ min: 15, max: 15, kind: "alpha+digits" }],
  // 8 or 9 digits.
  NM: [{ min: 8, max: 9, kind: "digits" }],
  // 9 digits (current), 8 digits, 16 digits, 1 letter then 7 digits,
  // 1 letter then 18 digits, or 8 letters.
  NY: [
    { min: 8, max: 9, kind: "digits" },
    { min: 16, max: 16, kind: "digits" },
    { min: 8, max: 8, kind: "alpha+digits" },
    { min: 19, max: 19, kind: "alpha+digits" },
  ],
  // 1 to 12 digits.
  NC: [{ min: 1, max: 12, kind: "digits" }],
  // 9 digits, or 3 letters then 6 digits.
  ND: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 2 letters then 6 digits, 1 letter then 4 to 8 digits, or 8 digits.
  OH: [
    { min: 5, max: 9, kind: "alpha+digits" },
    { min: 8, max: 8, kind: "digits" },
  ],
  // 9 digits, or 1 letter then 9 digits.
  OK: [
    { min: 9, max: 9, kind: "digits" },
    { min: 10, max: 10, kind: "alpha+digits" },
  ],
  // 1 to 9 digits, or 1 letter then 6 to 7 digits.
  OR: [
    { min: 1, max: 9, kind: "digits" },
    { min: 7, max: 8, kind: "alpha+digits" },
  ],
  // 8 digits.
  PA: [{ min: 8, max: 8, kind: "digits" }],
  // 7 digits, or 1 letter then 6 digits.
  RI: [{ min: 7, max: 7, kind: "alpha+digits" }],
  // 5 to 11 digits.
  SC: [{ min: 5, max: 11, kind: "digits" }],
  // 6 to 10 digits, or 12 digits.
  SD: [
    { min: 6, max: 10, kind: "digits" },
    { min: 12, max: 12, kind: "digits" },
  ],
  // 7 to 9 digits.
  TN: [{ min: 7, max: 9, kind: "digits" }],
  // 8 digits on every card issued this century; 7 on the oldest still valid.
  TX: [{ min: 7, max: 8, kind: "digits" }],
  // 4 to 10 digits.
  UT: [{ min: 4, max: 10, kind: "digits" }],
  // 8 digits, or 7 digits then 1 letter.
  VT: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 1 letter then 8 to 11 digits, or 9 digits.
  VA: [{ min: 9, max: 12, kind: "alpha+digits" }],
  // 12 letters and digits (the current WDL cards and the older name-derived ones).
  WA: [{ min: 12, max: 12, kind: "alpha+digits" }],
  // 7 digits, or 1 to 2 letters then 5 to 6 digits.
  WV: [{ min: 6, max: 8, kind: "alpha+digits" }],
  // 1 letter then 13 digits.
  WI: [{ min: 14, max: 14, kind: "alpha+digits" }],
  // 9 or 10 digits.
  WY: [{ min: 9, max: 10, kind: "digits" }],
};

/**
 * Where a passport was issued, as the ISO country code, with the name a
 * person at a desk reads.
 *
 * Ordered by how often each walks into a used car lot in Houston, then
 * alphabetically. Any country can be chosen; the ones here are the ones
 * whose number shape is known well enough to comment on.
 */
export interface PassportIssuer {
  code: string;
  name: string;
}

export const PASSPORT_COUNTRIES: PassportIssuer[] = [
  { code: "US", name: "United States" },
  { code: "MX", name: "Mexico" },
  { code: "HN", name: "Honduras" },
  { code: "SV", name: "El Salvador" },
  { code: "GT", name: "Guatemala" },
  { code: "NI", name: "Nicaragua" },
  { code: "VE", name: "Venezuela" },
  { code: "CO", name: "Colombia" },
  { code: "CU", name: "Cuba" },
  { code: "DO", name: "Dominican Republic" },
  { code: "NG", name: "Nigeria" },
  { code: "IN", name: "India" },
  { code: "VN", name: "Vietnam" },
  { code: "CN", name: "China" },
  { code: "PH", name: "Philippines" },
  { code: "PK", name: "Pakistan" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "BR", name: "Brazil" },
  { code: "PE", name: "Peru" },
  { code: "EC", name: "Ecuador" },
  { code: "AR", name: "Argentina" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "KR", name: "South Korea" },
  { code: "JP", name: "Japan" },
  { code: "OTHER", name: "Another country" },
];

/**
 * What a passport number looks like, by issuing country.
 *
 * Every passport in the world carries its number in the ICAO 9303 machine
 * readable zone, whose document number field is nine characters. So nine is
 * the ceiling everywhere, and the shapes below say how each country fills
 * it. Two shapes where a country has changed format and both are in
 * circulation. Countries not listed, and "another country", get the ICAO
 * ceiling alone: six to nine letters and digits.
 */
export const PASSPORT_SHAPES: Record<string, LicenceShape[]> = {
  // 9 digits on books issued before 2021; 1 letter then 8 digits on the
  // Next Generation Passport since.
  US: [
    { min: 9, max: 9, kind: "digits" },
    { min: 9, max: 9, kind: "alpha+digits" },
  ],
  // 1 letter then 8 digits.
  MX: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 6 or 7 digits.
  HN: [{ min: 7, max: 8, kind: "alpha+digits" }],
  // 1 letter then 6 to 8 digits.
  SV: [{ min: 7, max: 9, kind: "alpha+digits" }],
  // 9 digits, or 3 letters then 6 digits.
  GT: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 7 digits.
  NI: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 6 to 9 digits.
  VE: [{ min: 6, max: 9, kind: "digits" }],
  // 2 letters then 6 digits.
  CO: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 1 letter then 6 digits.
  CU: [{ min: 7, max: 7, kind: "alpha+digits" }],
  // 2 letters then 7 digits.
  DO: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 8 digits.
  NG: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 7 digits.
  IN: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 1 letter then 7 digits.
  VN: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 1 letter then 8 digits, or 2 letters then 7 digits.
  CN: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter, 7 digits, 1 letter; or 2 letters then 7 digits.
  PH: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 2 letters then 7 digits.
  PK: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 2 letters then 6 digits.
  CA: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 9 digits.
  GB: [{ min: 9, max: 9, kind: "digits" }],
  // 2 letters then 6 digits.
  BR: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 9 letters and digits.
  PE: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 7 digits.
  EC: [{ min: 8, max: 8, kind: "alpha+digits" }],
  // 3 letters then 6 digits.
  AR: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 9 letters and digits.
  DE: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 2 digits, 2 letters, 5 digits.
  FR: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 1 letter then 8 digits.
  KR: [{ min: 9, max: 9, kind: "alpha+digits" }],
  // 2 letters then 7 digits.
  JP: [{ min: 9, max: 9, kind: "alpha+digits" }],
};

/** The ICAO 9303 document number: at most nine characters, anywhere on earth. */
const ICAO_PASSPORT_SHAPE: LicenceShape = { min: 6, max: 9, kind: "alpha+digits" };

export function passportShapes(country?: string | null): LicenceShape[] {
  const code = (country ?? "").toUpperCase();
  return PASSPORT_SHAPES[code] ?? [ICAO_PASSPORT_SHAPE];
}

export function passportIssuerName(code?: string | null): string {
  const upper = (code ?? "").toUpperCase();
  return PASSPORT_COUNTRIES.find((entry) => entry.code === upper)?.name ?? upper;
}

/** Uppercase, and stripped of the spaces and dashes people add. */
export function normalizeIdNumber(value: string): string {
  return (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * The shapes that apply to this document, or none when nothing is known.
 *
 * `issuer` is the state for a state document and the country for a
 * passport: one slot, because a document has one issuer.
 */
export function idShapesFor(kind: IdDocumentKind, issuer?: string | null): LicenceShape[] | undefined {
  if (kind === "passport") return passportShapes(issuer);
  if (kind === "stateLicence" && issuer) return STATE_LICENCE_SHAPES[issuer.toUpperCase()];
  return undefined;
}

/**
 * How many characters this kind of document can hold.
 *
 * Used to stop the field rather than to complain afterwards. Generous where the
 * format is unknown, because refusing a real number is worse than accepting a
 * long one.
 */
export function idMaxLength(kind: IdDocumentKind, issuer?: string | null): number {
  const shapes = idShapesFor(kind, issuer);
  if (shapes?.length) return Math.max(...shapes.map((shape) => shape.max));
  // AAMVA's card standard caps the customer number at 25 characters and
  // leaves the format to each jurisdiction, so an ID this table does not
  // know gets the standard's own ceiling rather than a smaller guess.
  return 25;
}

export interface IdCheck {
  /** Null when there is nothing to say. Never blocks, only warns. */
  warning: string | null;
}

/**
 * Look at a number and say whether it matches its document.
 *
 * Returns a warning rather than an error on purpose. States reissue formats and
 * grandfather old numbers, so a rule that blocks would eventually stop a real
 * customer buying a real car over a number that is genuinely on their card.
 */
export function checkIdNumber(
  kind: IdDocumentKind,
  value: string,
  issuer?: string | null,
): IdCheck {
  const number = normalizeIdNumber(value);
  if (number.length === 0) return { warning: null };

  if (kind === "passport") {
    const shapes = passportShapes(issuer);
    if (shapes.some((shape) => matchesShape(number, shape))) return { warning: null };
    const who = issuer && issuer.toUpperCase() !== "OTHER" ? `A ${passportIssuerName(issuer)} passport` : "A passport";
    if (number.length > 9) {
      return { warning: `${who} number is at most 9 characters. This one is ${number.length}.` };
    }
    return {
      warning: `${who} number is ${describeLengths(shapes)} characters. This one is ${number.length}.`,
    };
  }

  if (kind === "stateLicence" && issuer) {
    const code = issuer.toUpperCase();
    const shapes = STATE_LICENCE_SHAPES[code];
    if (!shapes) return { warning: null };

    // Matching any one shape the state has ever issued is a pass. A state
    // with two formats has two kinds of real card, and both walk in.
    if (shapes.some((shape) => matchesShape(number, shape))) {
      return { warning: null };
    }

    // The length fits a digits only shape but a letter is in it. Worth
    // saying out loud, because it is nearly always a letter the reader or
    // the eye substituted for a digit: O for 0, I or l for 1.
    const rightLengthWrongCharacters = shapes.some(
      (shape) =>
        shape.kind === "digits" &&
        number.length >= shape.min &&
        number.length <= shape.max,
    );
    if (rightLengthWrongCharacters) {
      return { warning: `A ${code} licence number is all digits. Check for an O that should be a 0.` };
    }

    return {
      warning: `A ${code} licence number is ${describeLengths(shapes)} characters. This one is ${number.length}.`,
    };
  }

  return { warning: null };
}

/** True when the number fits this one shape, length and characters both. */
function matchesShape(number: string, shape: LicenceShape): boolean {
  if (number.length < shape.min || number.length > shape.max) return false;
  if (shape.kind === "digits") return /^[0-9]+$/.test(number);
  // "alpha+digits" and "any" both accept whatever the normalizer kept,
  // which is already only letters and digits.
  return true;
}

/** "8", "7 to 9", or "7 or 9" for shapes whose lengths do not touch. */
function describeLengths(shapes: LicenceShape[]): string {
  const ranges = [...new Set(shapes.map((shape) => (shape.min === shape.max ? `${shape.min}` : `${shape.min} to ${shape.max}`)))];
  ranges.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return ranges.join(" or ");
}

/**
 * Which box the 130-U wants ticked for this kind of document.
 *
 * The official form does not have a generic identification field: it lists the
 * acceptable kinds and asks which one was presented.
 */
export function form130UIdBox(kind: IdDocumentKind): string | null {
  switch (kind) {
    case "stateLicence":
    case "stateIdCard":
      return "U.S. Driver License/ID Card";
    case "passport":
      return "Passport";
    case "militaryId":
      return "US Military ID";
    default:
      return null;
  }
}

/** The stored kind, or the licence when a record predates the question. */
export function readIdKind(value: unknown): IdDocumentKind {
  return value === "stateIdCard" || value === "passport" || value === "militaryId" || value === "other"
    ? value
    : "stateLicence";
}
