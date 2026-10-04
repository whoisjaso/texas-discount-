import { describe, expect, it } from "vitest";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * The 130-U review showed the filler's codes ("title_and_registration",
 * "individual", "A") on every sale, in both languages. It says what the
 * state form's boxes say. And a business applicant's review matches the
 * filed page: Business ticked, the FEIN in box 14, the entity alone in
 * box 16, and no photo ID type or name parts, which the paper leaves blank.
 */
const rows = (sale: typeof ROUTES.cashPaid) => {
  const { context } = paperworkFilingContext(sale, "form130U", "Harris");
  return readBack("form130U", sale, filedFormData("form130U", sale), { context }).flatMap((page) => page.rows);
};

describe("the 130-U review says what the form says", () => {
  it("words the application, the applicant and the odometer brand as the form does", () => {
    const read = rows(ROUTES.cashPaid);
    const value = (id: string) => read.find((row) => row.id === id)?.value;
    expect(value("applying_for")).toBe("Title & Registration");
    expect(value("applicant_type")).toBe("Individual");
    expect(value("odometer_brand")).toBe("Actual Mileage");
    for (const row of read) expect(row.value, row.id).not.toMatch(/^(title_and_registration|individual|business|[ANX])$/);
  });

  it("reads a business applicant back as the filed page prints it", () => {
    const read = rows(ROUTES.business);
    const ids = read.map((row) => row.id);
    const value = (id: string) => read.find((row) => row.id === id)?.value;
    expect(value("applicant_type")).toBe("Business");
    expect(value("buyer_entity_name")).toBe("Gulf Coast Hauling, LLC");
    expect(value("buyer_fein")).toBe("741234567");
    // The printed-name line names the entity, and says it came from the answer, not the licence.
    expect(read.find((row) => row.id === "applicant_printed_entity")).toMatchObject({ value: "Gulf Coast Hauling, LLC", source: "answer" });
    for (const personOnly of ["buyer_dl_number", "buyer_id_kind", "buyer_dl_state", "buyer_first_name", "buyer_last_name", "applicant_printed_name"]) {
      expect(ids, personOnly).not.toContain(personOnly);
    }
  });

  it("reads a person's photo ID and name parts back, and no entity rows", () => {
    const ids = rows(ROUTES.cashPaid).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(["buyer_dl_number", "buyer_id_kind", "buyer_first_name", "buyer_last_name"]));
    expect(ids).not.toContain("buyer_entity_name");
    expect(ids).not.toContain("buyer_fein");
    expect(ids).not.toContain("applicant_printed_entity");
    expect(rows(ROUTES.cashPaid).find((row) => row.id === "applicant_printed_name")?.source).toBe("buyer");
  });
});
