import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillOfSalePreview, {
  emptyAcknowledgments,
} from "@/components/documents/BillOfSalePreview";
import type { BillOfSaleData } from "@/lib/documents/billOfSale";
import { getDocStrings } from "@/lib/documents/i18n";
import type { SignatureData } from "@/lib/documents/shared";

const data: BillOfSaleData = {
  saleDate: "2026-08-29",
  stockNumber: "JJ-530",
  buyerName: "Marcus Reed",
  buyerAddress: "4107 Almeda Road",
  buyerCity: "Houston",
  buyerState: "TX",
  buyerZip: "77004",
  buyerPhone: "713-555-0184",
  buyerEmail: "marcus.reed@example.com",
  buyerLicense: "TX1234567",
  buyerLicenseState: "TX",
  coBuyerName: "Elena Reed",
  coBuyerAddress: "4107 Almeda Road",
  coBuyerCity: "Houston",
  coBuyerState: "TX",
  coBuyerZip: "77004",
  coBuyerPhone: "713-555-0127",
  coBuyerEmail: "elena.reed@example.com",
  coBuyerLicense: "TX7654321",
  coBuyerLicenseState: "TX",
  vehicleYear: "2019",
  vehicleMake: "BMW",
  vehicleModel: "530i",
  vehicleTrim: "xDrive",
  vehicleVin: "WBAJA7C50KWW12345",
  vehiclePlate: "TXJ530",
  vehicleColor: "Black",
  vehicleBodyStyle: "Sedan",
  vehicleMileage: "62500",
  odometerReading: "62500",
  odometerStatus: "actual",
  salePrice: 28_950,
  tradeInAllowance: 4_000,
  tradeInDescription: "2015 Honda Accord LX",
  tradeInVin: "1HGCR2F35FA123456",
  tradeInPayoff: 1_250,
  tax: 1_809.38,
  titleFee: 33,
  docFee: 292,
  registrationFee: 75,
  otherFees: 0,
  otherFeesDescription: "",
  paymentMethod: "Cash",
  paymentMethodOther: "",
  conditionType: "as_is",
  warrantyDuration: "",
  warrantyDescription: "",
  sellerLienEnabled: true,
  sellerLienAmount: 1_200,
  sellerLienReason:
    "Unpaid title, registration, tax office, or buyer balance advanced by seller",
  sellerLienDate: "2026-08-29",
  sellerLienDueDate: "2026-09-12",
};

const signatures: SignatureData = {
  buyerIdPhoto: "",
  buyerSignature: "data:image/png;base64,BUYER",
  buyerSignatureDate: "",
  coBuyerSignature: "data:image/png;base64,COBUYER",
  coBuyerSignatureDate: "",
  dealerSignature: "data:image/png;base64,DEALER",
  dealerSignatureDate: "",
};

function renderBillOfSale(
  locale: "en" | "es" = "en",
  overrides: Partial<BillOfSaleData> = {},
) {
  return renderToStaticMarkup(
    createElement(BillOfSalePreview, {
      data: { ...data, ...overrides },
      signatures,
      acknowledgments: emptyAcknowledgments,
      strings: getDocStrings(locale),
      smsConsent: true,
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("bill of sale print composition", () => {
  it("places the acknowledgment before the one buyer signature and fills today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00-05:00"));

    const markup = renderBillOfSale();
    const agreement =
      "By signing below, all parties acknowledge and agree to the terms and Buyer Acknowledgment set forth above.";

    expect(markup.indexOf("Buyer Acknowledgment")).toBeLessThan(
      markup.indexOf(agreement),
    );
    expect(markup.match(/>Buyer Signature</g)).toHaveLength(1);
    expect(markup.match(/alt="Buyer Signature"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /signature-date[^>]*>08\/29\/2026<\/span>[\s\S]*?>Buyer Signature</,
    );
  });

  it("keeps the protected terms and acknowledgments while removing unrelated records", () => {
    const markup = renderBillOfSale();

    expect(markup).toContain("THE VEHICLE IS SOLD &quot;AS IS.&quot;");
    expect(markup).toContain("Federal Odometer Disclosure Statement");
    expect(markup).toContain("TRANSFER OF TITLE:");
    expect(markup).toContain("I have inspected the vehicle and accept it in its present condition.");
    expect(markup).toContain("Balance secured by seller lien");
    expect(markup).not.toContain("SMS COMMUNICATIONS CONSENT");
    expect(markup).not.toContain("Buyer Plate Receipt / Dealer Copy Record");
    expect(markup).not.toContain("Audit Trail");
  });

  it("uses the bill of sale signing agreement in Spanish", () => {
    const markup = renderBillOfSale("es");

    expect(markup).toContain(
      "Al firmar a continuación, todas las partes reconocen y aceptan los términos y el Reconocimiento del Comprador establecidos anteriormente.",
    );
    expect(markup.indexOf("Reconocimiento del Comprador")).toBeLessThan(
      markup.indexOf("Al firmar a continuación"),
    );
    expect(markup).toContain("Gravamen del Vendedor / Saldo Adeudado");
    expect(markup).toContain("Saldo del gravamen del vendedor reconocido");
    expect(markup).not.toContain("Seller Lien / Balance Owed");
    expect(markup).not.toContain("Balance secured by seller lien");
    expect(markup).toContain(
      "Título, registro, trámite en la oficina de impuestos o saldo del comprador pendiente adelantado por el vendedor",
    );
    expect(markup).not.toContain(
      "Unpaid title, registration, tax office, or buyer balance advanced by seller",
    );

    const customReason = renderBillOfSale("es", {
      sellerLienReason: "Custom reason entered for this sale",
    });
    expect(customReason).toContain("Custom reason entered for this sale");
  });
});
