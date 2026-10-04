import { describe, expect, it } from "vitest";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { paperworkQuestions } from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { ROUTES, filedFormData, owedDocuments } from "./fixtures/sales";

/**
 * A Change or Fix It link on the review opens the question it names. A
 * link to a question that does not apply on the sale (the licence state the
 * intake recorded, the cash-only payment method on a bank deal) redirected
 * straight back: a dead end dressed as a way to fix the paper.
 */
describe("every Change link opens its question", () => {
  for (const [route, sale] of Object.entries(ROUTES)) {
    for (const documentType of owedDocuments(sale)) {
      it(`${route}: ${documentType}`, () => {
        const county = (sale.stepData as { buyerId?: { mailing?: { county?: string } } }).buyerId?.mailing?.county ?? "";
        const { context } = paperworkFilingContext(sale, documentType, county);
        const rows = readBack(documentType, sale, filedFormData(documentType, sale), { context }).flatMap((page) => page.rows);
        let opened = 0;
        for (const row of rows) {
          const match = /\/paperwork\/([^/]+)\/([^/?]+)\?change=([A-Za-z]+)$/.exec(row.changeHref ?? "");
          if (!match) continue;
          const [, owner, key, reopen] = match;
          expect(reopen).toBe(key);
          const ownerContext = paperworkFilingContext(sale, owner, county).context;
          const keys = paperworkQuestions(owner, { ...ownerContext, reopen }).map((question) => question.key);
          expect(keys, `${route} ${documentType}: ${row.id} -> ${owner}/${key}`).toContain(key);
          opened += 1;
        }
        // The bill of sale always has answers of its own to change.
        if (documentType === "billOfSale") expect(opened).toBeGreaterThan(0);
      });
    }
  }
});
