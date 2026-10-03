import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { missingPrintedFields, readBack } from "@/lib/documents/field-maps/resolve";
import { readCoBuyer, writeCoBuyer } from "@/lib/sales/co-buyer";
import { ROUTES, filedFormData, routeSale } from "./fixtures/sales";

/**
 * Start A Sale has always offered "Add a co-buyer". The name went onto the
 * buyer's customer record, which nothing read, and every document set the
 * co-buyer's boxes to "" (verify: "Marco Ruiz" typed in both Spanish runs
 * reached no paper). The name is kept on the sale and printed on the bill
 * of sale, the contract and the 130-U's box 17; the co-buyer signs, and
 * writes their own details, in ink beside it (D-02).
 */
const withCoBuyer = (base: typeof ROUTES.cashPaid) =>
  ({ ...base, stepData: writeCoBuyer(base.stepData, { name: "marco ruiz" }) }) as typeof base;

const decode = (sale: typeof ROUTES.cashPaid, type: string) =>
  decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, filedFormData(type, sale), "https://x.test")!)!;

describe("the co-buyer named at intake is on the paper", () => {
  it("is kept on the sale, not on the buyer's customer record", () => {
    const stepData = writeCoBuyer({}, { name: " Marco Ruiz " });
    expect(readCoBuyer(stepData)).toEqual({ name: "Marco Ruiz" });
    expect(writeCoBuyer(stepData, { name: "" })).not.toHaveProperty("coBuyer");
    const intake = readFileSync("src/lib/actions/start-sale.ts", "utf8");
    expect(intake).toMatch(/stepData = writeCoBuyer\(stepData, \{ name: input\.coBuyerName \?\? "" \}\);/);
  });

  it("prints the name, with an ink signature line, on the bill of sale", () => {
    const sale = withCoBuyer(ROUTES.cashPaid);
    const decoded = decode(sale, "billOfSale");
    expect(decoded.dd.coBuyerName).toBe("Marco Ruiz");
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
    expect(markup).toContain("Co-Buyer Information");
    expect(markup).toContain("Marco Ruiz");
    expect(markup).toMatch(/Co-Buyer Signature/i);
  });

  it("prints the name on the contract", () => {
    const sale = withCoBuyer(ROUTES.bhphTrade);
    const decoded = decode(sale, "financing");
    expect(decoded.dd.coBuyerName).toBe("Marco Ruiz");
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
    expect(markup).toContain('data-co-buyer=""');
    expect(markup).toContain("Marco Ruiz");
  });

  it("prints the name in box 17 and on the additional applicant's line of the 130-U", () => {
    const sale = withCoBuyer(ROUTES.cashPaid);
    const data = buildAgreementData(decode(sale, "form130U"), {}, null);
    expect(data.co_buyer_name).toBe("Marco Ruiz");
    expect(FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "Additional Applicant")?.getValue(data)).toBe("Marco Ruiz");
  });

  it("reads the co-buyer back only on a sale that has one, the details left for ink", () => {
    const sale = withCoBuyer(ROUTES.cashPaid);
    const rows = readBack("billOfSale", sale, filedFormData("billOfSale", sale)).flatMap((page) => page.rows);
    const row = (id: string) => rows.find((entry) => entry.id === id);
    expect(row("coBuyerName")).toMatchObject({ value: "Marco Ruiz", status: "filled" });
    expect(row("coBuyerAddress")?.status).toBe("ink");
    expect(row("coBuyerLicense")?.status).toBe("ink");
    expect(missingPrintedFields("billOfSale", sale, filedFormData("billOfSale", sale))).toEqual([]);
    const none = readBack("billOfSale", ROUTES.cashPaid, filedFormData("billOfSale", ROUTES.cashPaid)).flatMap((page) => page.rows);
    expect(none.some((entry) => entry.id.startsWith("coBuyer"))).toBe(false);
  });

  it("is still only one sale's fact: a sale with no co-buyer prints none", () => {
    expect(decode(routeSale("solo"), "billOfSale").dd.coBuyerName).toBe("");
  });
});
