import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { allFields, fieldMapFor } from "@/lib/documents/field-maps";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * Where a map says a box comes from is where the paper reads it.
 *
 *   the late-handling fee   the dealer's own figure, not a fee-schedule
 *                           line, and its stamped total is what reprints
 *   the complaints contact  the desk's own "Sales Office" until the owner
 *                           answers (D-01), never "from your dealership"
 *   the quoted registration the money step's worked-out cost, not a typed
 *                           answer
 *   a 130-U's state         no "TX" added to a mailing address with none
 */
describe("the sources the maps name are the ones the paper reads", () => {
  it("names the late-handling fee as the dealer's, and reprints the stamped total", () => {
    const fee = allFields(fieldMapFor("vehicleResponsibility")!).find((field) => field.id === "lateHandlingFee");
    expect(fee?.source).toEqual({ from: "dealer", fact: "lateHandlingFee" });
    const sale = ROUTES.buyerFilesNoInsurance;
    const decoded = decodeCompletedLinkFromUrl(
      corridorCompletedLink(sale, "vehicleResponsibility", filedFormData("vehicleResponsibility", sale), "https://x.test")!,
    )!;
    const stamped = { ...decoded, dd: { ...decoded.dd, lateHandlingFee: 50, lateHandlingTotal: 1234.56 } };
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded: stamped }));
    expect(markup).toContain("$1,234.56");
  });

  it("reads the complaints contact back as the form's words, not an owner fact", () => {
    const row = readBack("buyersGuide", ROUTES.cashPaid, {})
      .flatMap((page) => page.rows)
      .find((entry) => entry.id === "complaintsContact");
    expect(row?.value).toBe("Sales Office");
    expect(row?.source).toBe("static");
  });

  it("names the quoted registration as worked out on every sheet that carries it", () => {
    for (const type of ["vehicleResponsibility", "insuranceAcknowledgment", "rebuiltDisclosure"]) {
      const field = allFields(fieldMapFor(type)!).find((entry) => entry.id === "quotedRegistrationAmount");
      expect(field?.source.from, type).toBe("computed");
    }
  });

  it("adds no TX to a stamped 130-U whose mailing address has no state, and keeps it on an old copy", () => {
    const sale = {
      ...ROUTES.cashPaid,
      stepData: {
        ...(ROUTES.cashPaid.stepData as Record<string, unknown>),
        buyerId: {
          ...((ROUTES.cashPaid.stepData as { buyerId: Record<string, unknown> }).buyerId),
          mailing: { street: "8810 Coronation Dr", city: "Houston", state: "", postal: "77034", county: "Harris" },
        },
      },
    } as typeof ROUTES.cashPaid;
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "form130U", filedFormData("form130U", sale), "https://x.test")!)!;
    expect(buildAgreementData(decoded, {}, null).buyer_state).toBe("");
    const { pageLayout: _stamp, ...old } = decoded.dd as Record<string, unknown>;
    void _stamp;
    expect(buildAgreementData({ ...decoded, dd: old }, {}, null).buyer_state).toBe("TX");
  });
});
