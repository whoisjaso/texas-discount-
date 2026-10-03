import { formatPostal, splitAddress, titleCase, type AamvaFields } from "@/lib/sales/aamva";

/**
 * Reading the printed front of a licence, when the barcode will not read.
 *
 * The barcode on the back is the better source and stays the first choice: it
 * is what the issuing authority encoded, so it does not confuse 0 with O. This
 * exists for the cards where that fails. A licence that has lived in a wallet
 * for eight years, been through a wash cycle, or had its back scratched is a
 * real and ordinary thing, and until now the answer was "Type It Instead".
 *
 * Everything here lands in the `read` column and nothing else. A value off this
 * path is a proposal a person still has to look at, which is the same contract
 * the barcode gets and is why a less reliable reader is safe to add at all.
 *
 * ## What the reader actually does to a card
 *
 * Measured, not assumed. On a rendered Texas front the values came back clean
 * while the labels came back mangled:
 *
 *     3D0B 03/14/1989      the label lost its O
 *     4bExP 03/14/2031     case collapsed
 *     4aisS 02/02/2024     two letters wrong
 *
 * So this parser never trusts label text. It anchors on the shape of values,
 * and uses the labels only as a loose hint. That is also why it leans on the
 * numbered fields: 1, 2, 3, 4b, 4d and 8 are an AAMVA card design convention
 * rather than a Texas one, so the same reading works on out-of-state cards.
 */

/** Field numbers as they are printed on the card, per the AAMVA card design. */
const LINE = {
  family: /^1\s*[.:)]?\s*([A-Za-z][A-Za-z\s'\-.]{1,})$/,
  given: /^2\s*[.:)]?\s*([A-Za-z][A-Za-z\s'\-.]{1,})$/,
  street: /^8\s*[.:)]?\s*(\d.*)$/,
};

/** A US date as printed on a licence. */
const PRINTED_DATE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g;

/** "HOUSTON, TX 77039", with or without the +4, as a whole line. */
const LOCALITY = /^([A-Za-z][A-Za-z\s.'\-]+),\s*([A-Za-z]{2})\.?\s+(\d{5}(?:-?\d{4})?)\b/;

/** The ", TX 77039" tail, found anywhere in a line rather than anchored. */
const STATE_AND_POSTAL = /,\s*([A-Za-z]{2})\.?\s+(\d{5}(?:-?\d{4})?)\b/;

/**
 * Words printed on the card itself that are not part of anybody's address.
 *
 * The reader runs across a line, so the caption of the portrait box or a
 * security legend beside the street can arrive stuck to the end of it. Only a
 * trailing occurrence is removed, and only when something is left behind, so a
 * street genuinely called Donor Lane survives.
 */
const CARD_CHROME = /\s+(PHOTO|PORTRAIT|SIGNATURE|DONOR|VETERAN|SAMPLE|SPECIMEN|DUPLICATE)\.?$/i;

/** Tokens the reader emits for an empty or unreadable value. */
const NOT_A_VALUE = new Set(["", "NONE", "N/A", "NA", "UNKNOWN", "SAMPLE", "SPECIMEN"]);

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function usable(value: string | null): string | null {
  if (!value) return null;
  const trimmed = tidy(value);
  if (NOT_A_VALUE.has(trimmed.toUpperCase())) return null;
  return trimmed.length > 0 ? trimmed : null;
}

/** MM/DD/YYYY as printed, to the ISO the rest of the system stores. */
function isoFromPrinted(month: string, day: string, year: string): string | null {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // A licence is not issued to somebody born in 1704, and a reader that
  // produced such a year has misread rather than found something unusual.
  if (y < 1900 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects the 31st of February, which passes the range check above.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

interface FoundDate {
  iso: string;
  /** The text sitting in front of it on the same line, lowercased. */
  prefix: string;
}

function findDates(lines: string[]): FoundDate[] {
  const found: FoundDate[] = [];
  for (const line of lines) {
    PRINTED_DATE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PRINTED_DATE.exec(line))) {
      const iso = isoFromPrinted(match[1], match[2], match[3]);
      if (!iso) continue;
      found.push({ iso, prefix: line.slice(0, match.index).toLowerCase() });
    }
  }
  return found;
}

/**
 * Which printed date is which.
 *
 * The label is tried first, loosely, because the reader damages label text far
 * more often than it damages digits: `d[o0]b` catches the D0B that was actually
 * observed. When no label survives, the ordering rule takes over. A licence
 * carries exactly three dates and their order is fixed by what they mean: born
 * before issued before expires. That holds for every card and needs no label at
 * all.
 */
function classifyDates(dates: FoundDate[]): { dateOfBirth: string | null; expires: string | null } {
  let dateOfBirth: string | null = null;
  let expires: string | null = null;

  for (const { iso, prefix } of dates) {
    if (!dateOfBirth && /d[o0]b|birth/.test(prefix)) dateOfBirth = iso;
    // "exp" is matched loosely for the same reason, but "iss" must not win it.
    else if (!expires && /e[xk]p/.test(prefix)) expires = iso;
  }

  if (!dateOfBirth || !expires) {
    const distinct = [...new Set(dates.map((d) => d.iso))].sort();
    if (distinct.length >= 2) {
      // Earliest is the birth, latest is the expiry, whatever sits between.
      if (!dateOfBirth) dateOfBirth = distinct[0];
      if (!expires) expires = distinct[distinct.length - 1];
    }
  }

  // Nobody expires before they are born. If that is what came back, the reader
  // has misassigned them and neither is worth proposing.
  if (dateOfBirth && expires && dateOfBirth >= expires) {
    return { dateOfBirth: null, expires: null };
  }
  return { dateOfBirth, expires };
}

/**
 * The licence number.
 *
 * Anchored on the 4d field where it survives, and otherwise on shape. The
 * fallback deliberately ignores anything that already parsed as part of a date,
 * because an eight digit run is exactly what a date looks like with its
 * separators lost.
 */
function findLicenceNumber(lines: string[]): string | null {
  for (const line of lines) {
    const labelled = /\b4\s*d\s*(?:dl|lic)?[^A-Za-z0-9]*([A-Z0-9]{6,13})\b/i.exec(line);
    if (labelled) return labelled[1].toUpperCase();
  }
  for (const line of lines) {
    const labelled = /\bd\.?\s*l\.?\s*(?:no|num|number|#)?[^A-Za-z0-9]{0,3}([A-Z0-9]{6,13})\b/i.exec(line);
    if (labelled) return labelled[1].toUpperCase();
  }
  for (const line of lines) {
    if (PRINTED_DATE.test(line)) {
      PRINTED_DATE.lastIndex = 0;
      continue;
    }
    PRINTED_DATE.lastIndex = 0;
    const bare = /(?:^|\s)(\d{7,9})(?:\s|$)/.exec(line);
    if (bare) return bare[1];
  }
  return null;
}

function findName(lines: string[]): string | null {
  let family: string | null = null;
  let given: string | null = null;

  for (const line of lines) {
    if (!family) {
      const match = LINE.family.exec(line);
      // "12 Rest A" and "15 Sex F" both begin with a 1. They do not match,
      // because the character after it is a digit rather than a letter.
      if (match) family = usable(match[1]);
    }
    if (!given) {
      const match = LINE.given.exec(line);
      if (match) given = usable(match[1]);
    }
  }

  if (!family && !given) return null;
  // Given names first, family last, which is the order the barcode reader
  // produces and therefore the order every screen downstream expects.
  const parts = [titleCase(given), titleCase(family)].filter(Boolean);
  const name = parts.join(" ").trim();
  return name.length > 1 ? name : null;
}

function findAddress(lines: string[]): string | null {
  let street: string | null = null;
  let locality: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const match = LINE.street.exec(lines[i]);
    if (!match) continue;
    const stripped = tidy(match[1]).replace(CARD_CHROME, "");
    street = usable(stripped);
    if (!street) continue;

    // The town sits on the next line on almost every card, but the reader can
    // put it on the same one when the print is tight.
    //
    // No attempt is made to split the street from the town in that case. There
    // is no rule that separates "12 Main St Houston" into its two halves
    // without guessing, because a town can be one word or three and so can the
    // end of a street. The state and the postal code are still normalised, the
    // whole run is kept in order, and a person reads it back either way. A
    // wrong guess here would move somebody's house to another town, which is
    // worse than a missing comma.
    const sameLine = STATE_AND_POSTAL.exec(street);
    if (sameLine) {
      const beforeComma = usable(street.slice(0, sameLine.index));
      const tail = [sameLine[1].toUpperCase(), formatPostal(sameLine[2])]
        .filter(Boolean)
        .join(" ");
      const joined = [beforeComma ? titleCase(beforeComma) : null, tail]
        .filter(Boolean)
        .join(", ");
      return joined.length > 0 ? joined : null;
    }
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
      const next = LOCALITY.exec(tidy(lines[j]).replace(CARD_CHROME, ""));
      if (next) {
        locality = formatLocality(next);
        break;
      }
    }
    break;
  }

  if (!street && !locality) {
    // No numbered field survived. Take a bare town line if there is exactly one,
    // which is still worth proposing on its own.
    for (const line of lines) {
      const bare = LOCALITY.exec(tidy(line).replace(CARD_CHROME, ""));
      if (bare) {
        locality = formatLocality(bare);
        break;
      }
    }
  }

  const address = [street ? titleCase(street) : null, locality].filter(Boolean).join(", ");
  return address.length > 0 ? address : null;
}

function formatLocality(match: RegExpExecArray): string {
  const city = titleCase(match[1].trim());
  const state = match[2].toUpperCase();
  const postal = formatPostal(match[3]);
  return [city, [state, postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Whether this text came off an identity document at all.
 *
 * A camera pointed at a loyalty card produces perfectly confident text, and
 * filling a sale from one would be worse than reading nothing. The barcode path
 * has `looksLikeLicence` for the same reason; this is its counterpart, and it is
 * deliberately harder to satisfy than a single keyword, because a photograph of
 * a page about driver licences is not a driver licence.
 */
export function looksLikeLicenceFront(text: string): boolean {
  if (!text) return false;
  const flat = text.toUpperCase().replace(/\s+/g, " ");
  const saysSo =
    /DRIVER\s*LICEN[CS]E/.test(flat) ||
    /IDENTIFICATION\s*CARD/.test(flat) ||
    /\bDRIVERLICENSE\b/.test(flat);

  const lines = toLines(text);
  const anchors = [
    findDates(lines).length >= 2,
    findLicenceNumber(lines) !== null,
    findName(lines) !== null,
    findAddress(lines) !== null,
  ].filter(Boolean).length;

  // Either the card names itself and one field reads, or enough fields read
  // that the shape is not a coincidence.
  return (saysSo && anchors >= 1) || anchors >= 3;
}

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(tidy)
    .filter((line) => line.length > 0);
}

/**
 * Reads what it can off the front of a licence.
 *
 * Returns the same shape as the barcode reader so both feed the same merge, and
 * so nothing downstream has to know which one produced a value. Fields it
 * cannot find come back null rather than guessed.
 */
export function readLicenceFront(text: string): AamvaFields {
  const lines = toLines(text);
  const { dateOfBirth, expires } = classifyDates(findDates(lines));
  const address = findAddress(lines);

  return {
    name: findName(lines),
    // Never title-cased: the case of a licence number is significant.
    licenseNumber: findLicenceNumber(lines),
    dateOfBirth,
    expires,
    address,
    // The barcode hands over four elements; this reader only ever sees printed
    // lines, so the parts have to be recovered from the text. `splitAddress`
    // leaves anything it cannot make sense of in the street, which is the
    // right failure for a value a person is about to check.
    addressParts: splitAddress(address),
  };
}
