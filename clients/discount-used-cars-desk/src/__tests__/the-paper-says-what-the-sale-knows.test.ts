import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { DEALER, FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * Two blanks the persona walk found on the paper, and must never find again.
 *
 * The odometer. Start A Sale records the reading onto the vehicle row; the
 * corridor asks only whether the mileage is real. Nothing carried the number
 * from the row to the page, so the bill of sale's federal odometer disclosure
 * printed "___________ miles" under a signed statement that it was true.
 *
 * The applicant. The corridor writes its whole 130-U as dealer data and
 * leaves the customer half of the link empty, because the buyer is at the
 * desk. The state-form filler read the address, county, licence number and
 * phone from the customer half alone, then fell through to agreement
 * columns the corridor never sets. The filed state form had a name and a
 * signature and empty boxes between them.
 */

const sale = {
  id: "d1", status: "active", language: "en", plate: null,
  buyer: { id: "c1", name: "Marcus Reed", phone: "7135550142", email: "m@example.com",
           idNumber: "12345678", idState: "TX", address: "4802 Telephone Rd, Houston, TX 77087" },
  vehicle: { id: "v1", year: 2019, make: "BMW", model: "530i", vin: "WBAJA5C50KB123456",
             salePrice: 28500, bodyStyle: "sedan", titleStatus: "clean",
             mileage: 61000, exteriorColor: "Black Sapphire", trim: "M Sport" },
  documents: {}, registration: null,
  funding: { type: "cash", lenderId: null, lenderOther: null },
  stepData: { buyerId: {
    mailing: { street: "4802 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" },
    name: { read: null, confirmed: "Marcus Reed" },
    licenseNumber: { read: null, confirmed: "12345678" },
  } },
} as unknown as SaleDetail;

/** What the corridor files when nobody retyped anything the sale holds. */
const filed = (type: string, formData: Record<string, unknown> = {}) => {
  const link = corridorCompletedLink(sale, type, formData, "https://x.test");
  const decoded = decodeCompletedLinkFromUrl(link!);
  return { decoded: decoded!, dd: decoded!.dd as Record<string, unknown> };
};

describe("the odometer reading the desk took reaches the paper", () => {
  it("is read off the sale, not asked again", () => {
    const src = readFileSync("src/lib/admin/sale-desk.ts", "utf8");
    expect(src).toMatch(/vehicles\([^)]*\bmileage\b/);
    expect(src).toMatch(/vehicles\([^)]*\bexterior_color\b/);
  });

  it("prints on the bill of sale's federal disclosure", () => {
    const { dd } = filed("billOfSale", { salePrice: 28500, odometerStatus: "actual" });
    expect(dd.odometerReading).toBe("61000");
    expect(dd.vehicleMileage).toBe("61000");
    expect(dd.vehicleColor).toBe("Black Sapphire");
    expect(dd.vehicleTrim).toBe("M Sport");
  });

  it("prints on the financing contract and the title application", () => {
    expect(filed("financing", { salePrice: 28500 }).dd.vehicleMileage).toBe("61000");
    expect(filed("form130U", { salePrice: 28500 }).dd.odometerReading).toBe("61000");
  });

  it("still lets a reading typed on the document win", () => {
    const { dd } = filed("billOfSale", { odometerReading: "61204" });
    expect(dd.odometerReading).toBe("61204");
  });
});

describe("Still To Do on the bill of sale never disclaims the dealer's filing duty", () => {
  const planned = (plan: Record<string, unknown>) =>
    ({ ...sale, stepData: { ...(sale.stepData as object), salePlan: plan } }) as unknown as SaleDetail;
  const outstandingOf = (s: SaleDetail) => {
    const link = corridorCompletedLink(s, "billOfSale", { salePrice: 28500 }, "https://x.test");
    return (decodeCompletedLinkFromUrl(link!)!.dd as { outstanding: Record<string, unknown> }).outstanding;
  };

  it("says we file when the sale says we file", () => {
    expect(outstandingOf(planned({ registrationBy: "dealer", insuranceShown: true, inspectionBy: "done" })))
      .toEqual({ registrationByDealer: true, insuranceShown: true, inspectionByDealer: false, inspectionDone: true });
  });

  it("says we file when nothing was answered, because that is the law's default", () => {
    expect(outstandingOf(sale)).toEqual({ registrationByDealer: true });
  });

  it("names the buyer as the filer only when the sale recorded it", () => {
    expect(outstandingOf(planned({ registrationBy: "buyer", insuranceShown: false, inspectionBy: "buyer" })))
      .toEqual({ registrationByDealer: false, insuranceShown: false, inspectionByDealer: false, inspectionDone: false });
  });

  it("is what the printed page reads, with an absent answer read as ours", () => {
    const preview = readFileSync("src/components/documents/BillOfSalePreview.tsx", "utf8");
    expect(preview).toMatch(/registrationByDealer = outstanding\?\.registrationByDealer !== false/);
    const render = readFileSync("src/components/documents/DocumentSheet.tsx", "utf8");
    expect(render).toMatch(/outstanding=\{/);
  });
});

describe("the state 130-U is filled from the corridor's whole record", () => {
  const { decoded } = filed("form130U", {
    salePrice: 28500, tax: 1781.25, countyOfResidence: "Harris",
    applicationType: "titleAndRegistration", applicantType: "Individual",
  });
  // The corridor never sets the buyer columns the old filler fell back to.
  const form = buildAgreementData(decoded, { buyer_name: "Marcus Reed" }, null);

  it("has the applicant's address, city and ZIP", () => {
    expect(form.buyer_address).toBe("4802 Telephone Rd");
    expect(form.buyer_city).toBe("Houston");
    expect(form.buyer_zip).toBe("77087");
  });

  it("has the county, the licence number and the phone", () => {
    expect(form.buyer_county).toBe("Harris");
    expect(form.buyer_dl_number).toBe("12345678");
    expect(form.buyer_dl_state).toBe("TX");
    expect(form.buyer_phone).toBe("7135550142");
  });

  it("has the car, the reading and the price", () => {
    expect(form.vin).toBe("WBAJA5C50KB123456");
    expect(form.odometer).toBe("61000");
    expect(form.major_color).toBe("Black Sapphire");
    expect(form.sale_price).toBe(28500);
    expect(form.buyer_first_name).toBe("Marcus");
    expect(form.buyer_last_name).toBe("Reed");
  });

  it("names a bank's lien without lending it our address", () => {
    const bank = {
      ...decoded,
      dd: { ...(decoded.dd as Record<string, unknown>), hasLien: true, lienholderName: "Capital One Auto Finance", lienholderAddress: "", lienholderCity: "", lienholderState: "", lienholderZip: "" },
    };
    const lien = buildAgreementData(bank, {}, null);
    expect(lien.has_lien).toBe(true);
    expect(lien.lienholder_name).toBe("Capital One Auto Finance");
    expect(lien.lienholder_address).toBe("");
    // The state form's box 34, as the mapping writes it: the name, and none
    // of the dealership's street, city or ZIP behind it.
    const box34 = FIELD_MAPPINGS.find((m) => m.fieldId.startsWith("34 First Lienholder"));
    const written = box34 && box34.type === "text" ? box34.getValue(lien) ?? "" : "";
    expect(written).toContain("Capital One Auto Finance");
    expect(written).not.toContain(DEALER.address);
    expect(written).not.toContain(DEALER.zip);
    // And the filler draws the five boxes with the same rule.
    const filler = readFileSync("src/lib/fill-130u/fill-pdf.ts", "utf8");
    expect(filler).toMatch(/ours \? DEALER\.address : ''/);
  });

  it("still lets the portal's customer half win over the dealer half", () => {
    const portal = {
      ...decoded,
      cd: { buyerAddress: "12 Elm St", buyerCity: "Katy", buyerZip: "77494", countyOfResidence: "Fort Bend" },
    };
    const filledByBuyer = buildAgreementData(portal, {}, null);
    expect(filledByBuyer.buyer_address).toBe("12 Elm St");
    expect(filledByBuyer.buyer_county).toBe("Fort Bend");
  });
});

describe("box 15 of the 130-U names the kind of photo ID the desk recorded", () => {
  const box = (name: string) => FIELD_MAPPINGS.find((m) => m.fieldId === name)!;
  const tick = (name: string, form: ReturnType<typeof buildAgreementData>) =>
    box(name).type === "checkbox" ? Boolean(box(name).getValue(form)) : null;
  const write = (name: string, form: ReturnType<typeof buildAgreementData>) =>
    box(name).type === "text" ? (box(name).getValue(form) as string | undefined) : null;

  const withId = (buyer: Record<string, unknown>) => {
    // The number the intake screen recorded on the profile, with no later
    // licence-step read to override it.
    const { licenseNumber: _read, ...heldWithoutLicence } = (sale.stepData as { buyerId: Record<string, unknown> }).buyerId;
    void _read;
    const s = {
      ...sale,
      buyer: { ...(sale.buyer as object), ...buyer },
      stepData: { buyerId: heldWithoutLicence },
    } as unknown as SaleDetail;
    const link = corridorCompletedLink(s, "form130U", { salePrice: 28500 }, "https://x.test");
    return buildAgreementData(decodeCompletedLinkFromUrl(link!)!, {}, null);
  };

  it("ticks the licence box and writes the state for a licence", () => {
    const form = withId({ idKind: "stateLicence", idState: "TX" });
    expect(form.buyer_id_kind).toBe("stateLicence");
    expect(tick("U.S. Driver License/ID Card", form)).toBe(true);
    expect(tick("Passport", form)).toBe(false);
    expect(tick("US Military ID", form)).toBe(false);
    expect(write("State of ID/DL", form)).toBe("TX");
    expect(write("Passport Issued", form)).toBeUndefined();
  });

  it("ticks the passport box, names the country, and leaves the state line blank", () => {
    // A Mexican passport filed as a Texas licence with a passport number in
    // it was what every buyer without a licence got.
    const form = withId({ idKind: "passport", idState: "MX", idNumber: "G12345678" });
    expect(form.buyer_dl_number).toBe("G12345678");
    expect(tick("U.S. Driver License/ID Card", form)).toBe(false);
    expect(tick("Passport", form)).toBe(true);
    expect(write("Passport Issued", form)).toBe("Mexico");
    expect(write("State of ID/DL", form)).toBeUndefined();
  });

  it("ticks the military box for a military ID", () => {
    const form = withId({ idKind: "militaryId", idState: null, idNumber: "1234567890" });
    expect(tick("US Military ID", form)).toBe(true);
    expect(tick("U.S. Driver License/ID Card", form)).toBe(false);
    expect(write("State of ID/DL", form)).toBeUndefined();
  });

  it("reads a record from before the question as a Texas licence", () => {
    const form = withId({ idKind: null, idState: null });
    expect(tick("U.S. Driver License/ID Card", form)).toBe(true);
    expect(write("State of ID/DL", form)).toBe("TX");
  });

  it("never lends a passport a Texas state", () => {
    const s = { ...sale, buyer: { ...(sale.buyer as object), idKind: "passport", idState: null } } as unknown as SaleDetail;
    const link = corridorCompletedLink(s, "form130U", { salePrice: 28500 }, "https://x.test");
    const dd = decodeCompletedLinkFromUrl(link!)!.dd as Record<string, unknown>;
    expect(dd.buyerIdKind).toBe("passport");
    expect(dd.buyerLicenseState).toBe("");
  });

  it("is what the intake screen sends and the profile keeps", () => {
    const intake = readFileSync("src/components/admin/StartSale.tsx", "utf8");
    expect(intake).toMatch(/buyerIdKind:\s*idKind/);
    expect(intake).toMatch(/name="buyerIdCountry"/);
    const action = readFileSync("src/lib/actions/start-sale.ts", "utf8");
    expect(action).toMatch(/capturedProfile\.buyerIdKind\s*=/);
    const render = readFileSync("src/components/documents/DocumentSheet.tsx", "utf8");
    expect(render).not.toMatch(/applicantIdType:\s*docData\.buyerLicense \? 'DL'/);
  });
});
