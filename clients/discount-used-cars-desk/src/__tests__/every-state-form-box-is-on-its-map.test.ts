import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFDocument as CantooDocument } from "@cantoo/pdf-lib";
import { fieldMapFor } from "@/lib/documents/field-maps";
import { VTR_61_COMPONENT_FIELDS } from "@/lib/documents/field-maps/vtr-61";

/**
 * Every AcroForm field of every state form is on its map: a box the desk
 * fills names its source, and a box it leaves alone names why. A template
 * revision that adds a field fails here before it prints blank at a county.
 */

function covered(documentType: string) {
  const map = fieldMapFor(documentType)!;
  // A row's own box and the same answer's other boxes (box 13's five kinds).
  const onMap = new Set(
    map.pages.flatMap((page) => page.fields.flatMap((field) => [field.acroField, ...(field.acroFields ?? [])]).filter(Boolean)),
  );
  return { onMap, notOnThisDesk: map.notOnThisDesk ?? {} };
}

describe("the state forms' fields are all on their maps", () => {
  it("130-U: 98 fields, each mapped or left alone with a reason", async () => {
    const pdf = await PDFDocument.load(readFileSync("public/forms/130-U.pdf"));
    const names = pdf.getForm().getFields().map((field) => field.getName());
    expect(names.length).toBe(98);
    const { onMap, notOnThisDesk } = covered("form130U");
    const missing = names.filter((name) => !onMap.has(name) && !(name in notOnThisDesk));
    expect(missing).toEqual([]);
    for (const [name, why] of Object.entries(notOnThisDesk)) {
      expect(names, `${name} is a field of the form`).toContain(name);
      expect(why.trim()).not.toBe("");
    }
  });

  it("VTR-61: the page-1 boxes are on the map and page 2 is the component table", async () => {
    const pdf = await PDFDocument.load(readFileSync("public/forms/VTR-61.pdf"));
    const names = pdf.getForm().getFields().map((field) => field.getName());
    const { onMap } = covered("vtr61");
    const missing = names.filter((name) => !onMap.has(name) && !VTR_61_COMPONENT_FIELDS.test(name));
    expect(missing).toEqual([]);
  });

  it("VTR-271: all fifteen fields are on the map", async () => {
    const pdf = await CantooDocument.load(readFileSync("public/forms/VTR-271.pdf"), { password: "", throwOnInvalidObject: false } as never);
    const names = pdf.getForm().getFields().map((field) => field.getName());
    expect(names.length).toBe(15);
    const { onMap } = covered("powerOfAttorney");
    expect(names.filter((name) => !onMap.has(name))).toEqual([]);
  });

  it("the Buyers Guide and the rebuilt disclosure are flat: their boxes are drawn, and mapped", async () => {
    for (const [path, type] of [
      ["public/forms/buyers-guide-ftc-english-2016.pdf", "buyersGuide"],
      ["public/forms/ENF-MV-RBLT-DSCLMR.pdf", "rebuiltDisclosure"],
    ] as const) {
      const pdf = await PDFDocument.load(readFileSync(path));
      expect(pdf.getForm().getFields().length, path).toBe(0);
      expect(fieldMapFor(type)!.pages.flatMap((page) => page.fields).length).toBeGreaterThan(0);
    }
  });
});
