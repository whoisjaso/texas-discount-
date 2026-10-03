import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import VehicleResponsibilityDocument from "@/components/documents/VehicleResponsibilityDocument";
import InsuranceAcknowledgmentDocument from "@/components/documents/InsuranceAcknowledgmentDocument";
import RebuiltDisclosureDocument from "@/components/documents/RebuiltDisclosureDocument";

/**
 * The staff member's signature, drawn once at onboarding, reaches every
 * sheet the desk files.
 *
 * The bill of sale, the contract and the 130-U already drew it. The three
 * acknowledgment sheets received it in their payload (`ds`) and printed a
 * blank dealer line under it anyway. The owner's rule is that the one
 * signature applies to every document, so these render each sheet with a
 * dealer stroke and look for it on the dealer line.
 */

const STROKE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const facts = {
  buyerName: "Ernesto Salinas",
  buyerIdNumber: "50011234",
  buyerPhone: "(713) 555-0190",
  buyerAddress: "2200 Broadway St, Pearland, TX, 77581",
  vehicleDescription: "2011 Ford Flex",
  vin: "1FMHK6D8XBGA12345",
  saleDate: "2026-09-02",
};

function strokes(html: string): number {
  return (html.match(/src="data:image\/png;base64,/g) ?? []).length;
}

describe("the dealer line", () => {
  it("carries the stroke on the vehicle responsibility form", () => {
    const html = renderToStaticMarkup(
      createElement(VehicleResponsibilityDocument, {
        data: { ...facts, quotedRegistrationAmount: 250 },
        dealerSignature: STROKE,
        dealerSignatureDate: "2026-09-02",
      }),
    );
    expect(strokes(html)).toBe(1);
  });

  it("carries the stroke on the insurance acknowledgment", () => {
    const html = renderToStaticMarkup(
      createElement(InsuranceAcknowledgmentDocument, { data: facts, dealerSignature: STROKE }),
    );
    expect(strokes(html)).toBe(1);
  });

  it("carries the stroke on the rebuilt disclosure, beside the buyer's", () => {
    const html = renderToStaticMarkup(
      createElement(RebuiltDisclosureDocument, { data: facts, buyerSignature: STROKE, dealerSignature: STROKE }),
    );
    expect(strokes(html)).toBe(2);
  });

  it("stays a line for ink when no stroke is on file", () => {
    const html = renderToStaticMarkup(createElement(InsuranceAcknowledgmentDocument, { data: facts }));
    expect(strokes(html)).toBe(0);
  });
});

describe("the sheet reader hands the stroke to all three", () => {
  it("passes the dealer signature from the completed link", () => {
    const sheet = readFileSync(join(process.cwd(), "src/components/documents/DocumentSheet.tsx"), "utf8");
    // The three acknowledgments, and the tow-away packet's one component
    // that draws its three sheets: four hand-offs of the dealer's stroke.
    expect(sheet.match(/dealerSignature=\{signatures\.dealerSignature \|\| null\}/g) ?? []).toHaveLength(4);
  });

  it("is the per-person signature, read by the finalize action from the member row", () => {
    const paperwork = readFileSync(join(process.cwd(), "src/lib/actions/paperwork.ts"), "utf8");
    expect(paperwork).toContain("getStaffSignature()");
    expect(paperwork).toContain("dealerSignature: staffSignature");
  });
});
