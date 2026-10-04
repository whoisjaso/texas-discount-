import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { GATE_REASONS_FOR_COPY } from "./helpers/empty-weight-copy";

/**
 * Every word the empty-weight screens say exists in English and Spanish, and
 * none of it uses a banned dash (the repository's dash guard reads these
 * catalogues too; ranges are written "3,263 to 3,387 lb").
 */

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const EN = leaves(en.funnel.weight as unknown as Tree);
const ES = leaves(es.funnel.weight as unknown as Tree);

describe("the weight copy", () => {
  it("has the same keys in both languages", () => {
    expect([...ES.keys()].sort()).toEqual([...EN.keys()].sort());
    expect(EN.size).toBeGreaterThan(60);
  });

  it("is actually translated, not copied", () => {
    const same = [...EN.entries()].filter(([key, value]) => ES.get(key) === value && !/^(sourceButtons|sources)\.mco$|^box11$|^noDate$|^sale\.onFile$|^startSources\.canada$|^sources\.kbb_jdpower$/.test(key));
    expect(same.map(([key]) => key)).toEqual([]);
  });

  it("keeps every placeholder in both languages", () => {
    const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const [key, value] of EN) expect(slots(ES.get(key) ?? ""), key).toBe(slots(value));
  });

  it("uses no em or en dash anywhere", () => {
    for (const [key, value] of [...EN, ...ES]) expect(/[–—]/.test(value), key).toBe(false);
    for (const lang of [en, es]) {
      const form = lang.funnel.paperwork.form130U;
      for (const text of [form.emptyWeight.note, form.carryingCapacity.note]) expect(/[–—]/.test(text)).toBe(false);
    }
  });

  it("names every gate reason and every refusal", () => {
    for (const reason of GATE_REASONS_FOR_COPY) {
      expect(EN.get(`gate.${reason}`), reason).toBeTruthy();
      expect(ES.get(`gate.${reason}`), reason).toBeTruthy();
    }
    for (const code of ["estimateMissing", "estimateNeedsDocument", "estimateChanged", "documentOnFile", "weightInvalid", "weightSourceMissing", "reasonRequired", "saveFailed"]) {
      expect(EN.get(`errors.${code}`), code).toBeTruthy();
      expect(ES.get(`errors.${code}`), code).toBeTruthy();
    }
  });

  it("puts buttons in Title Case", () => {
    expect(EN.get("confirm")).toBe("Confirm This Weight");
    expect(ES.get("confirm")).toBe("Confirmar Este Peso");
    expect(EN.get("reason")).toBe("Why Is It Different?");
    expect(ES.get("reason")).toBe("¿Por Qué Es Diferente?");
    expect(ES.get("sourceButtons.texas_title")).toBe("Título De Texas");
    expect(ES.get("sourceButtons.out_of_state_title")).toBe("Título De Otro Estado");
    expect(ES.get("sourceButtons.weight_certificate")).toBe("Certificado De Peso");
    expect(ES.get("sourceButtons.kbb_jdpower")).toBe("KBB O JD Power");
  });

  it("tells the truth about the door jamb in both languages", () => {
    expect(en.funnel.paperwork.form130U.emptyWeight.note).toContain("door jamb shows GVWR, not the empty weight");
    expect(es.funnel.paperwork.form130U.emptyWeight.note).toContain("muestra el GVWR, no el peso vacío");
  });
});
