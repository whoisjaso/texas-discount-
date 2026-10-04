/**
 * The characters the official state forms can print.
 *
 * The 130-U is filled with the standard Helvetica font, whose encoding is
 * WinAnsi (Windows-1252). A character outside it ("Ł", "ễ") cannot be drawn:
 * pdf-lib throws while measuring it, and the whole 130-U render fails. So a
 * staff name that will print on the seller line (owner's instruction
 * 10/01/2026) is checked against this set at onboarding and again before
 * filing, rather than discovered at the county.
 *
 * Pure on purpose: onboarding, the filing gate and their tests share it, and
 * none of them should load a PDF library to answer a character question.
 */

/**
 * The Windows-1252 characters in 0x80 to 0x9F, by Unicode code point, that
 * WinAnsi also encodes (the euro sign, curly quotes, the dashes, and so on).
 * Written as numbers so no dash character sits in the source.
 */
const WINANSI_EXTRAS = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** True when Helvetica (WinAnsi) can print this one character. */
export function printsOnStateForm(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_EXTRAS.has(code);
}

/**
 * The first character the state form cannot print, or null when every one
 * prints. Read after NFC normalisation, so a decomposed "í" is judged as the
 * one composed letter it is.
 */
export function firstUnprintableOnStateForm(text: string): string | null {
  for (const char of text.normalize("NFC")) {
    if (!printsOnStateForm(char)) return char;
  }
  return null;
}
