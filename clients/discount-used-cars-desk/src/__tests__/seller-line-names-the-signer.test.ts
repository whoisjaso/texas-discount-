import { describe, expect, it } from "vitest";
import { decodePDFRawStream, PDFDocument, PDFRawStream, PDFRef, StandardFonts, type PDFTextField } from "pdf-lib";
import { fill130U } from "@/lib/fill-130u/fill-pdf";
import { DEALER, FIELD_MAPPINGS, SELLER_NAME_FIELD_ID, type AgreementData } from "@/lib/fill-130u/field-mapping";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import type { CompletedLinkData } from "@/lib/documents/customerPortal";

/**
 * The 130-U seller line: "Legal Name (First Last)".
 *
 * Owner's instruction 10/01/2026, now the SOP's 130-U bullet: county offices
 * no longer accept the entity name alone on the seller line. The person is
 * whoever signed it for the dealer, named as entered at onboarding, and with
 * nobody on record the parentheses print "[Not set: signer name]".
 */

const MARKER = `${DEALER.name} ([Not set: signer name])`;
const sellerMapping = FIELD_MAPPINGS.find((mapping) => mapping.fieldId === SELLER_NAME_FIELD_ID)!;

const sample: AgreementData = {
  vin: "2HGFC2F59GH123456",
  year: "2016",
  make: "Honda",
  model: "Civic",
  body_style: "4D",
  major_color: "Blue",
  odometer: "88000",
  odometer_brand: "A",
  buyer_first_name: "Avery",
  buyer_last_name: "Collins",
  buyer_address: "1 Main St",
  buyer_city: "Houston",
  buyer_state: "TX",
  buyer_zip: "77001",
  buyer_county: "Harris",
  sale_price: 9000,
  sale_date: "2026-10-01",
  applying_for: "title_and_registration",
  applicant_type: "individual",
};

describe("the seller name mapping", () => {
  it("pairs the legal name with the signer", () => {
    expect(sellerMapping.getValue({ ...sample, dealer_signer_name: "Maria Gonzalez" })).toBe(`${DEALER.name} (Maria Gonzalez)`);
  });

  it.each([undefined, null, "", "   "])("prints the marker for %j, never the entity alone", (name) => {
    const value = sellerMapping.getValue({ ...sample, dealer_signer_name: name });
    expect(value).toBe(MARKER);
    expect(value).not.toBe(DEALER.name);
  });
});

/** The text lines drawn into the field's own appearance stream. */
async function appearanceLines(pdf: PDFDocument, field: PDFTextField): Promise<string[]> {
  const ap = field.acroField.getWidgets()[0].getNormalAppearance();
  const stream = ap instanceof PDFRef ? pdf.context.lookup(ap) : ap;
  expect(stream).toBeInstanceOf(PDFRawStream);
  const bytes = decodePDFRawStream(stream as PDFRawStream).decode();
  const content = Buffer.from(bytes).toString("latin1");
  return [...content.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((match) =>
    Buffer.from(match[1], "hex").toString("latin1"),
  );
}

describe("the filled state form", () => {
  const cases = [
    { name: "Al Li", lines: 1 },
    { name: "Maria Gonzalez", lines: 1 },
    { name: undefined, lines: 1 },
    { name: "María Guadalupe Hernández-Villarreal de la Fuente", lines: 2 },
  ];

  it.each(cases)("writes the pairing for $name and keeps it on the paper", async ({ name, lines }) => {
    const data = { ...sample, dealer_signer_name: name };
    const expected = sellerMapping.getValue(data) as string;
    const pdf = await PDFDocument.load(await fill130U(data));
    const field = pdf.getForm().getTextField(SELLER_NAME_FIELD_ID);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const rect = field.acroField.getWidgets()[0].getRectangle();
    // A hair of tolerance: the fitted size is exactly the width cap, and the
    // two sides of that comparison round differently in floating point.
    const usable = rect.width - 4 + 1e-6;

    // The stored value is the one-line pairing, whatever the layout.
    expect(field.getText()).toBe(expected);

    const size = Number((field.acroField.getDefaultAppearance() ?? "").match(/ ([0-9.]+) Tf/)?.[1]);
    expect(size).toBeGreaterThanOrEqual(7.25);
    expect(size).toBeLessThanOrEqual(9.5);

    const drawn = await appearanceLines(pdf, field);
    expect(drawn).toHaveLength(lines);
    if (lines === 1) {
      expect(drawn[0]).toBe(expected);
      expect(font.widthOfTextAtSize(expected, size)).toBeLessThanOrEqual(usable);
    } else {
      expect(size).toBe(7.25);
      expect(drawn.join(" ")).toBe(expected);
      expect(drawn[0]).toBe(DEALER.name);
      expect(drawn[1]).toBe(`(${name})`);
      for (const line of drawn) expect(font.widthOfTextAtSize(line, 7.25)).toBeLessThanOrEqual(usable);
    }
  }, 20_000);

  it("refuses a name the form's font cannot print rather than leaving the box blank", async () => {
    await expect(fill130U({ ...sample, dealer_signer_name: "Nguyễn Văn An" })).rejects.toThrow(/cannot print/);
  });
});

describe("the name read off a filed document", () => {
  const decoded = (dd: Record<string, unknown>, cd: Record<string, unknown> = {}): CompletedLinkData => ({
    s: "form130U",
    dd: { vehicleVin: "2HGFC2F59GH123456", ...dd },
    cd,
  });

  it("comes from the dealer half", () => {
    expect(buildAgreementData(decoded({ dealerSignerName: "Maria Gonzalez" }), {}, null).dealer_signer_name).toBe("Maria Gonzalez");
  });

  it("is never taken from the customer half", () => {
    expect(buildAgreementData(decoded({}, { dealerSignerName: "Someone Else" }), {}, null).dealer_signer_name).toBeUndefined();
    expect(
      buildAgreementData(decoded({ dealerSignerName: "Maria Gonzalez" }, { dealerSignerName: "Someone Else" }), {}, null).dealer_signer_name,
    ).toBe("Maria Gonzalez");
  });
});
