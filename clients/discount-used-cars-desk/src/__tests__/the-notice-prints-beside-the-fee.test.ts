import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The documentary fee notice prints beside the fee (Tex. Fin. Code
 * §348.006(c)(3); rulebook texas-dealer-fees.md 1.2 and 5.5): on the bill of
 * sale and the salvage bill of sale, cash sales included, and as clause 16 of
 * the contract, word for word, with the approved Spanish notice beside it on a
 * Spanish sale. Only on a copy stamped at filing: a copy filed before the
 * notice existed re-renders exactly as it was filed. The posted notice prints
 * in both languages.
 */

vi.mock("@/lib/admin/current-admin", () => ({
  getCurrentAdminAccess: async () => ({ user: { id: "u1" }, role: "sales", member: null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import BillOfSalePreview from "@/components/documents/BillOfSalePreview";
import SalvageSaleDocument from "@/components/documents/SalvageSaleDocument";
import ContractPreview from "@/components/documents/ContractPreview";
import DocFeeNoticePage from "@/app/admin/dealership/fees/notice/page";
import { DOC_FEE_NOTICE_EN, DOC_FEE_NOTICE_ES, DOC_FEE_NOTICE_VERSION } from "@/lib/legal/doc-fee-notice";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import type { BillOfSaleData } from "@/lib/documents/billOfSale";
import type { ContractData } from "@/lib/documents/finance";
import type { SalvageSaleData } from "@/lib/documents/salvageSale";
import type { SaleDetail } from "@/lib/admin/sale-desk";

const OLD_CLAUSE =
  "A DOCUMENTARY FEE IS NOT REQUIRED BY LAW BUT MAY BE CHARGED TO BUYERS FOR HANDLING DOCUMENTS RELATING TO THE SALE. A DOCUMENTARY FEE MAY NOT EXCEED A REASONABLE AMOUNT AGREED TO BY THE PARTIES.";

const bill = {
  saleDate: "2026-10-03", buyerName: "Andrea Salinas", buyerAddress: "7400 Metz St", buyerCity: "Houston", buyerState: "TX",
  buyerZip: "77012", buyerPhone: "", buyerEmail: "", buyerLicense: "12345678", buyerLicenseState: "TX",
  vehicleYear: "2017", vehicleMake: "Ford", vehicleModel: "Explorer", vehicleVin: "1FM5K8D80HGA00001", vehicleMileage: "88000",
  odometerStatus: "actual", salePrice: 9000, tradeInAllowance: 0, tradeInPayoff: 0, tax: 562.5, titleFee: 33, docFee: 150,
  registrationFee: 75, otherFees: 0, otherFeesDescription: "", paymentMethod: "Cash", paymentMethodOther: "", conditionType: "as_is",
  amountPaidToday: 9820.5,
} as unknown as BillOfSaleData;

const html = (element: ReactElement) => renderToStaticMarkup(element);
const drawBill = (data: Partial<BillOfSaleData>) =>
  html(createElement(BillOfSalePreview, { data: { ...bill, ...data } as BillOfSaleData, signatures: {} as never }));

describe("the bill of sale", () => {
  it("prints the exact notice directly under the documentary fee, on a cash sale", () => {
    const page = drawBill({ docFeeNotice: DOC_FEE_NOTICE_VERSION });
    expect(page).toContain(DOC_FEE_NOTICE_EN);
    const fee = page.indexOf("c. Documentary Fee");
    const notice = page.indexOf(DOC_FEE_NOTICE_EN);
    const registration = page.indexOf("d. Registration Fee");
    expect(fee).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(fee);
    expect(registration).toBeGreaterThan(notice);
    // In bold capitals, by its own class (globals.css .bos-doc-fee-notice).
    expect(page).toMatch(/class="bos-doc-fee-notice"/);
    expect(page).not.toContain(DOC_FEE_NOTICE_ES);
  });

  it("adds the approved Spanish notice on a Spanish sale", () => {
    const page = drawBill({ docFeeNotice: DOC_FEE_NOTICE_VERSION, docFeeNoticeSpanish: true });
    expect(page).toContain(DOC_FEE_NOTICE_EN);
    expect(page).toContain(DOC_FEE_NOTICE_ES);
  });

  it("prints a copy filed before the notice exactly as it was filed", () => {
    const page = drawBill({});
    expect(page).not.toContain(DOC_FEE_NOTICE_EN);
    expect(page).not.toContain("bos-doc-fee-notice");
  });
});

describe("the salvage bill of sale", () => {
  const salvage: SalvageSaleData = {
    buyerName: "Andrea Salinas", buyerIdNumber: "12345678", buyerPhone: "", buyerAddress: "7400 Metz St, Houston, TX, 77012",
    vehicleDescription: "2017 Ford Explorer", vin: "1FM5K8D80HGA00001", saleDate: "2026-10-03", vehicleMileage: "88000",
    odometerStatus: "actual", salePrice: 2500, tax: 156.25, titleFee: 33, docFee: 150, total: 2839.25, amountPaidToday: 2839.25,
    paymentMethod: "Cash", howLeaving: "towTruck", salvageLicense: "", titleOriginState: "",
  };

  it("prints the notice beside its fee, and both languages on the Spanish sheet", () => {
    const en = html(createElement(SalvageSaleDocument, { sheet: "salvageBillOfSale", data: { ...salvage, docFeeNotice: 1 } }));
    expect(en).toContain(DOC_FEE_NOTICE_EN);
    expect(en).not.toContain(DOC_FEE_NOTICE_ES);
    const es = html(createElement(SalvageSaleDocument, { sheet: "salvageBillOfSale", data: { ...salvage, docFeeNotice: 1 }, language: "es" }));
    expect(es).toContain(DOC_FEE_NOTICE_EN);
    expect(es).toContain(DOC_FEE_NOTICE_ES);
  });

  it("prints nothing new on an unstamped copy or on the other tow-away sheets", () => {
    expect(html(createElement(SalvageSaleDocument, { sheet: "salvageBillOfSale", data: salvage }))).not.toContain(DOC_FEE_NOTICE_EN);
    expect(html(createElement(SalvageSaleDocument, { sheet: "towAwayAcknowledgment", data: { ...salvage, docFeeNotice: 1 } }))).not.toContain(
      DOC_FEE_NOTICE_EN,
    );
  });
});

describe("the contract", () => {
  const contract = {
    contractDate: "2026-10-03", buyerName: "Andrea Salinas", buyerAddress: "7400 Metz St", buyerPhone: "", buyerEmail: "",
    coBuyerName: "", coBuyerAddress: "", coBuyerPhone: "", coBuyerEmail: "", vehicleYear: "2017", vehicleMake: "Ford",
    vehicleModel: "Explorer", vehicleVin: "1FM5K8D80HGA00001", vehiclePlate: "", vehicleMileage: "88000", cashPrice: 9000,
    tradeInAllowance: 0, downPayment: 2000, tax: 562.5, titleFee: 33, registrationFee: 75, docFee: 150, apr: 18,
    numberOfPayments: 24, paymentFrequency: "Monthly", firstPaymentDate: "2026-11-03", dueAtSigning: 2000,
  } as unknown as ContractData;

  it("prints clause 16 as the exact constant", () => {
    const page = html(createElement(ContractPreview, { data: { ...contract, docFeeNotice: 1 }, signatures: {} as never }));
    expect(page).toContain("16. DOCUMENTARY FEE:");
    expect(page).toContain(DOC_FEE_NOTICE_EN);
    expect(page).not.toContain(OLD_CLAUSE);
    expect(page).not.toContain(DOC_FEE_NOTICE_ES);
    const spanish = html(createElement(ContractPreview, { data: { ...contract, docFeeNotice: 1, docFeeNoticeSpanish: true }, signatures: {} as never }));
    expect(spanish).toContain(DOC_FEE_NOTICE_ES);
  });

  it("prints a copy filed before the notice exactly as it was filed", () => {
    const page = html(createElement(ContractPreview, { data: contract, signatures: {} as never }));
    expect(page).toContain(OLD_CLAUSE);
    expect(page).not.toContain(DOC_FEE_NOTICE_EN);
  });
});

describe("the filing stamps it", () => {
  const sale = (language: string) =>
    ({
      id: "d1", status: "in_progress", language, plate: null, plateAsked: false,
      buyer: { id: "c1", name: "Andrea Salinas", phone: "7135550188", email: null, idNumber: "12345678", idState: "TX", idKind: "stateLicence", address: "7400 Metz St" },
      vehicle: { id: "v1", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", salePrice: 9000, bodyStyle: "SUV", titleStatus: "clean", mileage: 88000 },
      documents: {}, registration: null, funding: { type: "cash", lenderId: null, lenderOther: null }, stepData: {},
    }) as unknown as SaleDetail;
  const stamped = (type: string, language = "en") => {
    const link = corridorCompletedLink(sale(language), type, { salePrice: 9000, docFee: 150, titleFee: 33 }, "https://x.test");
    return decodeCompletedLinkFromUrl(link!)!.dd as Record<string, unknown>;
  };

  it("on the bill of sale, the salvage bill of sale and the contract, with the sale's language", () => {
    for (const type of ["billOfSale", "salvageBillOfSale", "financing"]) {
      expect(stamped(type), type).toMatchObject({ docFeeNotice: DOC_FEE_NOTICE_VERSION, docFeeNoticeSpanish: false });
      expect(stamped(type, "es"), type).toMatchObject({ docFeeNotice: DOC_FEE_NOTICE_VERSION, docFeeNoticeSpanish: true });
    }
    expect(stamped("towAwayAcknowledgment")).not.toHaveProperty("docFeeNotice");
  });
});

describe("the posted notice", () => {
  it("prints both languages, word for word, for anyone who reads sales", async () => {
    const page = html((await DocFeeNoticePage()) as ReactElement);
    expect(page).toContain(DOC_FEE_NOTICE_EN);
    expect(page).toContain(DOC_FEE_NOTICE_ES);
    expect(page).toContain("§348.006(c)(3)(B), (d)");
  });
});
