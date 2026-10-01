import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_BUYER_ID, readBuyerId } from "@/lib/sales/buyer-id";
import { buildGuideSteps } from "@/lib/sales/guide";

/**
 * A desk with a printer has a flatbed on it, and a flatbed beats a phone.
 *
 * The card lies flat, the light is even, the resolution is whatever the glass
 * was set to, and nobody has to hold anything steady, so the barcode reads
 * first time. It also ends with a PDF of the customer's identification, which
 * is the artifact that gets attached to a filing later, already made.
 *
 * The desk had none of that. It had a QR code and, underneath it, the capture
 * link printed out in full: a hundred and thirty characters of signed token
 * wrapped across four lines, directly below a picture whose entire purpose is
 * to save somebody from ever reading that string. Nobody has ever typed a
 * signed token.
 */

const STEP = readFileSync("src/components/admin/guide/BuyerIdStep.tsx", "utf8");
const UPLOAD = readFileSync("src/components/admin/guide/ScannerUpload.tsx", "utf8");
const ROUTE = readFileSync("src/app/api/capture/route.ts", "utf8");
// Vega's buckets are created by the desk migration.
const BUCKETS = readFileSync("supabase/migrations/20260926000000_vegas_sale_desk.sql", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

describe("what the desk is offered", () => {
  it("no longer prints the signed link out under the code", () => {
    expect(STEP).not.toContain("ed-idcap-link");
    expect(STEP).not.toContain('captureUrl.replace(/^https?:\\/\\//');
  });

  it("offers the scanner beside the phone, not instead of it", () => {
    expect(STEP).toContain("ScannerUpload");
    expect(STEP).toContain("ed-idcap-qr");
  });

  it("gives the two ways equal room so their captions line up", () => {
    // Centred instead, a 56px button next to a 190px code puts its caption two
    // thirds of the way up the code and the pair stops reading as one question.
    const rule = CSS.slice(CSS.indexOf(".ed-idcap-handoff {"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("align-items: stretch");
  });

  it("does not offer a scanner upload with no link to sign it", () => {
    // A deployment with no signing secret has no token, and a button that
    // cannot authenticate is worse than no button.
    expect(STEP).toContain("{captureToken ? (");
  });
});

describe("the step stops naming one of the three ways", () => {
  it("asks for the licence on file rather than for a photograph", () => {
    const steps = buildGuideSteps(
      {
        id: "d1",
        stepData: {},
        funding: { type: "cash", lenderId: null, lenderOther: null },
        documents: [],
      } as never,
    );
    const licence = steps.find((step) => step.key === "buyerId");
    expect(licence?.question).toBe("Put The Licence On File.");
    // Naming the camera made the flatbed and the keyboard look like
    // workarounds, and two of the three ways are not workarounds.
    expect(licence?.question).not.toMatch(/photograph/i);
  });
});

describe("the scanner's own file", () => {
  it("is somewhere the record can hold it", () => {
    expect(EMPTY_BUYER_ID.document).toBeNull();
    expect(readBuyerId({ buyerId: { document: "d/1.pdf" } }).document).toBe("d/1.pdf");
  });

  it("is allowed into the bucket it has to land in", () => {
    // The whole feature failed silently on this: storage rejected the mime
    // type, the picture saved, and nothing anywhere said the file had not.
    const row = BUCKETS.match(/\('buyer-ids'[^\n]*\)/)?.[0] ?? "";
    expect(row).toContain("application/pdf");
  });

  it("is only ever taken as a PDF", () => {
    // Anything else claiming to be the scanner's original is not one.
    expect(ROUTE).toMatch(/scanned\.type === "application\/pdf"/);
  });

  it("survives a later retake from a phone", () => {
    // A phone sends no document. Merging its upload must not blank the file
    // somebody used the flatbed specifically to put on record.
    expect(ROUTE).toContain("document: documentPath ?? held.document");
  });

  it("survives the reader's second write", () => {
    // The front-of-card pass rewrites the row a few seconds later, and every
    // key it does not carry forward is a key it erases.
    const late = ROUTE.slice(ROUTE.indexOf("const filled = {"));
    expect(late.slice(0, late.indexOf("};"))).toContain("document: held.document");
  });

  it("says so when it could not be kept", () => {
    // Half the reason for choosing the scanner is ending up with that file.
    // Losing it quietly would leave somebody believing the sale holds it.
    expect(ROUTE).toContain("documentKept");
    expect(UPLOAD).toContain('result.documentKept === false');
  });
});

describe("what is read, and where", () => {
  it("decodes the barcode in this browser rather than uploading to be read", () => {
    // Same rule as the phone: a customer's licence does not travel anywhere it
    // does not have to, and the dealership's own storage is far enough.
    expect(UPLOAD).toContain("readBarcodesFromImageData");
    expect(UPLOAD).toContain("/wasm/");
  });

  it("reads the record separators as bytes, not as the text <LF>", () => {
    // The decoder's default text mode renders them as angle-bracket escapes,
    // and the payload then parses as one meaningless line. Every real licence
    // would be rejected.
    expect(UPLOAD).toContain('textMode: "Plain"');
  });

  it("tries every page, because a flatbed takes both sides at once", () => {
    expect(UPLOAD).toContain("for (const page of pages)");
  });

  it("refuses a barcode that is not a licence", () => {
    // A shipping label carries a PDF417 too, and filling a sale from one would
    // be worse than reading nothing.
    expect(UPLOAD).toContain("looksLikeLicence");
  });
});
