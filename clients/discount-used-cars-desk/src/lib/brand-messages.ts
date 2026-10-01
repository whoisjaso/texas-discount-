/**
 * Substitutes the dealership's name into the message catalogues at load time.
 *
 * `messages/*.json` carries `{dealer}`, `{dealerLegal}` and `{dealerShort}`
 * where the name used to be typed out. They are resolved here, before either
 * consumer sees them, for one reason: the two consumers are different.
 *
 *   - next-intl reads the catalogue through `src/i18n/request.ts` and would
 *     treat these as ICU arguments, needing a value passed at all 30-odd
 *     `t()` call sites.
 *   - the document previews read the same JSON directly through
 *     `src/lib/documents/i18n.ts`, with no ICU layer at all, and would render
 *     the literal text `{dealerLegal}` onto a bill of sale.
 *
 * Resolving at load makes both correct with no call sites to remember, and
 * leaves genuine ICU arguments (`{address}`, `{phone}`, `{count}`) untouched.
 *
 * These are name substitutions, not translations. The Spanish catalogue's
 * legal text is not machine-translated here; only the party named inside it
 * changes, which is exactly what has to change when the seller is a different
 * company.
 */

import { dealership, factOr } from "@/lib/dealership-config";

const TOKENS: Record<string, string> = {
  "{dealer}": dealership.name,
  "{dealerLegal}": factOr(dealership.legalName, "dealer legal name"),
  "{dealerShort}": dealership.shortName,
};

/**
 * Built fresh per call rather than held in a module const.
 *
 * A `/g` regex carries `lastIndex` between calls, so a shared instance used
 * with `.test()` returns the wrong answer for the string after a match. The
 * previous version happened to be correct only because every `true` was
 * immediately followed by a `.replace()`, which resets it. That is an
 * invariant one edit away from breaking silently, on the path that writes a
 * bill of sale.
 */
function substitute(text: string): string {
  return text.replace(/\{dealer(?:Legal|Short)?\}/g, (match) => TOKENS[match] ?? match);
}

/** Recursively resolve brand tokens in a loaded message catalogue. */
export function applyBrandTokens<T>(node: T): T {
  if (typeof node === "string") {
    // Unconditional. The guard this replaced was a micro-optimisation on a
    // string replace, bought with shared mutable regex state.
    return substitute(node) as unknown as T;
  }
  if (Array.isArray(node)) {
    return node.map((child) => applyBrandTokens(child)) as unknown as T;
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = applyBrandTokens(value);
    }
    return out as unknown as T;
  }
  return node;
}
