import { describe, expect, it } from "vitest";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * The review said the dealer's printed-name line would be blank ("Not set
 * by the owner") while the filed copy printed "Discount Used Cars And
 * Trucks, LLC (Maria Lopez)": the review never passed the signing member.
 * The 130-U's seller name, with the marker inside it, read as filled. The
 * review now reads the dealer line with the filer's name and stroke, and a
 * marker anywhere in a value is a marker.
 */
const STROKE = "data:image/png;base64,iVBORw0KGgo=";

const row = (type: string, id: string, options: Parameters<typeof readBack>[3]) =>
  readBack(type, ROUTES.bhphTrade, filedFormData(type, ROUTES.bhphTrade), options)
    .flatMap((page) => page.rows)
    .find((entry) => entry.id === id);

describe("the review prints the filer's name", () => {
  for (const type of ["billOfSale", "financing"]) {
    it(`${type}: the dealer line is the signing member's, as it files`, () => {
      const options = { dealerSignerName: "Maria Lopez", dealerSignature: STROKE, dealerSignatureDate: "2026-10-03" };
      expect(row(type, "dealerSignerName", options)).toMatchObject({ value: "Maria Lopez", status: "filled" });
      expect(row(type, "dealerSignature", options)).toMatchObject({ value: "Signed", status: "filled" });
    });
  }

  it("130-U: the seller's printed name carries the member, and its marker reads as a marker without one", () => {
    expect(row("form130U", "dealer_signer_name", { dealerSignerName: "Maria Lopez" })?.value).toMatch(/\(Maria Lopez\)$/);
    expect(row("form130U", "dealer_signer_name", { dealerSignerName: "Maria Lopez" })?.status).toBe("filled");
    const unsigned = row("form130U", "dealer_signer_name", {});
    expect(unsigned?.value).toContain("[Not set:");
    expect(unsigned?.status).toBe("marker");
  });
});
