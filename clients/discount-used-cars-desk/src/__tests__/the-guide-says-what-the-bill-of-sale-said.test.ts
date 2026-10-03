import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  BUYERS_GUIDE_AS_IS_BOX,
  BUYERS_GUIDE_AS_IS_BOX_ES,
  BUYERS_GUIDE_TEMPLATE_PATH,
  BUYERS_GUIDE_TEMPLATE_PATH_ES,
  BUYERS_GUIDE_WARRANTY_LAYOUT,
  generateBuyersGuidePdf,
  windowCopyOf,
} from "@/lib/documents/buyersGuide";
import { buyersGuideInputFor, buyersGuideProbe, buyersGuideVehicleGaps, buyersGuideWarrantyFor } from "@/lib/documents/buyers-guide-input";
import { SALE_DOCUMENTS, saleRowHref } from "@/lib/admin/sale-desk";
import { ROUTES } from "./fixtures/sales";

/**
 * The Buyers Guide is part of the contract. It used to mark AS IS on every
 * car, so a sale whose bill of sale said "With A Warranty" hung a window form
 * saying AS IS. Now the bill of sale's answer decides the boxes, the window
 * copy is the front and the back, and the sale row's link carries the sale.
 */

const CAR = { year: "2021", make: "Chevrolet", model: "Malibu LT", vin: "1G1ZD5ST8MF345678" };

async function pageText(bytes: Uint8Array, pageNumber: number): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

const inside = (inner: { x: number; y: number; width: number; height: number }, page: { width: number; height: number }) =>
  inner.x > 0 && inner.y > 0 && inner.x + inner.width < page.width && inner.y + inner.height < page.height;

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("the guide says what the bill of sale said", () => {
  it("marks AS IS for an as-is sale, an unanswered one and a tow-away", () => {
    expect(buyersGuideWarrantyFor(ROUTES.cashPaid)).toEqual({ conditionType: "as_is" });
    expect(buyersGuideWarrantyFor(ROUTES.towAway)).toEqual({ conditionType: "as_is" });
    const probe = buyersGuideProbe(buyersGuideInputFor(CAR, ROUTES.cashPaid, "en"));
    expect(probe.asIs).toBe("X");
    expect(probe.dealerWarranty).toBe("");
    expect(probe.systemsCovered).toBe("");
    // Without a sale (the templates page) it prints as it always did.
    expect(buyersGuideWarrantyFor(null)).toBeNull();
    expect(buyersGuideProbe(buyersGuideInputFor(CAR, null, "en")).asIs).toBe("X");
  });

  it("marks DEALER WARRANTY, LIMITED, the shares, the systems and the duration for a warranty sale", () => {
    const warranty = buyersGuideWarrantyFor(ROUTES.warranty);
    expect(warranty).toEqual({
      conditionType: "warranty",
      kind: "limited",
      laborPercent: "50",
      partsPercent: "50",
      systems: ["Engine", "Transmission & Drive Shaft"],
      duration: "30 days or 1,000 miles",
    });
    const probe = buyersGuideProbe(buyersGuideInputFor(CAR, ROUTES.warranty, "en"));
    expect(probe).toMatchObject({ asIs: "", dealerWarranty: "X", limitedWarranty: "X", fullWarranty: "", laborPercent: "50", partsPercent: "50" });
    expect(probe.systemsCovered).toBe("Engine, Transmission & Drive Shaft");
  });

  it("prints the warranty's words on the front, and none of them on an as-is guide", async () => {
    const withWarranty = await generateBuyersGuidePdf(buyersGuideInputFor(CAR, ROUTES.warranty, "en"));
    const front = await pageText(withWarranty, 1);
    expect(front).toContain("Engine, Transmission & Drive Shaft");
    expect(front).toContain("30 days or 1,000 miles");
    expect(front).toMatch(/\b50\b/);

    const asIs = await generateBuyersGuidePdf(buyersGuideInputFor(CAR, ROUTES.cashPaid, "en"));
    const asIsFront = await pageText(asIs, 1);
    expect(asIsFront).toContain(CAR.vin);
    expect(asIsFront).not.toContain("30 days or 1,000 miles");
    expect(asIsFront).not.toContain("Transmission & Drive Shaft");
  }, 30000);

  it("draws the AS IS mark exactly where it always did: the same geometry, both languages", async () => {
    // The as-is path is the old path: generating with an as-is answer or with
    // no sale at all draws the same page-one content.
    const contentOf = async (bytes: Uint8Array) => {
      const pdf = await PDFDocument.load(bytes);
      const page = pdf.getPages()[0];
      return page.node.normalizedEntries().Contents?.toString() ?? "";
    };
    for (const language of ["en", "es"] as const) {
      const old = await generateBuyersGuidePdf({ vehicle: CAR, dealer: { contact: "Sales Office" }, language });
      const now = await generateBuyersGuidePdf(buyersGuideInputFor(CAR, ROUTES.cashPaid, language));
      expect((await PDFDocument.load(now)).getPageCount()).toBe(3);
      expect(await contentOf(now)).toBe(await contentOf(old));
      expect(await pageText(now, 1)).toBe(await pageText(old, 1));
    }
  }, 30000);

  it("puts the warranty marks inside the page and clear of the AS IS box, in both languages", async () => {
    for (const language of ["en", "es"] as const) {
      const template = readFileSync(language === "es" ? BUYERS_GUIDE_TEMPLATE_PATH_ES : BUYERS_GUIDE_TEMPLATE_PATH);
      const page = (await PDFDocument.load(template)).getPages()[0].getSize();
      const layout = BUYERS_GUIDE_WARRANTY_LAYOUT[language];
      const asIsBox = language === "es" ? BUYERS_GUIDE_AS_IS_BOX_ES : BUYERS_GUIDE_AS_IS_BOX;
      for (const box of [layout.dealerWarranty, layout.full, layout.limited]) {
        expect(inside(box, page)).toBe(true);
        expect(overlaps(box, asIsBox)).toBe(false);
      }
      // FULL sits above LIMITED, both under the DEALER WARRANTY box.
      expect(layout.full.y).toBeGreaterThan(layout.limited.y);
      expect(layout.dealerWarranty.y).toBeGreaterThan(layout.full.y);
      // Systems and duration are side by side and stay above their floor.
      expect(layout.duration.x).toBeGreaterThan(layout.systems.x + layout.systems.maxWidth - 1);
      expect(layout.systems.bottom).toBeLessThan(layout.systems.y);
    }
  });
});

describe("the window copy is the front and the back", () => {
  it("is two pages, the filled front and the dealer's back; the full guide stays three", async () => {
    const full = await generateBuyersGuidePdf(buyersGuideInputFor(CAR, ROUTES.cashPaid, "en"));
    expect((await PDFDocument.load(full)).getPageCount()).toBe(3);
    const window = await windowCopyOf(full);
    expect((await PDFDocument.load(window)).getPageCount()).toBe(2);
    expect(await pageText(window, 1)).toBe(await pageText(full, 1));
    expect(await pageText(window, 2)).toBe(await pageText(full, 3));
  }, 30000);
});

describe("the sale row's guide link carries the sale", () => {
  it("opens the window copy for this car and this sale", () => {
    const guide = SALE_DOCUMENTS.find((entry) => entry.href === "/admin/documents/buyers-guide")!;
    const href = saleRowHref(guide, "deal-9", "car-3");
    const url = new URL(href, "https://desk.test");
    expect(url.pathname).toBe("/api/documents/buyers-guide");
    expect(url.searchParams.get("vehicleId")).toBe("car-3");
    expect(url.searchParams.get("dealId")).toBe("deal-9");
    expect(url.searchParams.get("copy")).toBe("window");
  });

  it("the packet's guide link names the sale and the window copy too", () => {
    const source = readFileSync(join(process.cwd(), "src/app/admin/sales/[dealId]/packet/page.tsx"), "utf8");
    const builder = source.slice(source.indexOf("const buyersGuideHref"), source.indexOf("};", source.indexOf("const buyersGuideHref")));
    expect(builder).toContain('params.set("dealId", sale.id)');
    expect(builder).toContain('params.set("copy", "window")');
  });

  it("refuses by name a guide for a car whose record lacks the VIN, year, make or model", () => {
    expect(buyersGuideVehicleGaps(CAR)).toEqual([]);
    expect(buyersGuideVehicleGaps({ ...CAR, vin: "", make: " " })).toEqual(["VIN", "make"]);
  });
});
