import { describe, expect, it } from "vitest";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { FORM_130U_MAP } from "@/lib/documents/field-maps/form-130u";

/**
 * The 130-U's map may set a field aside as "not on this desk" only when the
 * filler never writes it. Sixteen fields the filler does write (Title Only,
 * Business, Passport Issued, the additional applicant, Date_2, Rebate
 * Amount, box 29 ...) sat in that list, so a value could reach the state
 * form with no source on the map. Each is on the map now, through the row
 * that reads its answer.
 */
describe("nothing the 130-U writes is left off its map", () => {
  it("lists no written field as not on this desk", () => {
    const written = new Set(FIELD_MAPPINGS.map((mapping) => mapping.fieldId));
    const setAside = Object.keys(FORM_130U_MAP.notOnThisDesk ?? {});
    expect(setAside.filter((name) => written.has(name))).toEqual([]);
  });

  it("maps every written field to a row", () => {
    const mapped = new Set(
      FORM_130U_MAP.pages.flatMap((page) => page.fields.flatMap((field) => [field.acroField, ...(field.acroFields ?? [])])).filter(Boolean),
    );
    expect(FIELD_MAPPINGS.map((mapping) => mapping.fieldId).filter((name) => !mapped.has(name))).toEqual([]);
  });
});
