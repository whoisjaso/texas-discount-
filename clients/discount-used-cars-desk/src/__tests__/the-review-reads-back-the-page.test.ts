import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayValue, readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData, owedDocuments } from "./fixtures/sales";

/**
 * The review screen is the page. It used to list the answers and the money
 * whatever the document printed: the rebuilt disclosure's review showed a
 * car price the state page never prints and none of the four values it
 * does. Now each printed box, in page order, with what it will say.
 */

const rows = (type: string, sale: typeof ROUTES.cashPaid) =>
  readBack(type, sale, filedFormData(type, sale)).flatMap((page) => page.rows);

describe("the review reads back the page", () => {
  it("shows the rebuilt disclosure's own boxes, and no price", () => {
    const read = rows("rebuiltDisclosure", ROUTES.rebuilt);
    expect(read.map((row) => row.label)).toEqual([
      "(Year)",
      "(Make)",
      "(VIN#)",
      "Printed Name Of Purchaser",
      "Name Of Purchaser (Signature)",
      "Date Of Signature",
    ]);
    const value = (id: string) => read.find((row) => row.id === id)?.value;
    expect(value("vehicleYear")).toBe("2021");
    expect(value("vehicleMake")).toBe("Chevrolet");
    expect(value("vin")).toBe("1G1ZD5ST8MF345678");
    expect(value("buyerName")).toBe("Avery J Collins Jr");
    expect(read.find((row) => row.id === "buyerSignature")?.status).toBe("ink");
    expect(read.some((row) => /price/i.test(row.label))).toBe(false);
  });

  it("reads every owed document of every route with nothing missing", () => {
    for (const [route, sale] of Object.entries(ROUTES)) {
      for (const type of owedDocuments(sale)) {
        const missing = rows(type, sale).filter((row) => row.status === "missing").map((row) => row.label);
        expect(missing, `${route} ${type}`).toEqual([]);
      }
    }
  });

  it("marks an answer as asked, with the place to change it", () => {
    const read = rows("billOfSale", ROUTES.cashPaid);
    const odometer = read.find((row) => row.source === "answer" && /odometer/i.test(row.id));
    expect(odometer?.status).toBe("asked");
    expect(odometer?.changeHref).toMatch(/\/paperwork\/billOfSale\/odometerStatus\?change=odometerStatus$/);
  });

  it("says a stored code the way the paper words it", () => {
    const read = rows("billOfSale", ROUTES.cashPaid);
    const value = (id: string) => read.find((row) => row.id === id)?.value;
    expect(value("odometerStatus")).toBe("Yes, That Is The Real Mileage");
    expect(value("conditionType")).not.toBe("as_is");
    expect(value("buyerIdKind")).toBe("Driver Licence");
    expect(value("buyerPhone")).toBe("(713) 555-0188");
    expect(value("vehicleMileage")).toBe("64,280");
    expect(value("paymentMethod")).toBe("Zelle");
  });

  it("prints values the way the paper does", () => {
    expect(displayValue("salePrice", 9000)).toBe("$9,000.00");
    expect(displayValue("contractDate", "2026-10-03")).toBe("10/03/2026");
    expect(displayValue("buyerSignature", "data:image/png;base64,AAAA")).toBe("Signed");
    expect(displayValue("otherFees", 0)).toBe("");
  });

  it("is what the review screen shows, and the filing still posts the money", () => {
    const page = readFileSync("src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "utf8");
    expect(page).toMatch(/pages = readBack\(entry\.documentType, sale, reviewForm, \{ saleDate \}\)/);
    const review = readFileSync("src/components/admin/paperwork/ReviewStep.tsx", "utf8");
    expect(review).toContain("<PageReadBack pages={pages} />");
    expect(review).toContain("...(money ?? {}),");
  });
});

describe("a total stays with its lines in print", () => {
  /** (classes, attribute and pseudo-class count) of a selector, ignoring elements. */
  const specificity = (selector: string) => (selector.match(/[.:][A-Za-z-]+/g) ?? []).length;

  it("the reckoning's keep-together rule outranks the flowing-sections rule", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const flowing = ".bos-print .print-section:not(.bos-notice):not(.bos-odometer):not(.bos-lien):not(.bos-obligations)";
    const keep = ".bos-print.doc-sheet .bos-reckoning-wrap.print-section:not(.bos-notice):not(.bos-odometer):not(.bos-lien):not(.bos-obligations)";
    expect(css).toContain(flowing);
    const at = css.indexOf(keep);
    expect(at).toBeGreaterThan(css.indexOf(flowing));
    expect(specificity(keep)).toBeGreaterThan(specificity(flowing));
    const body = css.slice(css.indexOf("{", at), css.indexOf("}", at));
    expect(body).toContain("break-inside: avoid");
  });

  it("the Vehicle Responsibility total sits inside that wrapper", () => {
    const source = readFileSync("src/components/documents/VehicleResponsibilityDocument.tsx", "utf8");
    expect(source).toContain('className="print-doc bos-print doc-sheet"');
    expect(source).toMatch(/<div className="bos-reckoning-wrap print-section">\s*<dl className="doc-reckoning">[\s\S]*?doc-reckoning-total/);
  });
});
