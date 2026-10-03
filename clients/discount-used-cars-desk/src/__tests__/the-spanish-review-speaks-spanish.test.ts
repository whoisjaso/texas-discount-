import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { FIELD_MAPS } from "@/lib/documents/field-maps";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * On a Spanish screen the review's headings, page titles, chips and the
 * desk's own words (Still To Do, an ID's kind, "Yes") were English, and the
 * money marker read "[Not set: cargo de documentos]". The box labels and
 * printed values still quote the paper, which prints in English, and the
 * Spanish screen says so.
 */
const page = (bundle: typeof en) => bundle.funnel.review.page;

describe("the Spanish review speaks Spanish", () => {
  it("titles every page of every map in Spanish", () => {
    const titles = page(es).titles as Record<string, string>;
    for (const map of FIELD_MAPS) {
      for (const sheet of map.pages) {
        expect(titles[sheet.title], `${map.documentType}: ${sheet.title}`).toBeTruthy();
        expect(titles[sheet.title], sheet.title).not.toBe(sheet.title);
        expect((page(en).titles as Record<string, string>)[sheet.title]).toBe(sheet.title);
      }
    }
  });

  it("words the desk's own values, the source chips and the marker in Spanish", () => {
    const values = page(es).values as Record<string, string>;
    for (const key of Object.keys(page(en).values)) {
      expect(values[key], key).toBeTruthy();
      expect(values[key], key).not.toBe((page(en).values as Record<string, string>)[key]);
    }
    expect(page(es).sources.intake).not.toBe(page(en).sources.intake);
    expect(page(es).notSetMarker).toBe("[Sin definir: {what}]");
    expect(page(es).quotesEnglish).toMatch(/inglés/);
    expect(page(en).quotesEnglish).toBe("");
  });

  it("hands the screen the desk's words as keys, the paper's words as the value", () => {
    const rows = readBack("billOfSale", ROUTES.spanish, filedFormData("billOfSale", ROUTES.spanish)).flatMap((sheet) => sheet.rows);
    const outstanding = rows.find((row) => row.id === "outstanding");
    expect(outstanding?.valueKeys).toEqual(["registrationByDealer", "insuranceOnFile", "inspectionPassed"]);
    expect(outstanding?.value).toBe("We file the registration · Insurance on file · Inspection passed");
    expect(rows.find((row) => row.id === "buyerIdKind")?.valueKeys).toEqual(["idKind.stateLicence"]);
  });

  it("is what the read-back and the money summary render", () => {
    const readback = readFileSync("src/components/admin/paperwork/PageReadBack.tsx", "utf8");
    expect(readback).toContain("titles[page.title] ?? page.title");
    expect(readback).toContain("words.quotesEnglish");
    const review = readFileSync("src/components/admin/paperwork/ReviewStep.tsx", "utf8");
    expect(review).toContain("fillTemplate(t.review.page.notSetMarker, { what: t.review.money.docFee.toLowerCase() })");
    expect(review).not.toMatch(/notSet\(t\.review/);
  });
});
