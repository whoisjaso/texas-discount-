import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * A line left for ink is dated the day of the sale, never the day the copy
 * was printed. And a document filed after the bill of sale is dated the
 * bill of sale's day of sale, with its lien.
 */
afterEach(() => vi.useRealTimers());

describe("a reprint keeps the sale date", () => {
  it("dates an unsigned bill of sale's lines with the sale date, a week later", () => {
    const link = corridorCompletedLink(ROUTES.cashPaid, "billOfSale", filedFormData("billOfSale", ROUTES.cashPaid), "https://x.test", {}, { saleDate: "2026-10-03" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded: decodeCompletedLinkFromUrl(link!)! }));
    expect(markup).toContain("10/03/2026");
    expect(markup).not.toContain("10/10/2026");
  });

  it("dates a later document, and its lien, with the filed bill of sale's day", () => {
    const formData = filedFormData("form130U", ROUTES.bhphTrade);
    const dd = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES.bhphTrade, "form130U", formData, "https://x.test", {}, { saleDate: "2026-09-30" })!)!.dd;
    expect(dd.saleDate).toBe("2026-09-30");
    expect(dd.lienDate).toBe("2026-09-30");
  });
});
