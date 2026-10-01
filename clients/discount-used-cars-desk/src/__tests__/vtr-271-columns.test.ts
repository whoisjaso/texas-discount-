import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { fillPowerOfAttorney, VTR_271_TEMPLATE_PATH } from "@/lib/documents/powerOfAttorneyForm";
import { VTR_271_COLUMNS, VTR_271_MULTI_BOX_FIELDS } from "@/lib/forms/vtr-271-columns";
import { columnAt } from "@/lib/forms/box-columns";

/**
 * Does every value land under the box that names it?
 *
 * The owner's report was that it did not: his whole name printed under
 * "First Name" and the whole "Houston, Harris, TX 77004" under "City". That
 * is the kind of defect a screenshot review misses, because the page looks
 * filled in either way. So this fills the real template with values that
 * cannot be confused for each other, reads the text back WITH coordinates,
 * and asserts each one sits in its declared column.
 */

type Item = { s: string; x: number; y: number };

async function textWithPositions(bytes: Uint8Array): Promise<Item[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    password: "",
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  // getTextContent returns text runs interleaved with marked-content markers;
  // only the runs carry a string and a transform.
  const runs = content.items as Array<{ str?: unknown; transform?: number[] }>;
  const out: Item[] = [];
  for (const run of runs) {
    if (typeof run.str !== "string" || !run.transform) continue;
    const s = run.str.trim();
    if (s) out.push({ s, x: run.transform[4], y: run.transform[5] });
  }
  return out;
}

/** Values chosen so no probe can be mistaken for another or for the form. */
const PROBE = {
  first: "Zafira",
  middle: "Quillon",
  last: "Mbeki",
  suffix: "III",
  city: "Uvalde",
  county: "Zavala",
  state: "TX",
  zip: "78801",
};

describe("VTR-271 multi-box fields", () => {
  it("has a template to check against", () => {
    expect(fs.existsSync(VTR_271_TEMPLATE_PATH)).toBe(true);
  });

  it("declares four boxes for every multi-box field, left to right", () => {
    expect(VTR_271_MULTI_BOX_FIELDS).toHaveLength(4);
    for (const spec of VTR_271_MULTI_BOX_FIELDS) {
      expect(spec.columns).toHaveLength(4);
      // Columns must not overlap or run backwards, or a value would be
      // scored as landing in a box it is only touching the edge of.
      for (let i = 1; i < spec.columns.length; i++) {
        const prev = spec.columns[i - 1];
        const here = spec.columns[i];
        expect(here.x).toBeGreaterThan(prev.x);
        expect(prev.x + prev.width).toBeLessThanOrEqual(here.x + 0.01);
      }
      // Every box has usable room. A zero-width box means a label moved.
      for (const column of spec.columns) {
        expect(column.width).toBeGreaterThan(20);
      }
    }
  });

  it("puts each part of the grantor's name under its own printed box", async () => {
    const bytes = await fillPowerOfAttorney({
      vin: "1HGBH41JXMN109186",
      grantorName: "unused, parts win",
      grantorNameParts: {
        first: PROBE.first,
        middle: PROBE.middle,
        last: PROBE.last,
        suffix: PROBE.suffix,
      },
    });

    const items = await textWithPositions(bytes);
    const columns = VTR_271_COLUMNS.grantorName.columns;

    for (const part of ["first", "middle", "last", "suffix"] as const) {
      const probe = PROBE[part];
      const found = items.find((i) => i.s === probe);
      expect(found, `${probe} was not drawn on the page at all`).toBeDefined();

      const landed = columnAt(columns, found!.x);
      expect(
        landed?.part,
        `"${probe}" was drawn at x=${found!.x.toFixed(1)}, which is in the ` +
          `"${landed?.part ?? "no"}" box, not "${part}"`,
      ).toBe(part);
    }
  });

  it("puts city, county, state and zip in four different boxes", async () => {
    const bytes = await fillPowerOfAttorney({
      vin: "1HGBH41JXMN109186",
      grantorName: "Ada Lovelace",
      grantorCity: PROBE.city,
      grantorCounty: PROBE.county,
      grantorState: PROBE.state,
      grantorZip: PROBE.zip,
    });

    const items = await textWithPositions(bytes);
    const columns = VTR_271_COLUMNS.grantorCity.columns;

    for (const part of ["city", "county", "zip"] as const) {
      const probe = PROBE[part];
      const found = items.find((i) => i.s === probe);
      expect(found, `${probe} was not drawn on the page at all`).toBeDefined();
      expect(columnAt(columns, found!.x)?.part).toBe(part);
    }
  });

  it("does not put the whole name in the first box, which was the bug", async () => {
    const bytes = await fillPowerOfAttorney({
      vin: "1HGBH41JXMN109186",
      grantorName: "Zafira Quillon Mbeki",
    });
    const items = await textWithPositions(bytes);

    // The exact failure being guarded: one run of text carrying the whole
    // name, sitting in the First Name box.
    const whole = items.find((i) => i.s === "Zafira Quillon Mbeki");
    expect(whole, "the full name printed as one string again").toBeUndefined();

    const last = items.find((i) => i.s === "Mbeki");
    expect(last).toBeDefined();
    expect(columnAt(VTR_271_COLUMNS.grantorName.columns, last!.x)?.part).toBe("last");
  });

  it("fills the dealership's own boxes separately too", async () => {
    const bytes = await fillPowerOfAttorney({
      vin: "1HGBH41JXMN109186",
      grantorName: "Ada Lovelace",
    });
    const items = await textWithPositions(bytes);
    const columns = VTR_271_COLUMNS.granteeCity.columns;

    // Harris is the dealership's county and belongs in the County box, not
    // trailing the city behind two spaces the way it used to.
    const county = items.find((i) => i.s === "Harris");
    expect(county, "the grantee county was not drawn").toBeDefined();
    expect(columnAt(columns, county!.x)?.part).toBe("county");
  });
});
