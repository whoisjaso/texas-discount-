import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { dealership } from "@/lib/dealership-config";
import { fillPowerOfAttorney } from "@/lib/documents/powerOfAttorneyForm";
import { poaFieldsFromSale, poaProbe } from "@/lib/documents/poa-fields";
import { missingPrintedFields, readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, routeSale } from "./fixtures/sales";

/**
 * The VTR-271 used to print the vehicle row's plate (not the sale's), the
 * whole mailing line in the street box ("8810 Coronation Dr, Houston, Tx
 * 77034, Houston, Harris, TX 77034"), the public trade name as grantee, and
 * a Printed Name from a different string than the name boxes. One builder
 * now gives every box one source.
 */
describe("the power of attorney reads the sale", () => {
  const fields = poaFieldsFromSale(ROUTES.cashPaid);

  it("prints the sale's plate as Texas plates are written", () => {
    expect(fields.licensePlate).toBe("TX 27422DLR");
    expect(poaFieldsFromSale(routeSale("no-plate", { plate: null })).licensePlate).toBe("");
  });

  it("puts the street alone in the street box, and city, county, state and ZIP in theirs", () => {
    expect(fields.grantorAddress).toBe("8810 Coronation Dr");
    expect(fields).toMatchObject({ grantorCity: "Houston", grantorCounty: "Harris", grantorState: "TX", grantorZip: "77034" });
  });

  it("takes the county the 130-U answered over the intake's", () => {
    const sale = routeSale("county", {
      stepData: { paperwork: { form130U: { countyOfResidence: "Fort Bend" } } },
    });
    expect(poaFieldsFromSale(sale).grantorCounty).toBe("Fort Bend");
  });

  it("names the licensed entity as grantee, at the dealership's address", () => {
    expect(fields.granteeName).toBe(dealership.legalName ?? dealership.name);
    expect(fields.granteeAddress).toBe(dealership.address.street);
    expect(fields.granteeCity).toBe(dealership.address.locality);
    expect(fields.granteeZip).toBe(dealership.address.postalCode);
  });

  it("builds the Printed Name from the parts the name boxes print", () => {
    expect(fields.printedName).toBe("Avery J Collins Jr");
    expect(fields.grantorNameParts).toEqual({ first: "Avery", middle: "J", last: "Collins", suffix: "Jr" });
    const probe = poaProbe(fields);
    expect([probe.grantorFirst, probe.grantorMiddle, probe.grantorLast, probe.grantorSuffix].join(" ")).toBe(probe.printedName);
  });

  it("fills the state form with those values, box by box", async () => {
    const bytes = await fillPowerOfAttorney(fields);
    const form = (await PDFDocument.load(bytes, { throwOnInvalidObject: false })).getForm();
    expect(form.getTextField("License Plate State and Number if any").getText()).toBe("TX 27422DLR");
    expect(form.getTextField("Address").getText()).toBe("8810 Coronation Dr");
    expect(form.getTextField("Printed Name").getText()).toBe("Avery J Collins Jr");
    expect(form.getTextField("Address_2").getText()).toBe(dealership.address.street);
  }, 30000);

  it("reads the page back with every printed box filled, the date and signature left for ink", () => {
    expect(missingPrintedFields("powerOfAttorney", ROUTES.cashPaid, {})).toEqual([]);
    const rows = readBack("powerOfAttorney", ROUTES.cashPaid, {}).flatMap((page) => page.rows);
    const row = (id: string) => rows.find((entry) => entry.id === id);
    expect(row("licensePlate")?.value).toBe("TX 27422DLR");
    expect(row("printedName")?.value).toBe("Avery J Collins Jr");
    expect(row("executedDate")?.status).toBe("ink");
  });

  it("refuses by name a grantor with no county anywhere", () => {
    const sale = routeSale("no-county", {
      stepData: {
        buyerId: {
          ...(ROUTES.cashPaid.stepData as { buyerId: Record<string, unknown> }).buyerId,
          mailing: { street: "8810 Coronation Dr", city: "Houston", state: "TX", postal: "77034" },
        },
      },
    });
    expect(missingPrintedFields("powerOfAttorney", sale, {})).toContain("Grantor: County");
  });
});
