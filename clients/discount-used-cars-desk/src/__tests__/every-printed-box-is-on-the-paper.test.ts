import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { fieldMapFor, printedFields } from "@/lib/documents/field-maps";
import { displayValue } from "@/lib/documents/field-maps/resolve";
import { probe } from "@/lib/documents/field-maps/probes";
import { ROUTES, filedFormData, owedDocuments } from "./fixtures/sales";

/**
 * The map and the paper agree in both directions.
 *
 * Payload coverage held only that every key the corridor writes is a map
 * id. A map box the renderer never prints (the bill of sale's "Full Or
 * Limited") passed, and figures the sheet works out and prints (the
 * contract's finance charge, amount financed and total of payments; the
 * bill's total due and net trade-in) were on no map and no read-back. So:
 *
 *   each printed box of a designed sheet is named in its renderer's source;
 *   each printed money box's figure is on the rendered sheet;
 *   each dollar figure on the bill of sale's money and acknowledgment is a
 *   mapped box's figure.
 */
const RENDERERS: Record<string, string[]> = {
  // With the helpers each sheet reads its lien and its figures through.
  billOfSale: ["src/components/documents/BillOfSalePreview.tsx", "src/lib/documents/billOfSale.ts"],
  financing: ["src/components/documents/ContractPreview.tsx", "src/lib/documents/finance.ts"],
  vehicleResponsibility: ["src/components/documents/VehicleResponsibilityDocument.tsx", "src/components/documents/DocumentSheet.tsx"],
  insuranceAcknowledgment: ["src/components/documents/InsuranceAcknowledgmentDocument.tsx", "src/components/documents/DocumentSheet.tsx"],
  salvageBillOfSale: ["src/components/documents/SalvageSaleDocument.tsx", "src/components/documents/DocumentSheet.tsx"],
  towAwayAcknowledgment: ["src/components/documents/SalvageSaleDocument.tsx", "src/components/documents/DocumentSheet.tsx"],
  buyerResponsibilityStatement: ["src/components/documents/SalvageSaleDocument.tsx", "src/components/documents/DocumentSheet.tsx"],
};

/** Ids the renderer prints under a name of its own, with the name it uses. */
const PRINTED_AS: Record<string, string> = {
  docFeeNotice: "DocFeeNotice",
  docFeeNoticeSpanish: "DocFeeNotice",
  cashPriceSubtotal: "itemCashPriceSubtotal",
  feesAndTax: "feesSubtotal",
  totalAmountDue: "totalDue",
  buyerSignatureDate: "signatureDate",
  dealerSignatureDate: "signatureDate",
};

const MONEY = /^(salePrice|cashPrice|tax|titleFee|docFee|registrationFee|tradeInAllowance|amountPaidToday|sellerLienAmount|downPayment|total|totalAmountDue|feesAndTax|totalPaid|financedByLender|cashPriceSubtotal|balanceAfterTrade|amountFinanced|totalOfPayments|financeCharge|netTradeIn|quotedRegistrationAmount|balanceOwed)$/;

describe("every printed box is on the paper", () => {
  for (const [type, files] of Object.entries(RENDERERS)) {
    it(`${type}: every printed box is named in its renderer`, () => {
      const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
      const unnamed = printedFields(fieldMapFor(type)!)
        .map((field) => field.id)
        .filter((id) => !source.includes(PRINTED_AS[id] ?? id));
      expect(unnamed, type).toEqual([]);
    });
  }

  for (const [route, sale] of Object.entries(ROUTES)) {
    for (const type of owedDocuments(sale).filter((doc) => doc in RENDERERS)) {
      it(`${route}: ${type} prints every mapped figure`, () => {
        const formData = filedFormData(type, sale);
        const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, formData, "https://x.test")!)!;
        const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
        const printed = probe(type, sale, formData)!;
        for (const field of printedFields(fieldMapFor(type)!)) {
          if (!MONEY.test(field.id)) continue;
          const value = displayValue(field.id, printed[field.id]);
          if (!value || value === "$0.00") continue;
          expect(markup.includes(value), `${route} ${type}.${field.id} ${value}`).toBe(true);
        }
      });
    }
  }

  for (const route of ["cashBalance", "bhphTrade", "bankTypedLender", "buyerFilesNoInsurance"] as const) {
    it(`${route}: every dollar figure in the bill of sale's money and acknowledgment is a mapped box`, () => {
      const sale = ROUTES[route];
      const formData = filedFormData("billOfSale", sale);
      const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "billOfSale", formData, "https://x.test")!)!;
      const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
      const printed = probe("billOfSale", sale, formData)!;
      const mapped = new Set(printedFields(fieldMapFor("billOfSale")!).map((field) => displayValue(field.id, printed[field.id])));
      // The money section and the acknowledgment, where the sale's figures print.
      const money = markup.slice(markup.indexOf("bos-money"), markup.indexOf("bos-condition"));
      const ack = markup.slice(markup.indexOf("bos-ack-money"), markup.indexOf("bos-ack-copy"));
      const figures = [...`${money}${ack}`.matchAll(/\$[\d,]+\.\d{2}/g)].map((match) => match[0]);
      expect(figures.length).toBeGreaterThan(3);
      for (const figure of figures) expect(mapped.has(figure) || figure === "$0.00", `${route}: ${figure}`).toBe(true);
    });
  }
});
