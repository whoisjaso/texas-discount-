const PRESERVED_ACRONYMS = new Set([
  "AI",
  "AM",
  "AMG",
  "API",
  "APR",
  "AWD",
  "BMW",
  "CLA",
  "CLS",
  "CSV",
  "CVT",
  "DMV",
  "EX",
  "EQE",
  "EQS",
  "EV",
  "FWD",
  "GIF",
  "CR",
  "GLA",
  "GLB",
  "GLC",
  "GLE",
  "GLS",
  "GMC",
  "GPS",
  "HP",
  "ID",
  "JPG",
  "L",
  "LE",
  "LLC",
  "LT",
  "LX",
  // Trim codes that print on a bill of sale, kept as the badge spells them.
  "SR",
  "SV",
  "SL",
  "SLT",
  "SLE",
  "LTZ",
  "LS",
  "RS",
  "GT",
  "XL",
  "SXT",
  "SRT",
  "TRD",
  "SR5",
  "DX",
  "RT",
  "LTD",
  "GLI",
  "GTI",
  "TDI",
  "AT4",
  "Z71",
  "ZR2",
  "WT",
  "MB",
  "MTD",
  "NHTSA",
  "PDF",
  "PM",
  "PNG",
  "RWD",
  "S",
  "SE",
  "SEL",
  "SMS",
  "SUV",
  "TBD",
  "TX",
  "URL",
  "VIN",
  "WEBP",
  "XLE",
  "XLT",
  "XSE",
]);

const PROTECTED_TEXT_PATTERN =
  /\{[^}]+\}|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/**
 * Whether a string is prose rather than a title.
 *
 * The owner's rule is that titles and headings capitalise every word and body
 * copy stays sentence case. Call sites across the admin wrapped everything in
 * this helper, sentences included, so a person setting up an account was told
 * "Name, Username, And Bio For The Team Dashboard" and the auction page opened
 * with "Simple Workflow: Paste The Manheim Export, Check What We Bought". A
 * sentence read back at you in title case is a ransom note.
 *
 * A title is short and does not end in a full stop. A sentence does both, so
 * this declines rather than making every call site remember. Short labels that
 * happen to carry a period ("Est. Potential", "No. 3") stay titles.
 */
function readsAsProse(value: string): boolean {
  if (!/[.!?](\s|$)/.test(value.trim())) return false;
  return value.trim().split(/\s+/).filter(Boolean).length >= 4;
}

export function toTitleCaseDisplay(value: string): string {
  if (readsAsProse(value)) return value;
  // A "[Not set: …]" marker is read exactly as written, never re-cased.
  if (/^\[Not set: /.test(value)) return value;

  const protectedParts: string[] = [];
  const protectedValue = value.replace(PROTECTED_TEXT_PATTERN, (match) => {
    const index = protectedParts.push(match) - 1;
    return `\u0000${index}\u0000`;
  });

  return protectedValue.replace(/[\p{L}0-9]+(?:['\u2019][\p{L}0-9]+)?/gu, (word) => {
    const upper = word.toUpperCase();
    if (/^\d+$/.test(word)) return word;
    if (PRESERVED_ACRONYMS.has(upper)) return upper;
    if (/^[A-Z0-9]+$/.test(word) && /\d/.test(word)) return word;
    if (word === upper) return word.charAt(0) + word.slice(1).toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).replace(/\u0000(\d+)\u0000/g, (_, index) => protectedParts[Number(index)] ?? "");
}
