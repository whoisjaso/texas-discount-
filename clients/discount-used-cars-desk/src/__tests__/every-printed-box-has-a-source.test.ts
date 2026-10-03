import { describe, expect, it } from "vitest";
import { FIELD_MAPS, allFields, factsRead } from "@/lib/documents/field-maps";
import { DEAL_FACTS, DOCUMENT_FACTS, factById, ownedFacts } from "@/lib/sales/deal-facts";

/**
 * A document is its pages, and every box on every page names its source
 * (field-maps/). A box with no source is a box nothing fills, which is how
 * a co-buyer's name or a first payment date printed blank on a signed
 * record. These hold the maps to that.
 */

const SOURCE_KINDS = new Set(["dealer", "fees", "vehicle", "buyer", "coBuyer", "answer", "computed", "date", "signature", "static", "none"]);

describe("every box on every page names its source", () => {
  for (const map of FIELD_MAPS) {
    it(`${map.documentType}: every field has a known source kind and a blank rule`, () => {
      const fields = allFields(map);
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(SOURCE_KINDS.has(field.source.from), `${map.documentType}.${field.id}`).toBe(true);
        expect(field.label.trim(), `${map.documentType}.${field.id} label`).not.toBe("");
        expect(field.blank, `${map.documentType}.${field.id} blank`).toBeTruthy();
        if (field.source.from === "none") expect(field.source.reason.trim(), `${field.id} says why nothing fills it`).not.toBe("");
      }
    });

    it(`${map.documentType}: every answer it prints is a registered fact`, () => {
      for (const id of factsRead(map)) expect(factById(id), `${map.documentType} reads ${id}`).toBeDefined();
    });

    it(`${map.documentType}: its ask order is exactly the facts it owns`, () => {
      expect([...map.askOrder].sort()).toEqual(ownedFacts(map.documentType).map((fact) => fact.id).sort());
    });

    it(`${map.documentType}: ids are unique on the document`, () => {
      const ids = allFields(map).map((field) => field.id);
      expect(ids.length).toBe(new Set(ids).size);
    });
  }

  it("every document-owned fact belongs to a mapped document", () => {
    const mapped = new Set(FIELD_MAPS.map((map) => map.documentType));
    for (const fact of DOCUMENT_FACTS) expect(mapped.has(fact.owner), fact.id).toBe(true);
  });

  it("registers each fact once, under one owner and one key", () => {
    const ids = DEAL_FACTS.map((fact) => fact.id);
    expect(ids.length).toBe(new Set(ids).size);
    for (const fact of DEAL_FACTS) expect(fact.id).toBe(`${fact.owner}.${fact.key}`);
  });

  it("keeps the rental agreement mapped but not walked", () => {
    const rental = FIELD_MAPS.find((map) => map.documentType === "rental");
    expect(rental?.legacy).toBe(true);
    expect(rental?.askOrder).toEqual([]);
  });
});
