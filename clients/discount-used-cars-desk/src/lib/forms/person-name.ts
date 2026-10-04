/**
 * A person's name, in the parts a state form asks for.
 *
 * The forms print four boxes — First, Middle, Last, Suffix — and the honest
 * way to fill them is to be told which is which. Everything in this file
 * below `NameParts` exists for the case where nobody was: deals hold
 * `buyerName` as a single string, typed by whoever started the sale, and the
 * documents have to print something.
 */

export type NameParts = {
  first?: string | null;
  middle?: string | null;
  last?: string | null;
  suffix?: string | null;
};

/**
 * The name as a deal stores it: every box present, empty ones explicitly null.
 *
 * Distinct from `NameParts` because a stored record should not be able to
 * express "this field was never considered". Reading one back always gives
 * four boxes, the same way `AamvaAddress` always gives its four.
 */
export type StoredName = {
  first: string | null;
  middle: string | null;
  last: string | null;
  suffix: string | null;
};

export const EMPTY_NAME: StoredName = {
  first: null,
  middle: null,
  last: null,
  suffix: null,
};

/** The boxes, in the order the state forms print them left to right. */
export const NAME_FIELDS = [
  { key: "first", label: "First name" },
  { key: "middle", label: "Middle name" },
  { key: "last", label: "Last name" },
  { key: "suffix", label: "Suffix" },
] as const;

export type NameKey = (typeof NAME_FIELDS)[number]["key"];

/** Whether any box has been filled. Four empties is no name. */
export function hasName(name: StoredName): boolean {
  return NAME_FIELDS.some(({ key }) => (name[key] ?? "").trim().length > 0);
}

/**
 * The parts written out, for a label, a search, or the customer row.
 *
 * One direction only. Joining is lossless and splitting is not, which is the
 * whole reason the parts are what gets stored.
 */
export function joinName(name: StoredName): string {
  return NAME_FIELDS.map(({ key }) => name[key])
    .filter((part) => (part ?? "").trim().length > 0)
    .map((part) => (part as string).trim())
    .join(" ");
}

/**
 * Suffixes the form's own "Suffix (if any)" box is for.
 *
 * Matched without punctuation or case so "jr", "Jr." and "JR" all land in
 * the suffix box rather than being mistaken for a surname.
 */
const SUFFIXES = new Set([
  "jr", "sr", "ii", "iii", "iv", "v",
]);

/**
 * Surname particles that belong with the word after them.
 *
 * Without this, "Jose de la Cruz" puts "Cruz" under Last Name and strands
 * "de la" in the middle box, which is a different person's name as far as a
 * title is concerned. This is the shortest list that covers the surnames
 * this dealership actually sees; it is not a general solution to human names,
 * and it is not pretending to be.
 */
const PARTICLES = new Set([
  "de", "del", "de la", "de los", "de las", "la", "las", "los",
  "da", "das", "do", "dos", "van", "von", "der", "van der", "bin", "al",
]);

const strip = (word: string) => word.replace(/[.,]/g, "").toLowerCase();

/**
 * Split a written-out name into the form's four boxes.
 *
 * The rules, in order:
 *   1. A trailing suffix is peeled off first.
 *   2. "Last, First Middle" is honoured when a comma says so, because that
 *      ordering is unambiguous and people do write it.
 *   3. Otherwise the first word is the given name and the last word is the
 *      surname, with a run of particles pulled into the surname.
 *
 * What this cannot do is know that "Ana Maria" is one given name or that
 * "Garcia Lopez" is one surname without a particle between them. Those come
 * out as first="Ana", middle="Maria" and middle="Garcia", last="Lopez". Both
 * are wrong on a title application, which is why the callers take explicit
 * parts when they have them and this is only the fallback.
 */
export function splitPersonName(full: string | null | undefined): NameParts {
  const cleaned = (full ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return {};

  // A comma means the writer already told us where the surname ends.
  const comma = cleaned.indexOf(",");
  if (comma > 0) {
    const last = cleaned.slice(0, comma).trim();
    const rest = cleaned.slice(comma + 1).trim().split(" ").filter(Boolean);
    // "Smith, John Michael, Jr" — a second comma is the suffix.
    let suffix: string | undefined;
    if (rest.length && SUFFIXES.has(strip(rest[rest.length - 1]))) {
      suffix = rest.pop();
    }
    return {
      first: rest.shift(),
      middle: rest.length ? rest.join(" ") : undefined,
      last,
      suffix,
    };
  }

  const words = cleaned.split(" ").filter(Boolean);

  let suffix: string | undefined;
  if (words.length > 2 && SUFFIXES.has(strip(words[words.length - 1]))) {
    suffix = words.pop();
  }

  if (words.length === 1) return { first: words[0], suffix };
  if (words.length === 2) return { first: words[0], last: words[1], suffix };

  // Walk back from the end while the preceding word is a particle, so
  // "de la Cruz" travels together into the surname box.
  let start = words.length - 1;
  while (start - 1 >= 1) {
    const one = strip(words[start - 1]);
    const two = strip(words.slice(start - 2, start).join(" "));
    if (PARTICLES.has(one)) start -= 1;
    else if (start - 2 >= 1 && PARTICLES.has(two)) start -= 2;
    else break;
  }

  return {
    first: words[0],
    middle: start > 1 ? words.slice(1, start).join(" ") : undefined,
    last: words.slice(start).join(" "),
    suffix,
  };
}

/** True when the split had to guess, so a caller can offer a correction. */
export function nameSplitIsUncertain(full: string | null | undefined): boolean {
  const cleaned = (full ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.includes(",")) return false;
  const words = cleaned
    .split(" ")
    .filter((w) => !SUFFIXES.has(strip(w)));
  // Three or more words with no particle to anchor the surname is the case
  // where "Ana Maria Garcia Lopez" and "John Michael Smith" are the same
  // shape and only one of the two splits is right.
  if (words.length < 3) return false;
  return !words.some((w) => PARTICLES.has(strip(w)));
}
