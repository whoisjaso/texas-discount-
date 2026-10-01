/**
 * Every word in an email subject is capitalised. Every subject, every time.
 *
 * This is the owner's explicit instruction, and it is the same rule DESIGN.md
 * already records for headings: "capitalise every word, including 'of', 'a'
 * and 'the'. This is the owner's explicit instruction and it overrides any
 * generic house style."
 *
 * It is deliberately NOT `toTitleCaseDisplay`. That one bails out on anything
 * reading as prose (four or more words ending in a full stop) and returns it
 * untouched, which is right for a heading pulled out of a sentence and wrong
 * here: "Your pre-approval with Triple J." would have come through unchanged.
 * The instruction was "regardless of anything", so this one has no escape
 * hatch.
 *
 * What it still respects, because changing these would be wrong rather than
 * merely different:
 *   - Acronyms already in caps stay as typed (DMV, LLC, VIN, APR).
 *   - Any token carrying a digit is left alone, so a code, a year or a trim
 *     badge is not reshaped.
 *   - An email address or a link is left whole. A subject carrying one is
 *     rare, but "Write To Info@Thetriplejauto.Com" is not a thing anyone
 *     wants to receive.
 *
 * Spanish gets the same treatment. Title Case is not a Spanish typographic
 * convention; the owner was explicit that this applies to every email.
 */

/** Left whole: addresses and links, which title case would mangle. */
const PROTECTED = /(?:[\w.+-]+@[\w-]+\.[\w.-]+)|(?:https?:\/\/\S+)/gi;

/** A word, including one carrying a straight or curly apostrophe. */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu;

export function titleCaseSubject(subject: string): string {
  const held: string[] = [];
  const masked = subject.replace(PROTECTED, (match) => ` ${held.push(match) - 1} `);

  const cased = masked.replace(WORD, (word) => {
    // A token carrying a digit is a code, a year or a badge. Leave it.
    if (/\p{N}/u.test(word)) return word;
    // Already all caps and more than one letter: an acronym, kept as typed.
    if (word.length > 1 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  return cased.replace(/ (\d+) /g, (_, index) => held[Number(index)] ?? "");
}
