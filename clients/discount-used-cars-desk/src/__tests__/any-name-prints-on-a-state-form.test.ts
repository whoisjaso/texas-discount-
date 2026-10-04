import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { fill130U } from "@/lib/fill-130u/fill-pdf";
import { fillVtr61 } from "@/lib/fill-vtr61/fill-pdf";
import { fillPowerOfAttorney } from "@/lib/documents/powerOfAttorneyForm";
import { fillOfficialRebuiltDisclosure } from "@/lib/documents/official-rebuilt-disclosure";
import { poaFieldsFromSale } from "@/lib/documents/poa-fields";
import { printsInHelvetica, readUnicodeFont } from "@/lib/pdf/unicode-text";
import { ROUTES, filedFormData, routeSale } from "./fixtures/sales";

/**
 * A buyer named "Nguyễn Văn An" or "Łukasz Wójcik" could not be printed on
 * a state form: Helvetica's WinAnsi encoding has no "ễ" or "Ł", pdf-lib
 * threw while measuring the name, and the 130-U, the VTR-271, the VTR-61
 * and the rebuilt disclosure all failed to render. The fillers now embed a
 * Unicode face only for such a value; a name Helvetica can print fills
 * exactly as before.
 */

const NAMES = [
  { full: "Nguyễn Văn An", parts: { first: "An", middle: "Văn", last: "Nguyễn", suffix: "" } },
  { full: "Łukasz Wójcik", parts: { first: "Łukasz", middle: "", last: "Wójcik", suffix: "" } },
];

function saleNamed(name: (typeof NAMES)[number]) {
  return routeSale(`unicode-${name.parts.first}`, {
    buyer: { name: name.full },
    vehicle: { titleStatus: "rebuilt_salvage" },
    stepData: {
      buyerId: {
        name: { read: null, confirmed: name.full },
        nameParts: name.parts,
        licenseNumber: { read: "12345678", confirmed: "12345678" },
        mailing: { street: "8810 Coronation Dr", city: "Houston", state: "TX", postal: "77034", county: "Harris" },
        mailingConfirmed: true,
      },
      money: { amount: "7000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: (ROUTES.cashPaid.stepData as { paperwork: unknown }).paperwork,
    },
  });
}

/** The base font names a PDF embeds. */
async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  const names: string[] = [];
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    const dict = object as { get?: (key: unknown) => unknown; lookup?: unknown };
    if (typeof dict.get !== "function") continue;
    const text = String(object);
    const match = /\/BaseFont \/([A-Za-z0-9+_-]+)/.exec(text);
    if (match && /\/Type \/Font/.test(text)) names.push(match[1]);
  }
  return names;
}

async function pageText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

describe("any name prints on a state form", () => {
  it("knows which names Helvetica cannot print", () => {
    expect(printsInHelvetica("Lucía Hernández", "José Peña")).toBe(true);
    expect(printsInHelvetica("Nguyễn Văn An")).toBe(false);
    expect(printsInHelvetica("Łukasz Wójcik")).toBe(false);
  });

  for (const name of NAMES) {
    it(`fills the 130-U for ${name.full} with the name in the owner boxes`, async () => {
      const sale = saleNamed(name);
      const link = corridorCompletedLink(sale, "form130U", filedFormData("form130U", sale), "https://x.test")!;
      const data = buildAgreementData(decodeCompletedLinkFromUrl(link)!, {}, null);
      const bytes = await fill130U(data);
      const form = (await PDFDocument.load(bytes)).getForm();
      const values = form.getFields().map((field) => ("getText" in field ? (field as { getText(): string | undefined }).getText() ?? "" : ""));
      expect(values.join(" | ")).toContain(name.parts.last);
      expect((await fontNames(bytes)).some((font) => /DejaVu/.test(font))).toBe(true);
    }, 30000);

    it(`fills the VTR-271 for ${name.full}, the printed name built from the same parts`, async () => {
      const fields = poaFieldsFromSale(saleNamed(name));
      expect(fields.printedName).toBe([name.parts.first, name.parts.middle, name.parts.last].filter(Boolean).join(" "));
      const bytes = await fillPowerOfAttorney(fields);
      const form = (await PDFDocument.load(bytes, { throwOnInvalidObject: false })).getForm();
      expect(form.getTextField("Printed Name").getText()).toBe(fields.printedName);
      expect((await fontNames(bytes)).some((font) => /DejaVu/.test(font))).toBe(true);
    }, 30000);

    it(`fills the VTR-61 with ${name.full} as the owner`, async () => {
      const bytes = await fillVtr61({
        vin: "1G1ZD5ST8MF345678", year: 2021, make: "Chevrolet", model: "Malibu", bodyStyle: "Sedan",
        ownerName: name.full, dealerSignerName: "Maria Gonzalez",
      });
      const form = (await PDFDocument.load(bytes)).getForm();
      const values = form.getFields().map((field) => ("getText" in field ? (field as { getText(): string | undefined }).getText() ?? "" : ""));
      expect(values).toContain(name.full);
    }, 30000);

    it(`fills the state's rebuilt disclosure with ${name.full} on the name line`, async () => {
      const source = new Uint8Array(readFileSync(join(process.cwd(), "public", "forms", "ENF-MV-RBLT-DSCLMR.pdf")));
      const bytes = await fillOfficialRebuiltDisclosure(source, { year: "2021", make: "Chevrolet", vin: "1G1ZD5ST8MF345678", buyerName: name.full }, readUnicodeFont);
      expect((await fontNames(bytes)).some((font) => /DejaVu/.test(font))).toBe(true);
      expect(await pageText(bytes)).toContain(name.parts.last);
    }, 30000);
  }

  it("keeps Helvetica, and no second font, when every value is WinAnsi", async () => {
    const source = new Uint8Array(readFileSync(join(process.cwd(), "public", "forms", "ENF-MV-RBLT-DSCLMR.pdf")));
    const bytes = await fillOfficialRebuiltDisclosure(source, { year: "2021", make: "Chevrolet", vin: "1G1ZD5ST8MF345678", buyerName: "Lucía Hernández" }, readUnicodeFont);
    const fonts = await fontNames(bytes);
    expect(fonts.some((font) => /DejaVu/.test(font))).toBe(false);
    expect(fonts).toContain("Helvetica");

    const sale = ROUTES.spanish;
    const link = corridorCompletedLink(sale, "form130U", filedFormData("form130U", sale), "https://x.test")!;
    const filled = await fill130U(buildAgreementData(decodeCompletedLinkFromUrl(link)!, {}, null));
    expect((await fontNames(filled)).some((font) => /DejaVu/.test(font))).toBe(false);
  }, 30000);

  it("keeps the browser's preview of the state page free of Node built-ins", () => {
    // OfficialRebuiltDisclosureDocument fills the state page in the browser:
    // a Node import in its filler breaks the client bundle.
    for (const file of ["src/lib/documents/official-rebuilt-disclosure.ts", "src/lib/pdf/unicode-font.ts"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(/from "node:|require\("node:|from "fs"|from "path"|unicode-text"/);
    }
  });
});
