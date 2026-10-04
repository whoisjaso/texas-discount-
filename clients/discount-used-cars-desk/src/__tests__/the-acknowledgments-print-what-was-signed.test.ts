import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, type CompletedLinkData } from "@/lib/documents/customerPortal";
import { brand, dealerFees } from "@/lib/dealership-config";
import { idNumberLine } from "@/lib/forms/id-document";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { unansweredSwornFacts } from "@/lib/sales/paperwork";
import { ROUTES, filedFormData, routeSale } from "./fixtures/sales";

/**
 * The acknowledgment sheets print what the buyer signed to: the ID with
 * what it is and who issued it, the late-handling fee as it stood on the
 * day, how a tow-away car leaves (asked, never assumed), the title's state
 * of origin (Texas unless recorded otherwise, never the lot's state), and
 * the licensed entity's name on the footer.
 */

const decodeOf = (sale: typeof ROUTES.cashPaid, type: string, formData = filedFormData(type, sale)) =>
  decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, formData, "https://x.test")!)!;
const html = (decoded: CompletedLinkData) => renderToStaticMarkup(createElement(DocumentSheet, { decoded }));

const fees = dealerFees as { lateHandlingFee: number | null };
const before = fees.lateHandlingFee;
afterEach(() => {
  fees.lateHandlingFee = before;
});

describe("the ID line says what the ID is", () => {
  it("names the kind and the issuer beside the number, in the sheet's language", () => {
    expect(idNumberLine("12345678", "stateLicence", "tx")).toBe("12345678 (Driver Licence, TX)");
    expect(idNumberLine("G1234567", "passport", "MEX")).toMatch(/^G1234567 \(Passport, /);
    expect(idNumberLine("12345678", "stateLicence", "TX", "es")).toBe("12345678 (Licencia de conducir, TX)");
    expect(idNumberLine("", "stateLicence", "TX")).toBe("");
  });

  it("prints it on a sheet filed with the ID's kind, and the number alone on one filed before", () => {
    const decoded = decodeOf(ROUTES.cashPaid, "insuranceAcknowledgment");
    expect(decoded.dd.buyerIdKind).toBe("stateLicence");
    expect(html(decoded)).toContain("12345678 (Driver Licence, TX)");
    const { buyerIdKind: _kind, buyerIdIssuer: _issuer, ...old } = decoded.dd;
    void _kind;
    void _issuer;
    const oldMarkup = html({ ...decoded, dd: old });
    expect(oldMarkup).toContain("12345678");
    expect(oldMarkup).not.toContain("(Driver Licence, TX)");
  });
});

describe("the late-handling fee is the one the buyer signed to", () => {
  it("is stamped at filing and printed from the stamp after the dealer's figure changes", () => {
    fees.lateHandlingFee = 75;
    const sale = ROUTES.buyerFilesNoInsurance;
    const decoded = decodeOf(sale, "vehicleResponsibility");
    expect(decoded.dd.lateHandlingFee).toBe(75);
    expect(decoded.dd.lateHandlingTotal).toBe(Math.round((Number(decoded.dd.quotedRegistrationAmount) + 75) * 100) / 100);
    fees.lateHandlingFee = 125;
    const markup = html(decoded);
    expect(markup).toContain("$75.00");
    expect(markup).not.toContain("$125.00");
  });

  it("is not stamped while the dealer has not set one, and the copy prints the marker", () => {
    fees.lateHandlingFee = null;
    const decoded = decodeOf(ROUTES.buyerFilesNoInsurance, "vehicleResponsibility");
    expect("lateHandlingFee" in decoded.dd).toBe(false);
    expect(html(decoded)).toContain("[Not set: late-handling fee]");
  });
});

describe("a tow-away sale", () => {
  it("asks how the car leaves, and will not file until it is answered", () => {
    const sale = routeSale("tow-unanswered", {
      vehicle: { titleStatus: "salvage_unrebuilt" },
      plate: null,
      stepData: {
        salvagePlan: { path: "towAway" },
        salePlan: {},
        money: { amount: "2500", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { salvageBillOfSale: { odometerStatus: "actual", paymentMethod: "Cash" } },
      },
    });
    const { context } = paperworkFilingContext(sale, "salvageBillOfSale", "Harris");
    expect(unansweredSwornFacts("salvageBillOfSale", context).map((fact) => fact.key)).toContain("howLeaving");
    const answered = paperworkFilingContext(ROUTES.towAway, "salvageBillOfSale", "Harris").context;
    expect(unansweredSwornFacts("salvageBillOfSale", answered).map((fact) => fact.key)).not.toContain("howLeaving");
  });

  it("prints a Texas title as TX when no other state is recorded, and the legal name on the footer", () => {
    for (const type of ["salvageBillOfSale", "towAwayAcknowledgment", "buyerResponsibilityStatement"]) {
      const decoded = decodeOf(ROUTES.towAway, type);
      expect(decoded.dd.titleOriginState).toBe("TX");
      expect(decoded.dd.howLeaving).toBe("flatbed");
      const markup = html(decoded);
      expect(markup).toContain(brand.legal);
      expect(markup).toContain("12345678 (Driver Licence, TX)");
    }
  });
});
