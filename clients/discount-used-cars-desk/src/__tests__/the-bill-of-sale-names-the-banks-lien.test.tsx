// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import BillOfSalePreview from "@/components/documents/BillOfSalePreview";
import type { BillOfSaleData } from "@/lib/documents/billOfSale";

/**
 * A lender-funded bill of sale used to say "Financing" and stop, while the
 * 130-U filed the same day put the bank in box 34. The buyer signs one
 * sheet and the state records another; they should say the same thing.
 */

const base = {
  saleDate: "2026-09-17",
  buyerName: "Jordan Example",
  buyerAddress: "1 Main St",
  buyerCity: "Houston",
  buyerState: "TX",
  buyerZip: "77001",
  buyerPhone: "",
  buyerEmail: "",
  buyerLicense: "",
  buyerLicenseState: "TX",
  vehicleYear: "2019",
  vehicleMake: "Toyota",
  vehicleModel: "Camry",
  vehicleVin: "4T1B11HK0KU123456",
  vehicleMileage: "65000",
  odometerStatus: "actual",
  salePrice: 14500,
  tradeInAllowance: 0,
  tradeInPayoff: 0,
  tax: 906.25,
  titleFee: 33,
  docFee: 292,
  registrationFee: 75,
  otherFees: 0,
  paymentMethod: "Financing",
  paymentMethodOther: "Credit Acceptance",
  conditionType: "as_is",
  amountPaidToday: 2000,
} as unknown as BillOfSaleData;

const draw = (data: BillOfSaleData) =>
  render(<BillOfSalePreview data={data} signatures={{} as never} />).container.textContent ?? "";

describe("the bill of sale names the bank's lien", () => {
  it("prints the lender as lienholder when the deal carries the bank's lien", () => {
    const text = draw({
      ...base,
      titleLienholderName: "Credit Acceptance",
      titleLienholderCity: "Southfield",
      titleLienholderState: "MI",
      titleLienReason: "Purchase money financed by Credit Acceptance",
    });
    expect(text).toContain("Lien on Title");
    expect(text).toContain("Credit Acceptance");
    expect(text).toContain("Southfield, MI");
    expect(text).toContain("Lien on title acknowledged");
    // The lender's lien is never described as the seller's.
    expect(text).not.toContain("Seller Lien / Balance Owed");
  });

  it("prints no lien section on a deal that carries none", () => {
    const text = draw({ ...base, paymentMethod: "Cash", paymentMethodOther: "" } as BillOfSaleData);
    expect(text).not.toContain("Lien on Title");
    expect(text).not.toContain("Lien on title acknowledged");
  });
});
