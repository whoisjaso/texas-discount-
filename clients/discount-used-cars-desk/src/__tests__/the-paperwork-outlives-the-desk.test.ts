import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { packetDownloadHref, packetViewHref } from "@/lib/admin/sale-packet";
import { buildGuideSteps } from "@/lib/sales/guide";

/**
 * The sale ends at a screen you can print from, not at a signature.
 *
 * The reason is a working day rather than an architecture. A sale can be run
 * start to finish on a phone standing next to the car, and a phone cannot
 * reach a printer without an adapter or a cable nobody has. So everything the
 * sale produced has to be somewhere a computer can open half an hour later:
 * sign in, find the deal, print.
 *
 * What these guard is the part that is easy to get wrong later. Regenerating a
 * document from live rows instead of printing what was signed. Hiding the ones
 * that never got signed, which is the most useful thing this screen can say.
 * Inventing a second answer to who may see a document, when one already
 * exists.
 */

const PACKET = readFileSync("src/app/admin/sales/[dealId]/packet/page.tsx", "utf8");
// The packet's words render on the client now, in the operator's language;
// the rows and links moved with them. The EN catalogue pins the copy.
const PACKET_SCREEN = readFileSync("src/components/admin/packet/PacketScreen.tsx", "utf8");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN_PACKET = (require("../../messages/en.json") as { funnel: { packet: Record<string, string> } }).funnel.packet;
const MODEL = readFileSync("src/lib/admin/sale-packet.ts", "utf8");
const GUIDE_PAGE = readFileSync(
  "src/app/admin/sales/[dealId]/guide/[step]/page.tsx",
  "utf8",
);
const PDF_ROUTE = readFileSync(
  "src/app/api/documents/agreements/[id]/pdf/route.ts",
  "utf8",
);

const sale = {
  id: "d1",
  buyer: { name: "A Buyer" },
  funding: { type: "cash", lenderId: null, lenderOther: null },
  documents: {},
  vehicle: { salePrice: 3500 },
  plate: null, plateAsked: false,
  stepData: {},
} as never;

describe("where the sale ends", () => {
  it("is the last step, after the title is filed", () => {
    // Anywhere else it is a detour. At the end it is the natural close.
    const keys = buildGuideSteps(sale).map((step) => step.key);
    expect(keys[keys.length - 1]).toBe("packet");
    expect(keys.indexOf("packet")).toBe(keys.indexOf("title") + 1);
  });

  it("is a screen of its own rather than a panel on the question route", () => {
    // It lists documents with links, which is a screen. The guide route's
    // whole shape is one question with nothing else on it.
    expect(GUIDE_PAGE).toContain('if (current.key === "packet")');
    expect(GUIDE_PAGE).toContain("/packet`");
  });

  it("is done once there is something to print, and not before", () => {
    /*
      Not permanently open. Left that way, every finished sale reads as
      unfinished forever and the desk keeps offering it as the next thing to do
      on a deal from March. Done here is a fact about this step rather than a
      restatement of the ones above it.
    */
    const nothing = buildGuideSteps(sale);
    expect(nothing.find((step) => step.key === "packet")?.done).toBe(false);

    const filed = { ...(sale as object), documents: { billOfSale: "finalized" } } as never;
    expect(
      buildGuideSteps(filed).find((step) => step.key === "packet")?.done,
    ).toBe(true);

    // A draft is not something to print.
    const started = { ...(sale as object), documents: { billOfSale: "draft" } } as never;
    expect(
      buildGuideSteps(started).find((step) => step.key === "packet")?.done,
    ).toBe(false);
  });
});

describe("what it offers", () => {
  it("prints what was signed rather than what the rows say today", () => {
    /*
      A document is a record of what was agreed on a day. Rebuilding it from
      live data would quietly rewrite it every time a phone number changed, so
      every link here goes through the agreement's own id.
    */
    expect(packetViewHref("abc")).toBe("/api/documents/agreements/abc/pdf?inline=true");
    expect(packetDownloadHref("abc")).toBe("/api/documents/agreements/abc/pdf");
    expect(MODEL).toContain('.from("document_agreements")');
    expect(MODEL).not.toContain("getSaleDetail");
  });

  it("opens and saves, because those are different jobs", () => {
    // Opening it is what somebody at a desk wants before they print. Saving it
    // is what somebody emailing a lender wants. One link would serve one of
    // them and surprise the other.
    expect(PACKET_SCREEN).toContain("packetViewHref(document.id)");
    expect(PACKET_SCREEN).toContain("packetDownloadHref(document.id)");
    expect(PACKET_SCREEN).toContain('target="_blank"');
  });

  it("invents no second answer to who may see a document", () => {
    // The endpoint these links point at was already admin-gated. A new rule
    // here would be a second place for that decision to drift.
    expect(PDF_ROUTE).toContain("requireAdmin(req, 'documents:read')");
  });

  it("lists what was started and never signed", () => {
    // The single most useful thing this screen can tell somebody.
    expect(EN_PACKET.draftsHeading).toBe("Started, not signed");
    expect(PACKET_SCREEN).toContain("t.packet.draftsHeading");
    expect(PACKET_SCREEN).toContain("current.filter((document) => !document.finalized)");
  });

  it("survives a document type the packet registry does not name", () => {
    // Rows exist from paths that predate the registry. A readable fallback
    // beats a row reading "chargebackAcknowledgment" to somebody at a desk.
    expect(MODEL).toContain('replace(/([a-z])([A-Z0-9])/g, "$1 $2")');
  });

  it("does not fall over when the document read fails", () => {
    // The licence and the way back are still worth showing. One table failing
    // is not a reason to hand somebody an error page.
    expect(PACKET).toMatch(/catch \{[\s\S]{0,300}loadFailed = true/);
    expect(EN_PACKET.loadError).toBe("Could not load the documents. Try again in a moment.");
    expect(PACKET_SCREEN).toContain("t.packet.loadError");
  });
});

describe("the licence on that page", () => {
  it("is signed for minutes rather than served openly", () => {
    expect(PACKET).toContain("createSignedUrl(path, 600)");
    expect(PACKET).toContain('from("buyer-ids")');
  });

  it("is never cached, because those links expire", () => {
    expect(PACKET).toContain('export const dynamic = "force-dynamic"');
  });

  it("is not handed to the image optimiser", () => {
    // It would cache a URL that stops working in ten minutes.
    expect(PACKET_SCREEN).not.toContain('from "next/image"');
    expect(PACKET_SCREEN).toContain("<img src={photograph.url}");
  });
});
