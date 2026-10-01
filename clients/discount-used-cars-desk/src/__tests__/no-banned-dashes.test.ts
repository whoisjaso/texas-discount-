import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

/**
 * Em-dashes and en-dash separators, banned by DESIGN.md, across the whole tree.
 *
 * There was already a rule and there had already been a sweep. The sweep only
 * ever reached the files a commit happened to touch, so the rule held on the
 * screens that were rebuilt and quietly did not hold anywhere else. What it
 * missed was not obscure:
 *
 *   - the public homepage's business hours, in both languages, in two files
 *     because the string is duplicated
 *   - the meta description under every vehicle in search results
 *   - the subject line of the email a buyer receives with their documents
 *   - the accessible name of the homepage logo, which a screen reader speaks
 *   - the price and year range separators on the public inventory filters
 *   - an em-dash printed where a buyer's VIN belongs, on the signing page
 *   - the Profit and Loss statement's title and its empty cells
 *   - text messages sent to customers and to the owner's phone
 *
 * A rule enforced by whoever remembers it is not enforced. This walks the tree.
 */

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "__tests__"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    if (SKIP_DIRS.has(entry)) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|css|json|txt|md)$/.test(entry)) out.push(rel);
  }
  return out;
}

/**
 * A dash inside a comment is a note to another programmer, not to a customer.
 * Stripping comments keeps the rule pointed at what ships on screen.
 */
function withoutComments(source: string): string {
  return (
    source
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "")
      // Trailing comments too, not just whole-line ones. The first version of
      // this only stripped full lines, so `code; // note —` still counted.
      // The negative lookbehind keeps it off the // in a URL.
      .replace(/(?<!:)\/\/.*$/gm, "")
  );
}

/**
 * Two things are legitimately exempt, and both are excluded by path so the
 * exemption cannot silently widen to a file that does ship copy.
 *
 * `extraction-prompt.ts` and `sms/ai-agent.ts` are instructions written to a
 * model, not to a person. Note that ai-agent's *output* is an SMS a customer
 * reads; it is the prompt that is exempt, not the message.
 *
 * `mock-vehicles.ts` is NOT exempt. It is the fallback the public inventory
 * renders when the database is unreachable, so its copy is customer-facing,
 * which is only obvious after checking who imports it.
 */
const PROMPT_FILES = /\/(records\/extraction-prompt|sms\/ai-agent)\.ts$/;

/** Server-side diagnostics, read by developers tailing logs. */
const DIAGNOSTIC = /console\.(log|warn|error|info)|\[notifications\]|\[paypal/;

describe("banned dashes", () => {
  it("does not ship an em-dash or an en-dash separator anywhere a person reads", () => {
    const offenders: string[] = [];

    // `messages` was outside the walk, and that is exactly where two of them
    // were still living: the contact page's hours read "Mon-Sat 9AM-7PM" with
    // en-dashes, in both languages, on a page the ban had supposedly cleared.
    //
    // `public` was outside it for longer, and cost more. llms.txt and
    // llms-full.txt are written for AI crawlers to quote, so the eight banned
    // dashes sitting in them were the copy most likely to be repeated back by
    // somebody else's model, in the answers this dealership wants to be found
    // in. A ban that stops at the files a person opens is not the ban.
    for (const file of [
      ...walk("src"),
      ...(existsSync(join(root, "scripts")) ? walk("scripts") : []),
      ...walk("messages"),
      ...walk("public"),
    ]) {
      if (PROMPT_FILES.test(file)) continue;
      const lines = withoutComments(readFileSync(join(root, file), "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (!/[—–]/.test(line)) return;
        if (DIAGNOSTIC.test(line)) return;
        offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 100)}`);
      });
    }

    expect(
      offenders,
      `banned dash in copy a person reads:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("holds the business hours in exactly one place", () => {
    // This used to assert that two files carried the same sentence, which is
    // the wrong shape of guarantee: it passed while the Sunday line drifted
    // ("Sunday: Closed" in the chrome, "Sunday: closed" on the homepage) and
    // while two more copies sat in the translation files, because it only
    // matched the weekday half. The sentence is now built by `hoursLines` from
    // the `hours` rules, so what is worth guarding is that nobody writes it out
    // by hand again.
    const literal = /(Monday|Lunes)[^"`]*(7:00 PM|Cerrado|Closed)/;
    const offenders = [...walk("src"), ...walk("messages")].filter(
      (file) =>
        file !== "src/lib/dealership-config.ts" &&
        literal.test(readFileSync(join(root, file), "utf8")),
    );

    expect(
      offenders,
      `business hours written out by hand instead of read from hoursLines():\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
