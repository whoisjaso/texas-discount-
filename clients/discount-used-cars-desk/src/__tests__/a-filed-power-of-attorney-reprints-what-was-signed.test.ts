import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { poaFieldsFromSale, poaFormFieldsFromPrinted, poaProbe } from "@/lib/documents/poa-fields";
import { paperworkAnswers, paperworkDefault, paperworkQuestions } from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { missingPrintedFields } from "@/lib/documents/field-maps/resolve";
import { ROUTES, routeSale } from "./fixtures/sales";

/**
 * A filed power of attorney is the one that was signed. Filing stamped
 * every printed box into form_data.printed and nothing read it: a reprint
 * rebuilt the form from the sale as it stood, so a county corrected after
 * filing changed a signed POA. And the POA and the 130-U resolved "the one
 * county" differently: with no intake county the 130-U filed its city
 * guess (Amarillo became Potter; south Amarillo is Randall) while the POA
 * read only a stored answer and was refused blank.
 */
describe("a filed power of attorney reprints what was signed", () => {
  it("rebuilds the form's fields from the stamp, box for box", () => {
    const fields = poaFieldsFromSale(ROUTES.cashPaid);
    const back = poaFormFieldsFromPrinted(poaProbe(fields))!;
    expect(back).toMatchObject({
      vin: fields.vin,
      year: fields.year,
      make: fields.make,
      model: fields.model,
      licensePlate: fields.licensePlate,
      grantorName: fields.printedName,
      grantorAddress: fields.grantorAddress,
      grantorCity: fields.grantorCity,
      grantorCounty: fields.grantorCounty,
      grantorState: fields.grantorState,
      grantorZip: fields.grantorZip,
    });
    expect(back.grantorNameParts).toEqual({ first: "Avery", middle: "J", last: "Collins", suffix: "Jr" });
    expect(poaFormFieldsFromPrinted(undefined)).toBeNull();
    expect(poaFormFieldsFromPrinted({})).toBeNull();
  });

  it("reprints a stamped copy from its stamp, and only an old copy from the sale", () => {
    const route = readFileSync("src/app/api/documents/agreements/[id]/pdf/route.ts", "utf8");
    const stamp = route.indexOf("poaFormFieldsFromPrinted(form.printed)");
    const live = route.indexOf("new URL('/api/documents/power-of-attorney', req.url)");
    expect(stamp).toBeGreaterThan(-1);
    expect(live).toBeGreaterThan(stamp);
    expect(route).toContain("await fillPowerOfAttorney(signedFields)");
  });

  it("never files the city's guess as the county: the screen offers it, somebody taps it", () => {
    const amarillo = routeSale("amarillo", {
      stepData: {
        buyerId: {
          name: { read: null, confirmed: "Avery J Collins Jr" },
          nameParts: { first: "Avery", middle: "J", last: "Collins", suffix: "Jr" },
          licenseNumber: { read: null, confirmed: "12345678" },
          mailing: { street: "2100 S Polk St", city: "Amarillo", state: "TX", postal: "79109" },
          mailingConfirmed: true,
        },
        paperwork: { form130U: { applicationType: "titleAndRegistration", applicantType: "Individual" } },
      },
    });
    const { context } = paperworkFilingContext(amarillo, "form130U", "");
    expect(paperworkDefault("form130U", "countyOfResidence", context)).toBe("Potter");
    expect(paperworkAnswers("form130U", context).countyOfResidence).toBeUndefined();
    expect(paperworkQuestions("form130U", context).map((question) => question.key)).toContain("countyOfResidence");
    // The power of attorney asks the same question rather than printing a blank county.
    const poa = paperworkFilingContext(amarillo, "powerOfAttorney", "").context;
    expect(paperworkQuestions("powerOfAttorney", poa).map((question) => question.key)).toContain("countyOfResidence");
    expect(missingPrintedFields("form130U", amarillo, { ...paperworkAnswers("form130U", context), salePrice: 9000 })).toContain(
      "19. Applicant County of Residence",
    );
  });

  it("files the county the address geocodes to, and both documents print the one answer", () => {
    const { context } = paperworkFilingContext(ROUTES.noIntakeCounty, "form130U", "");
    expect(paperworkAnswers("form130U", context).countyOfResidence).toBe("Randall");
    expect(poaFieldsFromSale(ROUTES.noIntakeCounty).grantorCounty).toBe("Randall");
    const geocoded = paperworkFilingContext(routeSale("geocoded"), "form130U", "Harris").context;
    expect(paperworkAnswers("form130U", { ...geocoded, intakeCounty: "" }).countyOfResidence).toBe("Harris");
  });
});
