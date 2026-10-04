import { describe, expect, it } from "vitest";
import { missingPrintedFields } from "@/lib/documents/field-maps/resolve";
import { BILL_OF_SALE_MAP } from "@/lib/documents/field-maps/bill-of-sale";
import { FORM_130U_MAP } from "@/lib/documents/field-maps/form-130u";
import { allFields } from "@/lib/documents/field-maps";
import { ROUTES, filedFormData, routeSale } from "./fixtures/sales";

/**
 * A box printed "only on some sales" used to say which sales in words that
 * nothing read, so a box that becomes required once its condition holds was
 * never refused: a business 130-U filed with Business ticked and the
 * person's licence number in the FEIN box, and a warranty bill of sale filed
 * with a blank warranty line while the Buyers Guide marked DEALER WARRANTY
 * with neither FULL nor LIMITED. The conditions are predicates now, and a
 * box whose condition holds is as required as a "never" box.
 */
const WALKED = { odometerStatus: "actual", paymentMethod: "Zelle", tradeIn: "no", conditionType: "as_is" };

describe("a box the sale requires is refused blank", () => {
  it("a business applicant with no name or FEIN", () => {
    const sale = routeSale("business-blank", {
      stepData: {
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { billOfSale: WALKED, form130U: { applicationType: "titleAndRegistration", applicantType: "Business", renewalReminders: "no" } },
      },
    });
    const missing = missingPrintedFields("form130U", sale, filedFormData("form130U", sale));
    expect(missing).toEqual(expect.arrayContaining(["14. FEIN/EIN", "16. Entity Name"]));
    expect(missingPrintedFields("form130U", ROUTES.business, filedFormData("form130U", ROUTES.business))).toEqual([]);
  });

  it("a warranty with no kind, period or systems, on the bill of sale and the Buyers Guide", () => {
    const sale = routeSale("warranty-blank", {
      stepData: {
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { billOfSale: { ...WALKED, conditionType: "warranty" } },
      },
    });
    expect(missingPrintedFields("billOfSale", sale, filedFormData("billOfSale", sale))).toEqual(
      expect.arrayContaining(["Warranty Period", "Coverage", "Full Or Limited Warranty"]),
    );
    expect(missingPrintedFields("buyersGuide", sale, {})).toEqual(
      expect.arrayContaining(["FULL WARRANTY Or LIMITED WARRANTY (the one ticked)", "SYSTEMS COVERED", "DURATION"]),
    );
    expect(missingPrintedFields("billOfSale", ROUTES.warranty, filedFormData("billOfSale", ROUTES.warranty))).toEqual([]);
    expect(missingPrintedFields("buyersGuide", ROUTES.warranty, {})).toEqual([]);
  });

  it("a limited warranty with no shares of labor and parts", () => {
    const sale = routeSale("limited-blank", {
      stepData: {
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: {
          billOfSale: { ...WALKED, conditionType: "warranty", warrantyKind: "limited", warrantySystems: "engine", warrantyDuration: "30 days" },
        },
      },
    });
    expect(missingPrintedFields("billOfSale", sale, filedFormData("billOfSale", sale))).toEqual(
      expect.arrayContaining(["Share Of Labor The Dealer Pays", "Share Of Parts The Dealer Pays"]),
    );
  });

  it("a trade-in with no description", () => {
    const sale = routeSale("trade-blank", {
      stepData: {
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { billOfSale: { ...WALKED, tradeIn: "yes", tradeInAllowance: "1000" } },
      },
    });
    expect(missingPrintedFields("billOfSale", sale, filedFormData("billOfSale", sale))).toContain("Trade-In Vehicle: Description");
  });

  it("states each such condition as a predicate the filing acts on", () => {
    for (const id of ["tradeInDescription", "tradeInAllowance", "warrantyDuration", "warrantyDescription", "warrantyKind"]) {
      const field = allFields(BILL_OF_SALE_MAP).find((entry) => entry.id === id)!;
      expect(typeof field.blank === "object" && "when" in field.blank && typeof field.blank.test, id).toBe("function");
    }
    for (const id of ["buyer_entity_name", "buyer_fein", "co_buyer_name"]) {
      expect(typeof allFields(FORM_130U_MAP).find((entry) => entry.id === id)?.on, id).toBe("function");
    }
  });
});
