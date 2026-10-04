import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * A voided copy prints marked void (owner's decision 10/02/2026).
 *
 * The stored record is never touched. What the packet's Open and Print hand
 * out for a voided copy is the same document with a diagonal VOID (VOID ·
 * ANULADO on a Spanish sale) and a band across the top of every page saying
 * when it was voided, by whom and why; the file name says VOIDED. A copy that
 * was never voided prints exactly as before, through the same staff gate.
 */

const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, pdf: vi.fn(), render130: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.row, error: null }) }) }) }) }),
}));
vi.mock("@/lib/documents/pdf-generator", () => ({ generatePdf: (...args: unknown[]) => state.pdf(...args) }));
vi.mock("@/lib/documents/render130U", () => ({ render130UPdf: (...args: unknown[]) => state.render130(...args) }));

import { printableForStamp, stampVoided, voidBandText, wrapToWidth } from "@/lib/documents/void-stamp";
import { GET } from "@/app/api/documents/agreements/[id]/pdf/route";

async function blankPdf(pages = 2): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) document.addPage([612, 792]);
  return document.save();
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 } as never).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const content = await (await pdf.getPage(i)).getTextContent();
    texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return texts;
}

const VOIDED = {
  voided_at: "2026-10-02T15:00:00.000Z",
  voided_by_name: "Maria Lopez",
  void_reason: "The down payment was typed as 1500, it is 2000",
  language: "en",
};

beforeEach(async () => {
  state.pdf.mockReset().mockResolvedValue(Buffer.from(await blankPdf(2)));
  state.render130.mockReset().mockResolvedValue({ ok: true, bytes: await blankPdf(1), filename: "130-U_Salinas.pdf" });
});

describe("the stamp", () => {
  it("keeps every page and marks each one VOID with when, by whom and why", async () => {
    const stamped = await stampVoided(await blankPdf(3), { voidedAt: VOIDED.voided_at, byName: "Maria Lopez", reason: VOIDED.void_reason, language: "en" });
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(3);
    const texts = await pageTexts(stamped);
    expect(texts).toHaveLength(3);
    for (const text of texts) {
      expect(text).toContain("VOID");
      expect(text).not.toContain("ANULADO");
      expect(text).toContain("Voided 10/02/2026 by Maria Lopez: The down payment was typed as 1500, it is 2000");
    }
  });

  it("says VOID · ANULADO, and Anulado el, on a Spanish copy", async () => {
    const stamped = await stampVoided(await blankPdf(1), { voidedAt: VOIDED.voided_at, byName: "Maria Lopez", reason: "Error en el enganche", language: "es" });
    const [text] = await pageTexts(stamped);
    expect(text).toContain("VOID · ANULADO");
    expect(text).toContain("Anulado el 10/02/2026 por Maria Lopez: Error en el enganche");
  });

  it("replaces what Helvetica cannot draw, and cuts a long reason to two lines", async () => {
    expect(printableForStamp("Łukasz ☃ Núñez")).toBe("?ukasz ? Núñez");
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const lines = wrapToWidth("word ".repeat(400).trim(), font, 9, 300, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("...")).toBe(true);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 9)).toBeLessThanOrEqual(300);
    expect(voidBandText({ voidedAt: VOIDED.voided_at, byName: "", reason: "x", language: "en" })).toBe("Voided 10/02/2026 by the desk: x");
    const stamped = await stampVoided(await blankPdf(1), { voidedAt: VOIDED.voided_at, byName: "Łukasz", reason: "y".repeat(2000), language: "en" });
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(1);
  });
});

describe("the staff PDF route", () => {
  const get = (id: string) => GET(new NextRequest(`https://desk.example/api/documents/agreements/${id}/pdf`), { params: Promise.resolve({ id }) });

  it("stamps a voided copy and names the file VOIDED", async () => {
    state.row = { id: "a1", document_type: "billOfSale", buyer_name: "Andrea Salinas", form_data: {}, ...VOIDED };
    const response = await get("a1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/_VOIDED_20261002\.pdf"$/);
    const texts = await pageTexts(new Uint8Array(await response.arrayBuffer()));
    expect(texts).toHaveLength(2);
    expect(texts.every((text) => text.includes("VOID"))).toBe(true);
  });

  it("stamps a voided 130-U from the state form as well", async () => {
    state.row = { id: "a2", document_type: "form130U", buyer_name: "Andrea Salinas", form_data: {}, ...VOIDED };
    const response = await get("a2");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="130-U_Salinas_VOIDED_20261002.pdf"');
    const [text] = await pageTexts(new Uint8Array(await response.arrayBuffer()));
    expect(text).toContain("Voided 10/02/2026 by Maria Lopez");
  });

  it("sends a copy that was never voided exactly as it was", async () => {
    const original = await blankPdf(2);
    state.pdf.mockResolvedValue(Buffer.from(original));
    state.row = { id: "a3", document_type: "billOfSale", buyer_name: "Andrea Salinas", form_data: {}, voided_at: null };
    const response = await get("a3");
    expect(response.headers.get("Content-Disposition")).not.toMatch(/VOIDED/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(original);
  });

  it("keeps the one staff gate", () => {
    const route = readFileSync("src/app/api/documents/agreements/[id]/pdf/route.ts", "utf8");
    expect(route).toContain("requireAdmin(req, 'documents:read')");
    // The stored row is read, never written.
    expect(route).not.toMatch(/\.update\(|\.delete\(|\.insert\(/);
  });
});
