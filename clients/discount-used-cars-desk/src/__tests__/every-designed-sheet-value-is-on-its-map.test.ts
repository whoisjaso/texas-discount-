import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { allFields, fieldMapFor } from "@/lib/documents/field-maps";
import { ROUTES, filedFormData, owedDocuments } from "./fixtures/sales";

/**
 * Every value the corridor writes into a designed sheet's payload is a box
 * on that sheet's map, printed or carried with its reason. A key nobody
 * mapped is a value nobody can say the source of.
 */
const DESIGNED = new Set([
  "billOfSale",
  "financing",
  "vehicleResponsibility",
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  "salvageBillOfSale",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
]);

describe("every payload key is on its sheet's map", () => {
  for (const [route, sale] of Object.entries(ROUTES)) {
    for (const documentType of owedDocuments(sale).filter((type) => DESIGNED.has(type))) {
      it(`${route}: ${documentType}`, () => {
        const link = corridorCompletedLink(sale, documentType, filedFormData(documentType, sale), "https://x.test", {
          dealerSignerName: "Maria Lopez",
        });
        const keys = Object.keys(decodeCompletedLinkFromUrl(link!)!.dd);
        const ids = new Set(allFields(fieldMapFor(documentType)!).map((field) => field.id));
        expect(keys.filter((key) => !ids.has(key))).toEqual([]);
      });
    }
  }
});
