import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fill130U } from "@/lib/fill-130u/fill-pdf";
import { APPLICANT_NAME_FIELD_ID, DEALER, FIELD_MAPPINGS, PREVIOUS_OWNER_FIELD_ID, type AgreementData } from "@/lib/fill-130u/field-mapping";

const sample: AgreementData = {
  vin: "1HGCM82633A004352", year: "2003", make: "Honda", model: "Accord",
  body_style: "Sedan", major_color: "Silver", odometer: "123456",
  buyer_first_name: "", buyer_last_name: "", buyer_address: "100 Example Street",
  buyer_city: "Houston", buyer_state: "TX", buyer_zip: "77001", buyer_county: "Harris",
  sale_price: 5000, sale_date: "2026-09-08", applying_for: "title_and_registration",
  applicant_type: "individual",
};

describe("standalone 130-U input reaches the official PDF", () => {
  it("does not print a purchase price or sale date for non-purchase paperwork", async () => {
    const pdf = await PDFDocument.load(await fill130U({ ...sample, is_purchase: false, sale_price: 0, sale_date: "" }));
    expect(pdf.getForm().getTextField("Sales Price Minus Rebate Amount").getText() ?? "").toBe("");
    expect(pdf.getForm().getTextField("Date").getText() ?? "").toBe("");
  });
  it.each([
    ["business", "Business"], ["government", "Government"],
    ["trust", "Trust"], ["non_profit", "NonProfit"],
  ] as const)("prints a complete %s entity without inventing a personal ID", async (applicantType, checkbox) => {
    const entity = "Example Community Transportation Organization";
    const pdf = await PDFDocument.load(await fill130U({ ...sample,
      applicant_type: applicantType, buyer_entity_name: entity, buyer_dl_number: "12-3456789",
    }));
    const form = pdf.getForm();
    expect(form.getTextField(APPLICANT_NAME_FIELD_ID).getText()).toBe(entity);
    expect(form.getTextField("Applicant Owner").getText()).toBe(entity);
    expect(form.getCheckBox(checkbox).isChecked()).toBe(true);
    expect(form.getCheckBox("Individual").isChecked()).toBe(false);
    expect(form.getCheckBox("U.S. Driver License/ID Card").isChecked()).toBe(false);
    expect(form.getTextField("14 Applicant Photo ID Number or FEINEIN").getText()).toBe("12-3456789");
  });

  it("fills nontitle, alternate vehicle location, and trade VIN but preserves county tax boxes", async () => {
    const pdf = await PDFDocument.load(await fill130U({ ...sample,
      applying_for: "nontitle", vehicle_location_address: "200 Example Avenue",
      vehicle_location_city: "Austin", vehicle_location_state: "TX", vehicle_location_zip: "78701",
      trade_in_amount: 1000, trade_in_description: "2001 Ford", trade_in_vin: "1HGCM82633A004353",
    }));
    const form = pdf.getForm();
    expect(form.getCheckBox("Nontitle Registration").isChecked()).toBe(true);
    expect(form.getCheckBox("Title  Registration").isChecked()).toBe(false);
    expect(form.getTextField("29 Vehicle Location Address if different City State Zip").getText()).toBe("200 Example Avenue, Austin, TX 78701");
    expect(form.getTextField("36 TradeIn if any Year Make Vehicle Identification Number").getText()).toContain("1HGCM82633A004353");
    for (const field of ["Taxable Amount", "6.25% Tax on Taxable Amount", "Amount of Tax and Penalty Due"]) {
      expect(form.getTextField(field).getText() ?? "").toBe("");
    }
  });

  it("keeps the dealer default only when a standalone previous owner was not supplied", () => {
    const owner = FIELD_MAPPINGS.find((entry) => entry.fieldId === PREVIOUS_OWNER_FIELD_ID)!;
    expect(owner.getValue(sample)).toContain(DEALER.name);
    expect(owner.getValue({ ...sample, previous_owner_name: "Example Motors", previous_owner_city: "Austin", previous_owner_state: "TX" })).toBe("Example Motors, Austin, TX");
    expect(owner.getValue({ ...sample, previous_owner_name: "" })).toBe("");
  });
});
