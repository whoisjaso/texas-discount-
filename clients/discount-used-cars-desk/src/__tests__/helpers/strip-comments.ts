/**
 * Strip comments before asserting on source, without eating the source.
 *
 * Guard tests in this repo read a file and assert that some syntax is or is
 * not in it. They have to strip comments first, because the comments here
 * explain the fault they removed and therefore quote it: four guards have
 * failed on their own explanatory prose, which CLAUDE.md records as a house
 * trap.
 *
 * Every one of them stripped block comments with `/\/\*[\s\S]*?\*\//g`, and
 * that regex does not know what a string is. `accept="image/*"` opens a
 * comment it never closes, so everything from there to the next real `*\/`
 * disappears. Measured across the sources these tests read, 56 files were
 * mangled: `FleetCensusClient.tsx` lost 15,390 characters, about 40 per cent
 * of itself, and `StartSale.tsx` lost 6,667.
 *
 * That is worse than a broken test, because a `not.toContain` assertion
 * pointing into a swallowed region PASSES. The guard looks green while
 * checking nothing, which is the same failure as a suite that will not load.
 *
 * The fix is to treat `/*` as a comment opener only where the house actually
 * writes one: at the start of a line. That leaves `"image/*"` alone, and no
 * comment in this codebase begins mid-expression. A JSX comment opens as
 * `{/*` at the start of its line, so the brace is optional on both ends.
 */
export function stripComments(source: string): string {
  return source
    .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
