import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { FEE_PROBLEM_CODES, DEALER_CHARGES_MESSAGES } from "@/lib/sales/fee-schedule";

/**
 * The fee screens speak both languages (rulebook texas-dealer-fees.md 5.2):
 * every refusal the save and the filing can give has an English and a
 * Spanish entry in the catalogue, the Spanish speaks usted, and nothing in
 * the catalogue names the venue county in full (the dealer-facts guard keeps
 * that phrase in the config alone).
 */

type Tree = { [key: string]: Tree | string };

function strings(tree: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : strings(value, `${prefix}${key}.`),
  );
}

const enOnboarding = (en as unknown as { funnel: { onboarding: Tree; review: Tree } }).funnel;
const esOnboarding = (es as unknown as { funnel: { onboarding: Tree; review: Tree } }).funnel;

describe("every refusal", () => {
  const saveCodes = [...FEE_PROBLEM_CODES, "notOwner", "feesStale", "feeSaveFailed"];
  const filingCodes = Object.keys(DEALER_CHARGES_MESSAGES);

  it.each(saveCodes)("the save's %s, in English and Spanish", (code) => {
    const enErrors = enOnboarding.onboarding.errors as Tree;
    const esErrors = esOnboarding.onboarding.errors as Tree;
    expect(typeof enErrors[code], code).toBe("string");
    expect(typeof esErrors[code], code).toBe("string");
    expect(enErrors[code]).not.toBe(esErrors[code]);
  });

  it.each(filingCodes)("the filing's %s, in English and Spanish", (code) => {
    expect(typeof enOnboarding.review[code], code).toBe("string");
    expect(typeof esOnboarding.review[code], code).toBe("string");
  });

  it("names the limit and its citation where the law sets one", () => {
    const enErrors = enOnboarding.onboarding.errors as Record<string, string>;
    const esErrors = esOnboarding.onboarding.errors as Record<string, string>;
    for (const code of ["docFeeOverPresumed", "deputyFeeOverLimit"]) {
      expect(enErrors[code]).toContain("{limit}");
      expect(enErrors[code]).toContain("{citation}");
      expect(esErrors[code]).toContain("{limit}");
      expect(esErrors[code]).toContain("{citation}");
    }
  });
});

describe("the fee screens' Spanish", () => {
  const informal = /(^|[^\p{L}])(t[uú]s?|tienes|puedes|haz|quieres|tuyo|tuya)(?=[^\p{L}]|$)/iu;

  it("speaks usted", () => {
    const fees = strings(esOnboarding.onboarding.fees as Tree);
    expect(fees.length).toBeGreaterThan(60);
    expect(fees.filter(([, value]) => informal.test(value))).toEqual([]);
  });

  it("has every English key, and no more", () => {
    const enKeys = strings(enOnboarding.onboarding.fees as Tree).map(([key]) => key).sort();
    const esKeys = strings(esOnboarding.onboarding.fees as Tree).map(([key]) => key).sort();
    expect(esKeys).toEqual(enKeys);
  });
});

describe("the catalogue", () => {
  it("never names the venue county in full", () => {
    const all = [...strings(en as unknown as Tree), ...strings(es as unknown as Tree)];
    expect(all.filter(([, value]) => /\bHarris\s+County\b|\bCondado\s+de\s+Harris\b/i.test(value))).toEqual([]);
  });
});
