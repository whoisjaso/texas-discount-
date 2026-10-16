import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIELD_MAPS, allFields, type MapField, type Source } from "@/lib/documents/field-maps";
import { factHref, readBack } from "@/lib/documents/field-maps/resolve";
import { DEAL_FACTS } from "@/lib/sales/deal-facts";
import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import { hasPaperwork, paperworkQuestions } from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { ROUTES, filedFormData, owedDocuments, routeSale } from "./fixtures/sales";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * Walked on 5190, 2026-10-04: Fix It beside the pickup's blank mileage opened
 * /admin/inventory/<id>, which is not a page, and Next answered with its own
 * unstyled 404. A Fix It or Change link exists to take somebody to the screen
 * where the fact is fixed; a link to nowhere is worse than none.
 *
 * So every link the review can draw is checked against the app's real pages
 * (every page.tsx under src/app), for every box on every document's map and
 * for every source kind, and a paperwork link must name a document whose
 * corridor exists (the page 404s on any other). The catch-all that only
 * renders the desk's not-found page is not a screen and does not count.
 */

const APP = path.join(process.cwd(), "src", "app");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

/** Each page as a pattern: `[x]` is one segment, `(group)` is no segment. */
const ROUTE_PATTERNS = pageFiles(APP)
  .filter((file) => !/notFound\(\)/.test(readFileSync(file, "utf8")) || !/\[\.\.\./.test(file))
  .map((file) => {
    const segments = path
      .relative(APP, path.dirname(file))
      .split(path.sep)
      .filter((segment) => segment && !/^\(.*\)$/.test(segment));
    const body = segments
      .map((segment) => (/^\[\.\.\..+\]$/.test(segment) ? ".+" : /^\[.+\]$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    return { file: path.relative(APP, file), pattern: new RegExp(`^/${body}$`) };
  });

function opensAPage(href: string): boolean {
  const pathname = href.split("?")[0];
  return ROUTE_PATTERNS.some(({ pattern }) => pattern.test(pathname));
}

/** The paperwork page's own 404 rule: a document with a corridor. */
function paperworkDocumentExists(href: string): boolean {
  const match = /\/paperwork\/([^/?]+)\//.exec(href);
  if (!match) return true;
  const doc = decodeURIComponent(match[1]);
  return SALE_DOCUMENTS.some((entry) => entry.documentType === doc) && hasPaperwork(doc);
}

const NO_READING = routeSale("no-reading", { vehicle: { mileage: null } });
const NO_READING_TOW = routeSale("no-reading-tow", {
  vehicle: { mileage: null, titleStatus: "salvage_unrebuilt" },
  plate: null,
  stepData: { salvagePlan: { path: "towAway" }, salePlan: {} },
});
const SALES: SaleDetail[] = [...Object.values(ROUTES), NO_READING, NO_READING_TOW];

/** Every source a box can name, so a source no map uses yet is held to the rule too. */
const EVERY_SOURCE: Source[] = [
  ...(["vin", "year", "make", "model", "trim", "bodyStyle", "exteriorColor", "mileage", "stockNumber", "titleStatus", "emptyWeight", "plate"] as const).map(
    (column): Source => ({ from: "vehicle", column }),
  ),
  ...(["name", "nameParts", "idNumber", "idKind", "idIssuer", "phone", "email", "street", "city", "state", "zip", "county", "address"] as const).map(
    (fact): Source => ({ from: "buyer", fact }),
  ),
  ...(["docFee", "titleFee", "registrationFee", "inspectionFee", "plateFee", "taxRate", "lateHandlingFee"] as const).map(
    (line): Source => ({ from: "fees", line }),
  ),
  ...DEAL_FACTS.map((fact): Source => ({ from: "answer", fact: fact.id })),
];

describe("every Fix It opens a screen that exists", () => {
  it("knows the app's pages", () => {
    expect(ROUTE_PATTERNS.map((route) => route.file)).toEqual(
      expect.arrayContaining(["admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "admin/inventory/[id]/title-work/page.tsx"]),
    );
    expect(ROUTE_PATTERNS.some((route) => route.file.includes("[..."))).toBe(false);
    expect(opensAPage("/admin/inventory/some-car")).toBe(false);
  });

  it("links every box on every map only to a page that exists", () => {
    let links = 0;
    for (const sale of SALES) {
      for (const map of FIELD_MAPS) {
        for (const field of allFields(map)) {
          const href = factHref(field, sale, map.documentType);
          if (!href) continue;
          links += 1;
          expect(opensAPage(href), `${sale.id} ${map.documentType}.${field.id} -> ${href}`).toBe(true);
          expect(paperworkDocumentExists(href), `${sale.id} ${map.documentType}.${field.id} -> ${href}`).toBe(true);
        }
      }
    }
    expect(links).toBeGreaterThan(100);
  });

  it("links every kind of source only to a page that exists, or not at all", () => {
    for (const sale of SALES) {
      for (const map of FIELD_MAPS) {
        for (const source of EVERY_SOURCE) {
          const field: MapField = { id: "probe", label: "Probe", source, blank: "never" };
          const href = factHref(field, sale, map.documentType);
          if (!href) continue;
          expect(opensAPage(href), `${map.documentType} ${JSON.stringify(source)} -> ${href}`).toBe(true);
          expect(paperworkDocumentExists(href), `${map.documentType} ${JSON.stringify(source)} -> ${href}`).toBe(true);
        }
      }
    }
  });

  it("sends a blank mileage to the bill of sale's reading question, which opens", () => {
    const cases: Array<[SaleDetail, string, string]> = [
      [NO_READING, "billOfSale", "billOfSale"],
      [NO_READING, "form130U", "billOfSale"],
      [NO_READING_TOW, "salvageBillOfSale", "salvageBillOfSale"],
    ];
    for (const [sale, documentType, owner] of cases) {
      expect(owedDocuments(sale)).toContain(documentType);
      const { context } = paperworkFilingContext(sale, documentType, "Harris");
      const rows = readBack(documentType, sale, filedFormData(documentType, sale), { context }).flatMap((page) => page.rows);
      const mileage = rows.filter((row) => row.source === "vehicle" && /odometer|mileage/i.test(row.label));
      expect(mileage.length, `${documentType} prints the reading`).toBeGreaterThan(0);
      for (const row of mileage) {
        expect(row.status, `${documentType}.${row.id}`).toBe("missing");
        expect(row.changeHref).toBe(`/admin/sales/${sale.id}/paperwork/${owner}/odometerReading?change=odometerReading`);
      }
      const ownerContext = paperworkFilingContext(sale, owner, "Harris").context;
      expect(paperworkQuestions(owner, { ...ownerContext, reopen: "odometerReading" }).map((question) => question.key)).toContain("odometerReading");
    }
  });

  it("draws no link for a fact of the car no desk screen edits", () => {
    const sale = ROUTES.cashPaid;
    for (const column of ["vin", "year", "make", "model", "trim", "bodyStyle", "exteriorColor", "stockNumber"] as const) {
      const field: MapField = { id: column, label: column, source: { from: "vehicle", column }, blank: "never" };
      expect(factHref(field, sale, "billOfSale"), column).toBeUndefined();
    }
  });

  it("links each sworn question the review names to a page that exists", () => {
    for (const fact of DEAL_FACTS.filter((entry) => entry.mustAnswer)) {
      // The review's own link (paperwork/[doc]/[q] page.tsx, `sworn`).
      const href = `/admin/sales/deal-1/paperwork/${encodeURIComponent(fact.owner)}/${encodeURIComponent(fact.key)}`;
      expect(opensAPage(href), href).toBe(true);
      expect(paperworkDocumentExists(href), href).toBe(true);
    }
  });
});
