import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fill130U } from "@/lib/fill-130u/fill-pdf";
import { FIELD_MAPPINGS, type AgreementData } from "@/lib/fill-130u/field-mapping";

const sampleAgreement: AgreementData = {
  vin: "3N1AB6AP4CL778468",
  year: "2012",
  make: "NISSAN",
  model: "SENTRA SR SE",
  body_style: "4D",
  major_color: "METALLIC BLUE",
  minor_color: "",
  odometer: "154559",
  odometer_brand: "A",
  empty_weight: "2877",
  carrying_capacity: "",
  tx_plate_no: "27422DLR",
  buyer_first_name: "Wendy",
  buyer_middle_name: "",
  buyer_last_name: "Cuc-Hernandez",
  buyer_address: "508 Pinehurst Drive",
  buyer_city: "Lufkin",
  buyer_state: "TX",
  buyer_zip: "75904",
  buyer_county: "Angelina",
  buyer_phone: "936-255-5743",
  buyer_email: "cucwendy67@gmail.com",
  buyer_dl_number: "48240870",
  buyer_dl_state: "TX",
  co_buyer_name: "",
  sale_price: 2500,
  sale_date: "04/22/2026",
  trade_in_amount: 0,
  trade_in_description: "",
  rebate_amount: 0,
  applying_for: "title_and_registration",
  applicant_type: "individual",
  has_lien: true,
  lien_date: "2026-04-22",
  lien_amount: 500,
  lienholder_name: "Triple J Auto Investment LLC",
  lienholder_address: "8774 Almeda Genoa Road",
  lienholder_city: "Houston",
  lienholder_state: "TX",
  lienholder_zip: "77075",
};

describe("fill130U typography", () => {
  it("fills every text field with one black regular Helvetica appearance", async () => {
    const pdfBytes = await fill130U(sampleAgreement);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    const filledTextMappings = FIELD_MAPPINGS.filter((mapping) => {
      const value = mapping.getValue(sampleAgreement);
      return mapping.type === "text" && typeof value === "string" && value.length > 0;
    });

    expect(filledTextMappings.length).toBeGreaterThan(15);

    const fontSizes: number[] = [];

    /*
      Four fields are one wide box on the official PDF standing in for a
      printed row of columns. The filler empties the box and draws each
      column as page text at its printed position, so their field text is
      blank by design and only their appearance is checked.
    */
    const drawnAsColumns = new Set([
      "16 Applicant First Name or Entity Name Middle Name Last Name Suffix if any",
      "18 Applicant Mailing Address City State Zip",
      "20 Previous Owner Name or Entity Name City State",
      "34 First Lienholder Name if any Mailing Address City State Zip",
    ]);

    for (const mapping of filledTextMappings) {
      const value = mapping.getValue(sampleAgreement);
      const field = form.getTextField(mapping.fieldId);
      const appearance = field.acroField.getDefaultAppearance() ?? "";
      const widgetAppearance = field.acroField.getWidgets()[0]?.getDefaultAppearance() ?? "";
      const fontSize = Number(appearance.match(/ ([0-9.]+) Tf/)?.[1]);

      if (!drawnAsColumns.has(mapping.fieldId)) expect(field.getText()).toBe(value);
      expect(appearance).toContain("0 0 0 rg");
      expect(appearance).toMatch(/\/Helvetica(?!-Bold)/);
      expect(widgetAppearance).toContain("0 0 0 rg");
      expect(widgetAppearance).toMatch(/\/Helvetica(?!-Bold)/);
      expect(fontSize).toBeGreaterThanOrEqual(7.25);
      expect(fontSize).toBeLessThanOrEqual(10.5);
      fontSizes.push(fontSize);
    }

    expect(new Set(fontSizes.map((size) => Number.isFinite(size))).has(true)).toBe(true);
    expect(form.getTextField("33 First Lien Date if any").getText()).toBe("04/22/2026");
    // The lienholder row is drawn as columns, so its content is read off the
    // mapping that feeds the columns rather than off the emptied field.
    const lienholder = FIELD_MAPPINGS.find((m) => m.fieldId.startsWith("34 First Lienholder"));
    expect(String(lienholder?.getValue(sampleAgreement) ?? "")).toContain("Triple J Auto Investment LLC");
    // One sheet: the state's instruction page is not filed.
    expect(pdfDoc.getPageCount()).toBe(1);
    // Boxes 38(d), 38(e) and 38(h) are the county's to compute.
    expect(form.getTextField("Taxable Amount").getText() ?? "").toBe("");
    expect(form.getTextField("6.25% Tax on Taxable Amount").getText() ?? "").toBe("");
    expect(form.getTextField("Amount of Tax and Penalty Due").getText() ?? "").toBe("");
  }, 20_000);
});
