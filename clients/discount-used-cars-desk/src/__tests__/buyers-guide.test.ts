import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { dealership } from "@/lib/dealership-config";
import {
  BUYERS_GUIDE_AS_IS_BOX,
  BUYERS_GUIDE_AS_IS_BOX_ES,
  BUYERS_GUIDE_PREFILL_PAGE_INDEXES,
  buildBuyersGuideFilename,
  buyersGuideAsIsMarkLines,
  generateBuyersGuidePdf,
} from "@/lib/documents/buyersGuide";

async function extractPageText(bytes: Uint8Array, pageNumber: number): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
}

describe("buyers guide PDF", () => {
  it("fills only odd pages of the official three-page template", async () => {
    expect(BUYERS_GUIDE_PREFILL_PAGE_INDEXES).toEqual([0, 2]);

    const bytes = await generateBuyersGuidePdf({
      vehicle: {
        year: "2026",
        make: "OddPageMake",
        model: "OddPageModel",
        vin: "ODDPAGEVIN1234567",
      },
      dealer: {
        contact: "Sales Desk",
      },
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);

    const pageOne = await extractPageText(bytes, 1);
    const pageTwo = await extractPageText(bytes, 2);
    const pageThree = await extractPageText(bytes, 3);

    expect(pageOne).toContain("OddPageMake");
    expect(pageOne).toContain("ODDPAGEVIN1234567");
    expect(pageTwo).not.toContain("OddPageMake");
    expect(pageTwo).not.toContain("ODDPAGEVIN1234567");
    expect(pageThree).toContain(dealership.legalName!);
    expect(pageThree).toContain("Sales Desk");
  }, 30000);

  it("draws the AS IS mark corner-to-corner inside the checkbox in both languages", () => {
    const cases = [
      { language: "en" as const, box: BUYERS_GUIDE_AS_IS_BOX },
      { language: "es" as const, box: BUYERS_GUIDE_AS_IS_BOX_ES },
    ];
    for (const { language, box } of cases) {
      const [down, up] = buyersGuideAsIsMarkLines(language);
      const points = [down.start, down.end, up.start, up.end];

      // Every endpoint stays inside the printed box outline.
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(box.x);
        expect(p.x).toBeLessThanOrEqual(box.x + box.width);
        expect(p.y).toBeGreaterThanOrEqual(box.y);
        expect(p.y).toBeLessThanOrEqual(box.y + box.height);
      }

      // And the strokes actually span the box (corner-to-corner, not a small mark).
      const spanX = Math.abs(down.end.x - down.start.x);
      const spanY = Math.abs(down.end.y - down.start.y);
      expect(spanX).toBeGreaterThan(box.width * 0.8);
      expect(spanY).toBeGreaterThan(box.height * 0.8);
      expect(up.start.y).toBeGreaterThan(up.end.y);
    }
  });

  it("fills the official Spanish template for lang=es", async () => {
    const bytes = await generateBuyersGuidePdf({
      vehicle: {
        year: "2026",
        make: "MarcaPrueba",
        model: "ModeloPrueba",
        vin: "SPANISHVIN1234567",
      },
      dealer: { contact: "Oficina de Ventas" },
      language: "es",
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);

    const pageOne = await extractPageText(bytes, 1);
    const pageThree = await extractPageText(bytes, 3);
    expect(pageOne).toContain("GU");
    expect(pageOne).toContain("MarcaPrueba");
    expect(pageOne).toContain("SPANISHVIN1234567");
    expect(pageThree).toContain(dealership.legalName!);
    expect(pageThree).toContain("Oficina de Ventas");

    expect(buildBuyersGuideFilename({ year: "2026", make: "Marca", model: "Modelo", vin: "SPANISHVIN1234567" }, "es")).toContain("-es.pdf");
  }, 30000);
});
