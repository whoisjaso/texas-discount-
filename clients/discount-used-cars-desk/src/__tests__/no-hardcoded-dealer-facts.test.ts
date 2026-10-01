import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

/**
 * No dealership fact may be written anywhere but `dealership-config.ts`.
 *
 * This is the sale desk of Discount Used Cars and Trucks, LLC (8108 Gulf Fwy,
 * Houston, GDN P145000). It was forked from Vega's desk, which was ported from
 * Triple J's, and it will be forked again. So a hardcoded fact is not a
 * tidiness problem. It is a fact that will still be another dealer's after
 * someone else's name is on the desk, and the failure is silent: the page
 * renders, the build passes, and a customer gets texted another dealership's
 * phone number.
 *
 * The pattern that made this urgent was real and shipped:
 *
 *   const BUSINESS_PHONE = process.env.BUSINESS_PHONE || "(832) 400-9760";
 *
 * An environment variable with one dealership's number as the fallback. Miss
 * the variable on a new deployment and nothing breaks loudly; the SMS just
 * goes out wrong. There were four of those, plus a second env var
 * (BUSINESS_PHONE alongside NEXT_PUBLIC_DEALER_PHONE) for the same fact, so
 * the website and the text message could disagree with each other.
 *
 * A rule in prose does not survive this. DESIGN.md has banned em-dashes since
 * the beginning and they shipped in seven places anyway, because a rule
 * enforced by whoever remembers to read it is not enforced. This one runs.
 */

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);

/** The one file allowed to know any of this. */
const CONFIG = "src/lib/dealership-config.ts";

/**
 * Tests may name this dealer: they assert against this deployment's real
 * values, and a fork replaces them along with the config. Scripts under
 * `scripts/` are one-off developer harnesses, not shipped code. Everything
 * else is in scope.
 */
const ALLOWED = [/^src\/__tests__\//, /^scripts\//, new RegExp(`^${CONFIG}$`)];

/** Discount Used Cars and Trucks' facts: allowed in the config file only. */
const FACTS: { name: string; pattern: RegExp }[] = [
  { name: "phone number", pattern: /\(?713\)?[\s.-]?900[\s.-]?5050|\+?1?7139005050/ },
  { name: "licence-record phone number", pattern: /\(?713\)?[\s.-]?203[\s.-]?3890|\+?1?7132033890/ },
  { name: "street address", pattern: /8108\s+Gulf/i },
  { name: "postal code", pattern: /\b77017\b/ },
  { name: "dealer licence", pattern: /\bP145000\b/ },
];

/**
 * The facts of the dealerships this desk was forked from: Vega's Auto Sales
 * (the desk this one was copied from) and Triple J (the reference desk Vega's
 * was ported from). Allowed nowhere, not even in the config: another dealer's
 * phone, address, licence, name or payment handle surviving the port would
 * route Discount's customers to another business.
 */
const FOREIGN_FACTS: { name: string; pattern: RegExp }[] = [
  { name: "Vega's phone", pattern: /\(?713\)?[\s.-]?941[\s.-]?1622|\+?1?7139411622/ },
  { name: "Vega's street", pattern: /7722\s+Galveston/i },
  { name: "Vega's licence", pattern: /\bP113248\b/ },
  { name: "Vega's postal code", pattern: /\b77034\b/ },
  { name: "Vega's licence holder", pattern: /Constantino/i },
  { name: "Vega's name", pattern: /Vega['’]s|\bVEGA['’]S\b/ },
  { name: "reference phone", pattern: /\(?832\)?[\s.-]?(?:818[\s.-]?6428|400[\s.-]?9760)|8328186428|8324009760/ },
  { name: "reference street", pattern: /8774\s+Almeda/i },
  { name: "reference licence", pattern: /\bP171632\b/ },
  { name: "reference postal code", pattern: /\b77075\b/ },
  { name: "reference domain", pattern: /thetriplejauto\.com/i },
  { name: "personal payment handle", pattern: /JasonObawemimo|jobawems@/i },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    if (SKIP_DIRS.has(entry)) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|css|json)$/.test(entry)) out.push(rel);
  }
  return out;
}

/** A fact in a comment is a note to a programmer, not something a customer reads. */
function withoutComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "")
    .replace(/(?<!:)\/\/.*$/gm, "");
}

describe("dealership facts live in exactly one file", () => {
  const files = [...walk("src"), ...walk("messages")].filter(
    (f) => !ALLOWED.some((rule) => rule.test(f)),
  );

  it("finds files to check", () => {
    // An empty sweep would pass every assertion below while checking nothing,
    // which is the failure mode this project has hit before.
    expect(files.length).toBeGreaterThan(100);
  });

  for (const fact of FACTS) {
    it(`does not hardcode the ${fact.name} outside dealership-config`, () => {
      const offenders: string[] = [];

      for (const file of files) {
        const lines = withoutComments(
          readFileSync(join(root, file), "utf8"),
        ).split("\n");
        lines.forEach((line, index) => {
          if (fact.pattern.test(line)) {
            offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 110)}`);
          }
        });
      }

      expect(
        offenders,
        `${fact.name} hardcoded outside ${CONFIG}. Read it from \`dealership\` instead:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }

  for (const fact of FOREIGN_FACTS) {
    it(`carries no ${fact.name} from the reference dealership`, () => {
      const offenders: string[] = [];
      for (const file of [...walk("src"), ...walk("messages")].filter((f) => !/^src\/__tests__\//.test(f))) {
        const lines = withoutComments(readFileSync(join(root, file), "utf8")).split("\n");
        lines.forEach((line, index) => {
          if (fact.pattern.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 110)}`);
        });
      }
      expect(offenders, `${fact.name} survived the port:\n${offenders.join("\n")}`).toEqual([]);
    });
  }

  /**
   * The dealership's name is not a fact like the others, and pretending it is
   * would make this file lie.
   *
   * This used to sit at 289 with a note that replacing those occurrences was
   * "a brand layer, not a substitution". That layer now exists: the mark reads
   * `brand.wordmark`, the crest reads `brand.logo` (and tolerates null), the
   * message catalogues carry `{dealer}` tokens resolved at load, and the copy
   * interpolates. 289 to 23.
   *
   * The 23 that remain are deliberate, and they are all identifiers rather
   * than words anyone reads:
   *
   *   - `desk_role` in Supabase `app_metadata`, on every existing admin
   *     user. Renaming it is a data migration against live auth records, not
   *     an edit, and it is invisible either way.
   *   - `triplej.admin.workspace`, a localStorage key. Renaming it silently
   *     resets every operator's saved workspace.
   *   - `__triplejAgentApiKeyPreviewStore`, a global symbol used to keep the
   *     preview store off the module graph.
   *   - `source: "triplej_admin"` written into Stripe metadata on existing
   *     charges, `local-admin@triplej.dev` in the dev-only auth shim, one
   *     Hermes OS repo path, and one seeded message in the Supabase mock.
   *
   * A new dealership inherits those strings and nobody ever sees them. Driving
   * this to zero would mean migrating stored data to change something no user
   * can observe, which is churn with a real chance of locking someone out.
   *
   * So this stays a ratchet, not a gate: the number may go down and may never
   * go up. Lower it when a real occurrence goes; do not chase the identifiers.
   */
  it("does not grow the number of places naming the dealership", () => {
    const occurrences: string[] = [];
    for (const file of files) {
      const lines = withoutComments(
        readFileSync(join(root, file), "utf8"),
      ).split("\n");
      lines.forEach((line, index) => {
        if (/Triple\s*J|TripleJ/i.test(line)) {
          occurrences.push(`${file}:${index + 1}`);
        }
      });
    }

    // Measured after the brand layer. The floor is the identifier list in the
    // comment above, so this is close to as low as it honestly goes.
    const CEILING = 0;
    expect(
      occurrences.length,
      `naming the dealership grew to ${occurrences.length}, ceiling is ${CEILING}. ` +
        `Read it from \`dealership\` rather than writing it again.`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("never falls back to a real dealership's details behind an env var", () => {
    // `process.env.X || "(832) 400-9760"` is worse than a plain literal: it
    // looks configured, so nobody checks it, and it fails silently.
    const offenders: string[] = [];
    for (const file of [...walk("src")].filter(
      (f) => !ALLOWED.some((rule) => rule.test(f)),
    )) {
      const source = withoutComments(readFileSync(join(root, file), "utf8"));
      const matches = source.match(
        /process\.env\.[A-Z_]+\s*\|\|\s*["'`][^"'`]*(?:832|713|Almeda|Galveston|Gulf|77075|77034|77017|Triple|Vega|Discount)[^"'`]*["'`]/g,
      );
      if (matches) offenders.push(`${file}: ${matches.join(", ")}`);
    }
    expect(
      offenders,
      `env var with a real dealership's value as the fallback:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
