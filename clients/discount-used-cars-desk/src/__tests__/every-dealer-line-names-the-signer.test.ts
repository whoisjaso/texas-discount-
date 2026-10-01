import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import { brand, missingDealerFacts } from "@/lib/dealership-config";
import { DEALER } from "@/lib/fill-130u/field-mapping";
import BillOfSalePreview from "@/components/documents/BillOfSalePreview";
import ContractPreview from "@/components/documents/ContractPreview";
import Form130UPreview from "@/components/documents/Form130UPreview";
import VehicleResponsibilityDocument from "@/components/documents/VehicleResponsibilityDocument";
import InsuranceAcknowledgmentDocument from "@/components/documents/InsuranceAcknowledgmentDocument";
import RebuiltDisclosureDocument from "@/components/documents/RebuiltDisclosureDocument";
import SalvageSaleDocument from "@/components/documents/SalvageSaleDocument";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import type { BillOfSaleData } from "@/lib/documents/billOfSale";
import type { ContractData } from "@/lib/documents/finance";
import type { Form130UData } from "@/lib/documents/form130U";

/**
 * The filing member's name rides with the document and prints under every
 * dealer line as "Legal Name (First Last)" (owner's instruction 10/01/2026;
 * SOP "First sign-in: onboarding": the name prints "in parentheses on the
 * 130-U and under the dealer signature lines").
 */

afterEach(() => vi.unstubAllEnvs());

const sale = {
  id: "d1", status: "active", language: "en", plate: null, plateAsked: false,
  buyer: { id: "c1", name: "Marcus Reed", phone: "7135550142", email: "m@example.com",
           idNumber: "12345678", idState: "TX", address: "4802 Telephone Rd, Houston, TX 77087" },
  vehicle: { id: "v1", year: 2019, make: "BMW", model: "530i", vin: "WBAJA5C50KB123456",
             salePrice: 28500, bodyStyle: "sedan", titleStatus: "clean", mileage: 61000 },
  documents: {}, registration: null,
  funding: { type: "cash", lenderId: null, lenderOther: null },
  stepData: { buyerId: {
    mailing: { street: "4802 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" },
    name: { read: null, confirmed: "Marcus Reed" },
    licenseNumber: { read: null, confirmed: "12345678" },
  } },
} as unknown as SaleDetail;

describe("the name rides in the completed link", () => {
  it.each(["form130U", "billOfSale", "financing", "insuranceAcknowledgment", "salvageBillOfSale"])(
    "in the dealer half of the %s",
    (documentType) => {
      const url = corridorCompletedLink(sale, documentType, { salePrice: 28500 }, "https://x.test", {
        dealerSignature: "data:image/png;base64,STROKE",
        dealerSignatureDate: "2026-10-01",
        dealerSignerName: "Maria Gonzalez",
      })!;
      const decoded = decodeCompletedLinkFromUrl(url)!;
      expect(decoded.dd.dealerSignerName).toBe("Maria Gonzalez");
      expect(decoded.cd.dealerSignerName).toBeUndefined();
    },
  );

  it("is left off when nobody is named, so the sheet prints as it always did", () => {
    const url = corridorCompletedLink(sale, "billOfSale", {}, "https://x.test", { dealerSignerName: "   " })!;
    expect(decodeCompletedLinkFromUrl(url)!.dd).not.toHaveProperty("dealerSignerName");
  });

  it("survives the signing ceremony's re-encoding", () => {
    const filed = decodeCompletedLinkFromUrl(
      corridorCompletedLink(sale, "form130U", {}, "https://x.test", {
        dealerSignature: "data:image/png;base64,STROKE",
        dealerSignatureDate: "2026-10-01",
        dealerSignerName: "Maria Gonzalez",
      })!,
    )!;
    // The same call packet-signing.ts makes when the buyer signs.
    const signed = decodeCompletedLinkFromUrl(
      encodeCompletedLink(filed.s, filed.dd, filed.cd ?? {}, "https://x.test", filed.ds, filed.dsd, "data:image/png;base64,BUYER", "2026-10-01"),
    )!;
    expect(signed.dd.dealerSignerName).toBe("Maria Gonzalez");
    expect(signed.ds).toBe("data:image/png;base64,STROKE");
  });
});

describe("filing asks for the person who signs", () => {
  const PAPERWORK = readFileSync(join(process.cwd(), "src/lib/actions/paperwork.ts"), "utf8");

  it("refuses an unnamed or uncleared filer before anything is read or written", () => {
    const gate = PAPERWORK.indexOf("dealerSignerProblem(");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(PAPERWORK.indexOf("getSaleDetail(dealId)"));
    expect(gate).toBeLessThan(PAPERWORK.indexOf('.from("document_agreements")'));
  });

  it("puts the name in the link beside the stroke, which is still the filer's own", () => {
    expect(PAPERWORK).toContain("dealerSignerName,");
    expect(PAPERWORK).toContain("getStaffSignature()");
    expect(PAPERWORK).toContain("dealerSignature: staffSignature");
  });

  it("no longer asks the config for an authorised signer", () => {
    expect(missingDealerFacts()).not.toContain("Authorised signer");
  });

  it("still names every other missing fact", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEALER_SIGNER_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_DEALER_DOC_FEE", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    vi.resetModules();
    const config = await import("@/lib/dealership-config");
    const missing = config.missingDealerFacts();
    expect(missing).toEqual(["Documentary fee", "Desk address"]);
    vi.resetModules();
  });
});

/** Every dealer-authored sheet, rendered with and without the name. */
function sheets(dealerSignerName?: string): Array<[string, ReactElement]> {
  const facts = {
    buyerName: "Ernesto Salinas",
    buyerIdNumber: "50011234",
    buyerPhone: "(713) 555-0190",
    buyerAddress: "2200 Broadway St, Pearland, TX, 77581",
    vehicleDescription: "2011 Ford Flex",
    vin: "1FMHK6D8XBGA12345",
    saleDate: "2026-10-01",
  };
  const bill = {
    saleDate: "2026-10-01", buyerName: "Ernesto Salinas", buyerAddress: "2200 Broadway St", buyerCity: "Pearland",
    buyerState: "TX", buyerZip: "77581", buyerPhone: "", buyerEmail: "", buyerLicense: "", buyerLicenseState: "TX",
    vehicleYear: "2011", vehicleMake: "Ford", vehicleModel: "Flex", vehicleVin: "1FMHK6D8XBGA12345",
    vehicleMileage: "120000", odometerStatus: "actual", salePrice: 6000, tradeInAllowance: 0, tradeInPayoff: 0,
    tax: 375, titleFee: 33, docFee: 292, registrationFee: 75, otherFees: 0, paymentMethod: "Cash",
    paymentMethodOther: "", conditionType: "as_is", amountPaidToday: 6775,
  } as unknown as BillOfSaleData;
  const contract = {
    contractDate: "2026-10-01", stockNumber: "", buyerName: "Ernesto Salinas", buyerAddress: "2200 Broadway St",
    buyerPhone: "", buyerEmail: "", coBuyerName: "", coBuyerAddress: "", coBuyerPhone: "", coBuyerEmail: "",
    vehicleYear: "2011", vehicleMake: "Ford", vehicleModel: "Flex", vehicleVin: "1FMHK6D8XBGA12345",
    vehiclePlate: "", vehicleMileage: "120000", cashPrice: 6000, downPayment: 1000, tax: 375, titleFee: 33,
    registrationFee: 75, docFee: 292, apr: 18, numberOfPayments: 24, paymentFrequency: "Monthly",
    firstPaymentDate: "2026-11-01", dueAtSigning: 1000,
  } as ContractData;
  const signatures = {} as never;
  const salvage = {
    ...facts, vehicleYear: "2011", vehicleMake: "Ford", vehicleModel: "Flex", vehicleMileage: "120000",
    odometerStatus: "actual" as const, salePrice: 1500, tax: 93.75, titleFee: 33, docFee: 292, total: 1918.75,
    amountPaidToday: 1918.75, paymentMethod: "Cash", howLeaving: "towTruck" as const, salvageLicense: "", titleOriginState: "TX",
  };
  return [
    ["bill of sale", createElement(BillOfSalePreview, { data: bill, signatures, dealerSignerName })],
    ["financing contract", createElement(ContractPreview, { data: contract, signatures, dealerSignerName })],
    ["vehicle responsibility", createElement(VehicleResponsibilityDocument, { data: { ...facts, quotedRegistrationAmount: 500 }, dealerSignerName })],
    ["insurance acknowledgment", createElement(InsuranceAcknowledgmentDocument, { data: facts, dealerSignerName })],
    ["rebuilt disclosure", createElement(RebuiltDisclosureDocument, { data: facts, dealerSignerName })],
    ["salvage bill of sale", createElement(SalvageSaleDocument, { sheet: "salvageBillOfSale", data: salvage, dealerSignerName })],
    ["tow-away acknowledgment", createElement(SalvageSaleDocument, { sheet: "towAwayAcknowledgment", data: salvage, dealerSignerName })],
    ["buyer responsibility statement", createElement(SalvageSaleDocument, { sheet: "buyerResponsibilityStatement", data: salvage, dealerSignerName })],
  ];
}

const count = (html: string, text: string) => html.split(text).length - 1;

describe("every dealer line prints the pairing", () => {
  it.each(sheets("Maria Gonzalez"))("on the %s, exactly once", (_name, element) => {
    const html = renderToStaticMarkup(element);
    expect(count(html, `${brand.legal} (Maria Gonzalez)`)).toBe(1);
  });

  it.each(sheets())("and the %s filed before it existed prints as it did", (_name, element) => {
    const html = renderToStaticMarkup(element);
    expect(html).not.toContain(" (Maria");
    expect(html).not.toContain("[Not set: signer name]");
  });
});

describe("the HTML 130-U on screen", () => {
  const data = { applicantType: "Individual", applicantFirstName: "Avery", applicantLastName: "Collins" } as unknown as Form130UData;

  it("pairs the legal name with the signer and never puts the licence in the parentheses", () => {
    const html = renderToStaticMarkup(createElement(Form130UPreview, { data, signatures: {} as never, sellerSignerName: "Maria Gonzalez" }));
    expect(html).toContain(`${DEALER.name} (Maria Gonzalez)`);
    expect(html).not.toContain(`(${DEALER.gdn})`);
  });

  it("prints the marker when nobody is named", () => {
    const html = renderToStaticMarkup(createElement(Form130UPreview, { data, signatures: {} as never }));
    expect(html).toContain(`${DEALER.name} ([Not set: signer name])`);
  });
});
