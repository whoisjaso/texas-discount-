import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * Two guards on the funnel catalogue, because half-translated is worse than
 * untranslated (the documented failure mode of Spanish launches: Spanglish
 * screens and dead ends) and because a slip of register is the most visible
 * amateur tell in formal Spanish.
 *
 * 1. Coverage: every key in the EN funnel namespace exists in ES, and the
 *    other way around. A key added to one file and not the other fails the
 *    build rather than shipping a screen that flips language mid-question.
 * 2. Register: the corridor speaks usted. The tu-register forms fail here
 *    by word boundary, accented or not.
 */

type Tree = { [key: string]: Tree | string };

function keyPaths(tree: Tree, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const here = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.push(here);
    else out.push(...keyPaths(value, here));
  }
  return out;
}

function stringValues(tree: Tree, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(tree)) {
    const here = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.push([here, value]);
    else out.push(...stringValues(value, here));
  }
  return out;
}

describe("funnel catalogue coverage", () => {
  const enKeys = keyPaths((en as { funnel: Tree }).funnel).sort();
  const esKeys = keyPaths((es as { funnel: Tree }).funnel).sort();

  it("every English funnel key exists in Spanish", () => {
    const missing = enKeys.filter((key) => !esKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("every Spanish funnel key exists in English", () => {
    const missing = esKeys.filter((key) => !enKeys.includes(key));
    expect(missing).toEqual([]);
  });
});

describe("funnel Spanish register", () => {
  // Word-bounded, accent-tolerant. `tu`/`tús` inside a longer word (e.g.
  // "titulo", "factura") must not trip it, so boundaries are letter-aware.
  const informal = /(^|[^\p{L}])(t[uú]s?|tienes|puedes|haz|quieres|tuyo|tuya)(?=[^\p{L}]|$)/iu;

  it("the es funnel namespace never slips into the tu register", () => {
    const offenders = stringValues((es as { funnel: Tree }).funnel).filter(
      ([, value]) => informal.test(value),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the corridor says which language it is in", () => {
  /*
    A third way to be half-translated, which is neither a missing key nor a
    slip of register: correct Spanish words styled as English.

    The admin's buttons carry `text-transform: capitalize`, which is the house
    style and right in English. Applied to Spanish it produced `Sí, Lo Mostró
    Hoy` on the prescreen question that decides who files the title, and a
    dealer reading that is being shown a sentence nobody writes.

    The fix is not a list of screens. The corridor stamps `lang` on the
    document, so the stylesheet scopes off the language and a screen reader
    stops pronouncing Spanish through an English voice.
  */
  const PROVIDER = readFileSync(
    "src/components/admin/funnel/FunnelLocaleProvider.tsx",
    "utf8",
  );
  const CSS = readFileSync("src/app/globals.css", "utf8");

  it("stamps the document with the language on screen", () => {
    expect(PROVIDER).toMatch(/root\.lang = lang/);
    // Following the toggle, not just the first render.
    expect(PROVIDER).toMatch(/\}, \[lang\]\)/);
  });

  it("puts it back on the way out", () => {
    // Leaving the corridor for the dashboard must not leave the document
    // claiming to be Spanish.
    expect(PROVIDER).toMatch(/const previous = root\.lang/);
    expect(PROVIDER).toMatch(/root\.lang = previous/);
  });

  it("stops title-casing Spanish, and only Spanish", () => {
    expect(CSS).toMatch(/html\[lang="es"\][^{]*\{\s*text-transform: none;/);
    // The English house style is untouched: the base rule still capitalizes.
    expect(CSS).toMatch(/^\s*text-transform: capitalize;/m);
  });
});
