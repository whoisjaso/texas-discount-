import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();

/**
 * No dealership fact may be written anywhere but `dealership-config.ts`.
 *
 * This is the sale desk of Discount Used Cars and Trucks, LLC (8108 Gulf Fwy,
 * Houston, GDN P145000). It was forked from an earlier dealer's desk, which
 * was ported from the reference desk, and it will be forked again. So a
 * hardcoded fact is not a tidiness problem. It is a fact that will still be
 * another dealer's after someone else's name is on the desk, and the failure
 * is silent: the page renders, the build passes, and a customer gets texted
 * another dealership's phone number.
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
 *
 * What it reads:
 *
 *   - THIS dealer's facts may sit only in the config. Checked in everything
 *     that ships or runs: `src/`, `messages/`, `supabase/` and the root
 *     config files, with comments removed (a fact in a comment is a note to a
 *     programmer, not something a customer reads). Documentation (README,
 *     `.env.example`, `docs/`, `verification/`) describes the facts on
 *     purpose and is not checked for them.
 *   - The EARLIER dealers' facts may sit nowhere: not in code, not in a
 *     comment, not in the config, the README, `.env.example`, `docs/`,
 *     `verification/` or `public/`. Only tests are exempt, because a test
 *     may plant a foreign value to prove it is refused.
 *
 * Comments are found by the TypeScript parser, not by a regular expression,
 * so `"https://..."` or `"a // b"` inside a string is never mistaken for one.
 */

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", ".vercel"]);

/** Text files read by the guard. Images, PDFs, fonts and logs are not. */
const TEXT_FILE = /\.(?:[cm]?[jt]sx?|css|json|md|sql|html|txt|svg|webmanifest)$/;

/** The one file allowed to know any of this. */
const CONFIG = "src/lib/dealership-config.ts";

/**
 * Tests may name this dealer: they assert against this deployment's real
 * values, and a fork replaces them along with the config. Scripts under
 * `scripts/` are one-off developer harnesses, not shipped code. Everything
 * else is in scope.
 */
const ALLOWED = [/^src\/__tests__\//, /^scripts\//, new RegExp(`^${CONFIG}$`)];

/** Everything that ships or runs. */
const CODE_DIRS = ["src", "messages", "supabase"];
const CODE_FILES = [
  "next.config.ts",
  "vitest.config.ts",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "package.json",
];

/** Everything handed over with the desk that is not code. */
const DOC_DIRS = ["docs", "verification", "public"];
const DOC_FILES = ["README.md", ".env.example"];

/** Discount Used Cars and Trucks' facts: allowed in the config file only. */
const FACTS: { name: string; pattern: RegExp }[] = [
  { name: "phone number", pattern: /\(?713\)?[\s.-]?900[\s.-]?5050|\+?1?7139005050/ },
  { name: "licence-record phone number", pattern: /\(?713\)?[\s.-]?203[\s.-]?3890|\+?1?7132033890/ },
  { name: "street address", pattern: /8108\s+Gulf/i },
  { name: "postal code", pattern: /\b77017\b/ },
  { name: "dealer licence", pattern: /\bP145000\b/ },
  { name: "dealer name (display and legal)", pattern: /Discount\s+Used\s+Cars\s+(?:and|&)\s+Trucks/i },
  { name: "Facebook page", pattern: /facebook\.com\/Discountusedcars/i },
  { name: "venue county", pattern: /\bHarris\s+County\b|\bCondado\s+de\s+Harris\b/i },
];

/**
 * The facts of the dealerships this desk was forked from: the earlier
 * dealer's desk it was copied from, and the reference desk that one was
 * ported from. Allowed nowhere, not even in the config or a comment: another
 * dealer's phone, address, licence, name or payment handle surviving the port
 * would route Discount's customers to another business, and naming another
 * client in a handed-over codebase discloses that client.
 *
 * `allow` exempts one exact line shape when the data model, which is fixed,
 * carries a value: the stored vehicle-location identifiers.
 */
const FOREIGN_FACTS: { name: string; pattern: RegExp; allow?: (file: string, line: string) => boolean }[] = [
  { name: "previous fork's phone", pattern: /\(?713\)?[\s.-]?941[\s.-]?1622|\+?1?7139411622/ },
  { name: "previous fork's street", pattern: /7722\s+Galveston/i },
  { name: "previous fork's licence", pattern: /\bP113248\b/ },
  { name: "previous fork's postal code", pattern: /\b77034\b/ },
  { name: "previous fork's licence holder", pattern: /Constantino/i },
  {
    name: "previous fork's name, glass business, Facebook page or emblem",
    pattern: /vega['’]?s\b|glass\s*co\b|auto\s*glass|100064755109997|vegas-(?:logo|icon)/i,
  },
  { name: "reference phone", pattern: /\(?832\)?[\s.-]?(?:818[\s.-]?6428|400[\s.-]?9760)|8328186428|8324009760/ },
  { name: "reference street", pattern: /8774\s+Almeda/i },
  { name: "reference licence", pattern: /\bP171632\b/ },
  { name: "reference postal code", pattern: /\b77075\b/ },
  { name: "reference domain", pattern: /thetriplejauto\.com/i },
  { name: "reference name or monogram", pattern: /Triple\s*J\b|TripleJ|\bJJJ\b/i },
  {
    name: "reference lot",
    pattern: /\balmeda\b|\blot_7813\b/i,
    allow: (file, line) => file === "src/types/database.ts" && /^\s*\|\s*"(?:almeda|lot_7813)"\s*$/.test(line),
  },
  { name: "personal payment handle", pattern: /JasonObawemimo|jobawems@/i },
  {
    // The short name with "Auto" after it reads as a different business:
    // "Vega's Auto" was a real trading name, "Discount Auto" is not.
    name: "invented trading name",
    pattern: /\$\{[\w.]*\b(?:shortName|short)\}\s*Auto\b|\bDiscount\s+Auto\b/i,
  },
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(root, dir))) return out;
  for (const entry of readdirSync(join(root, dir))) {
    if (SKIP_DIRS.has(entry)) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (TEXT_FILE.test(entry)) out.push(rel);
  }
  return out;
}

const present = (files: string[]) => files.filter((f) => existsSync(join(root, f)));

const CODE = [...CODE_DIRS.flatMap((d) => walk(d)), ...present(CODE_FILES)];
const HANDED_OVER = [...CODE, ...DOC_DIRS.flatMap((d) => walk(d)), ...present(DOC_FILES)];

/** Replaces every character of a range with a space, keeping line breaks. */
function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, " ") + text.slice(end);
}

/** Tokens whose text is content, never trivia, whatever characters it holds. */
const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.JsxText,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

/**
 * The comments of a script, found by the TypeScript parser: every comment is
 * leading or trailing trivia of some token, and the parser knows where
 * strings, template literals, regular expressions and JSX text begin and end.
 * A range that starts inside one of those is content ("Call // now" in JSX,
 * "a // b" in a string) and is dropped.
 */
function scriptComments(file: string, source: string): [number, number][] {
  const kind = /\.[cm]?tsx$|\.jsx$/.test(file)
    ? ts.ScriptKind.TSX
    : /\.[cm]?ts$/.test(file)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const ranges = new Map<number, number>();
  const literals: [number, number][] = [];
  const collect = (pos: number) => {
    for (const r of ts.getLeadingCommentRanges(source, pos) ?? []) ranges.set(r.pos, r.end);
    for (const r of ts.getTrailingCommentRanges(source, pos) ?? []) ranges.set(r.pos, r.end);
  };
  const visit = (node: ts.Node) => {
    collect(node.getFullStart());
    collect(node.getEnd());
    if (LITERAL_KINDS.has(node.kind)) {
      // JSX text has no trivia of its own, so it starts at `pos`.
      literals.push([node.kind === ts.SyntaxKind.JsxText ? node.pos : node.getStart(sf), node.end]);
      return;
    }
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return [...ranges.entries()].filter(
    ([start]) => !literals.some(([from, to]) => start >= from && start < to),
  );
}

/** A fact in a comment is a note to a programmer, not something a customer reads. */
function withoutComments(file: string, source: string): string {
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    let out = source;
    for (const [start, end] of scriptComments(file, source)) out = blank(out, start, end);
    return out;
  }
  if (/\.css$/.test(file)) {
    return source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  }
  if (/\.sql$/.test(file)) {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
      .replace(/--.*$/gm, "");
  }
  return source;
}

const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("dealership facts live in exactly one file", () => {
  const files = CODE.filter((f) => !ALLOWED.some((rule) => rule.test(f)));
  const handedOver = HANDED_OVER.filter((f) => !/^src\/__tests__\//.test(f));

  it("finds files to check", () => {
    // An empty sweep would pass every assertion below while checking nothing,
    // which is the failure mode this project has hit before.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("supabase/migrations/20260926000000_discount_sale_desk.sql");
    expect(handedOver).toEqual(expect.arrayContaining(["README.md", ".env.example", CONFIG]));
  });

  it("finds comments with the parser, not by looking for slashes", () => {
    const probe = [
      'const a = "a // b"; const b = "(713) 941-1622";',
      "const url = `https://example.com/${a}`; // note",
      "const re = /https?:\\/\\//; /* block */ const c = 1;",
      "const el = <p>Call // now {/* aside */}</p>;",
    ].join("\n");
    const lines = withoutComments("probe.tsx", probe).split("\n");
    expect(lines[0]).toContain('"(713) 941-1622"');
    expect(lines[1]).toContain("https://example.com/");
    expect(lines[1]).not.toContain("note");
    expect(lines[2]).toContain("const c = 1;");
    expect(lines[2]).not.toContain("block");
    expect(lines[3]).toContain("Call // now");
    expect(lines[3]).not.toContain("aside");
  });

  for (const fact of FACTS) {
    it(`does not hardcode the ${fact.name} outside dealership-config`, () => {
      const offenders: string[] = [];

      for (const file of files) {
        const lines = withoutComments(file, read(file)).split("\n");
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
    it(`carries no ${fact.name} from an earlier dealership`, () => {
      const offenders: string[] = [];
      for (const file of handedOver) {
        read(file)
          .split("\n")
          .forEach((line, index) => {
            if (fact.pattern.test(line) && !fact.allow?.(file, line)) {
              offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 110)}`);
            }
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
   * interpolates. 289 to 0.
   *
   * The reference name now also sits in FOREIGN_FACTS above, which reads
   * comments and documentation too. This count stays as the older, narrower
   * ratchet: the number may go down and may never go up.
   */
  it("does not grow the number of places naming the dealership", () => {
    const occurrences: string[] = [];
    for (const file of files) {
      const lines = withoutComments(file, read(file)).split("\n");
      lines.forEach((line, index) => {
        if (/Triple\s*J|TripleJ/i.test(line)) {
          occurrences.push(`${file}:${index + 1}`);
        }
      });
    }

    const CEILING = 0;
    expect(
      occurrences.length,
      `naming the dealership grew to ${occurrences.length}, ceiling is ${CEILING}. ` +
        `Read it from \`dealership\` rather than writing it again.`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("never falls back to a real dealership's details behind an env var", () => {
    // `process.env.X || "(832) 400-9760"` is worse than a plain literal: it
    // looks configured, so nobody checks it, and it fails silently. The same
    // goes for `??` and for `process.env.X?.trim() || "..."`.
    const offenders: string[] = [];
    for (const file of files) {
      const source = withoutComments(file, read(file));
      const matches = source.match(
        /process\.env\.[A-Z0-9_]+(?:\??\.\w+\(\))*\s*(?:\|\||\?\?)\s*["'`][^"'`]*(?:832|713|Almeda|Galveston|Gulf|Harris|77075|77034|77017|Triple|Vega|Discount)[^"'`]*["'`]/gi,
      );
      if (matches) offenders.push(`${file}: ${matches.join(", ")}`);
    }
    expect(
      offenders,
      `env var with a real dealership's value as the fallback:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
