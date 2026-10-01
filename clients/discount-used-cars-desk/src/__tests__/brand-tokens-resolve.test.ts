import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyBrandTokens } from "@/lib/brand-messages";
import { dealership, factOr } from "@/lib/dealership-config";

/**
 * Every brand token in the message catalogues must resolve.
 *
 * The catalogues carry `{dealer}`, `{dealerLegal}` and `{dealerShort}` where
 * the dealership's name used to be typed out, and two different consumers read
 * them: next-intl through `src/i18n/request.ts`, and the document previews
 * through `src/lib/documents/i18n.ts`, which has no ICU layer at all.
 *
 * That second path is why this test exists rather than a code review. A token
 * the resolver does not know does not throw and does not warn. It renders
 * literally, and the place it renders is a bill of sale: "THE VEHICLE IS SOLD
 * AS IS. The seller, {dealerLegal}, hereby disclaims all warranties." A typo
 * in a JSON string ships a contract naming nobody.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const CATALOGUES = ["messages/en.json", "messages/es.json"] as const;
const KNOWN = new Set(["{dealer}", "{dealerLegal}", "{dealerShort}"]);

/** Every `{dealerSomething}` written anywhere in a catalogue. */
function tokensIn(source: string): string[] {
  return source.match(/\{dealer[A-Za-z]*\}/g) ?? [];
}

describe("brand tokens in the message catalogues", () => {
  it("finds tokens to check", () => {
    // An empty sweep would pass every assertion below while checking nothing.
    const all = CATALOGUES.flatMap((f) => tokensIn(read(f)));
    expect(all.length).toBeGreaterThan(15);
  });

  for (const file of CATALOGUES) {
    it(`uses only tokens the resolver knows, in ${file}`, () => {
      const unknown = [...new Set(tokensIn(read(file)))].filter(
        (t) => !KNOWN.has(t),
      );
      expect(
        unknown,
        `these tokens have no value in src/lib/brand-messages.ts, so they ` +
          `render literally, including onto documents:\n${unknown.join("\n")}`,
      ).toEqual([]);
    });

    it(`leaves no token behind after resolution, in ${file}`, () => {
      const resolved = applyBrandTokens(JSON.parse(read(file)));
      const leftover = tokensIn(JSON.stringify(resolved));
      expect(leftover, `unresolved after applyBrandTokens`).toEqual([]);
    });
  }

  it("keeps the two catalogues in step", () => {
    // A token added to English and forgotten in Spanish is a page that names
    // the dealership in one language and not the other.
    const count = (f: string) => tokensIn(read(f)).length;
    expect(count("messages/es.json")).toBe(count("messages/en.json"));
  });

  it("substitutes the real values, not the token text", () => {
    const resolved = applyBrandTokens({
      a: "The seller, {dealerLegal}, hereby disclaims.",
      b: ["{dealer}", { c: "{dealerShort} Selection" }],
      d: 7,
      e: null,
    }) as Record<string, unknown>;

    expect(resolved.a).toBe(
      `The seller, ${factOr(dealership.legalName, "dealer legal name")}, hereby disclaims.`,
    );
    expect(resolved.b).toEqual([
      dealership.name,
      { c: `${dealership.shortName} Selection` },
    ]);
    // Non-strings pass through untouched rather than being stringified.
    expect(resolved.d).toBe(7);
    expect(resolved.e).toBeNull();
  });

  it("leaves genuine ICU arguments alone", () => {
    const resolved = applyBrandTokens({
      a: "Get in touch with {dealer}. Visit us at {address} or call {phone}.",
    }) as Record<string, string>;

    expect(resolved.a).toContain("{address}");
    expect(resolved.a).toContain("{phone}");
    expect(resolved.a).toContain(dealership.name);
  });
});

describe("the resolver holds no state between calls", () => {
  it("resolves the same string identically however many strings precede it", () => {
    // A `/g` regex shared across calls carries `lastIndex`, which makes the
    // answer depend on what was resolved just before. This is the shape that
    // bug takes: a long string with a late token, then a short one.
    const late = "a long lead-in before the token {dealer} sits here";
    const early = "{dealerLegal} leads";

    const alone = applyBrandTokens(early);
    const afterLongString = (() => {
      applyBrandTokens(late);
      return applyBrandTokens(early);
    })();

    expect(afterLongString).toBe(alone);
    expect(alone).toContain(factOr(dealership.legalName, "dealer legal name"));
    expect(alone).not.toContain("{dealer");
  });

  it("resolves a repeated token more than once in one string", () => {
    const out = applyBrandTokens("{dealerShort} and {dealerShort} again");
    expect(out).toBe(`${dealership.shortName} and ${dealership.shortName} again`);
  });
});
