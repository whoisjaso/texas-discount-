import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { fill130U } from "@/lib/fill-130u/fill-pdf";
import type { AgreementData } from "@/lib/fill-130u/field-mapping";
import { decodeImageDataUrl, fitWithin } from "@/lib/documents/embed-image";

/**
 * The licence photograph and the seller's signature, on the actual form.
 *
 * Built against a real fill of the real template rather than a mock, because
 * every failure mode worth catching here is a property of the PDF: a page that
 * did not get appended, a JPEG handed to a PNG decoder, an image drawn at zero
 * size, or a signature that quietly landed on the buyer's line instead of the
 * dealership's.
 */

const sample: AgreementData = {
  vin: "3N1AB6AP4CL778468",
  year: "2012",
  make: "NISSAN",
  model: "SENTRA",
  body_style: "4D",
  major_color: "BLUE",
  minor_color: "",
  odometer: "154559",
  odometer_brand: "A",
  empty_weight: "2877",
  carrying_capacity: "",
  tx_plate_no: "27422DLR",
  buyer_first_name: "Marisol",
  buyer_middle_name: "",
  buyer_last_name: "Guerrero",
  buyer_address: "4412 Aldine Mail Rd",
  buyer_city: "Houston",
  buyer_state: "TX",
  buyer_zip: "77039",
  buyer_county: "Harris",
  buyer_phone: "713-555-0101",
  buyer_email: "marisol@example.com",
  buyer_dl_number: "38291746",
  buyer_dl_state: "TX",
  co_buyer_name: "",
  sale_price: 2500,
  sale_date: "04/22/2026",
  trade_in_amount: 0,
  trade_in_description: "",
  rebate_amount: 0,
  applying_for: "title_and_registration",
  applicant_type: "individual",
  has_lien: true,
  lien_date: "2026-04-22",
} as AgreementData;

async function pngDataUrl(width = 320, height = 90): Promise<string> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 70 C 60 10, 110 90, 160 40 S 260 20, 310 60" stroke="#101010" stroke-width="5" fill="none"/>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function jpegDataUrl(width = 1012, height = 638): Promise<string> {
  const jpeg = await sharp({
    create: { width, height, channels: 3, background: "#dfe6ee" },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

describe("the form without extras is untouched", () => {
  it("is exactly one sheet: the form, without the template's instruction page", { timeout: 40_000 }, async () => {
    // The typography test fills this form with no second argument. If adding
    // the parameter changed the default output at all, that test would be
    // reporting on a different document than the one the county receives.
    const pdf = await PDFDocument.load(await fill130U(sample));
    expect(pdf.getPageCount()).toBe(1);
  });
});

describe("the licence photograph", () => {
  it("arrives as its own page, at a size somebody can read", { timeout: 40_000 }, async () => {
    const pdf = await PDFDocument.load(
      await fill130U(sample, { idPhotoDataUrl: await jpegDataUrl() }),
    );
    expect(pdf.getPageCount()).toBe(2);

    const added = pdf.getPage(1);
    const first = pdf.getPage(0);
    // Same sheet size as the form, so it prints in the same tray.
    expect(added.getWidth()).toBeCloseTo(first.getWidth(), 1);
    expect(added.getHeight()).toBeCloseTo(first.getHeight(), 1);
  });

  it("takes a JPEG, which is what the camera path actually produces", { timeout: 40_000 }, async () => {
    // embedPng throws on a JPEG rather than coping, so a single wrong guess
    // about the format turns document generation into a 500.
    const bytes = await fill130U(sample, { idPhotoDataUrl: await jpegDataUrl() });
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("takes a PNG too", { timeout: 40_000 }, async () => {
    const pdf = await PDFDocument.load(
      await fill130U(sample, { idPhotoDataUrl: await pngDataUrl(800, 500) }),
    );
    expect(pdf.getPageCount()).toBe(2);
  });

  it("appends nothing when there is no photograph", { timeout: 40_000 }, async () => {
    for (const value of [null, undefined, "", "not-a-data-url"]) {
      const pdf = await PDFDocument.load(
        await fill130U(sample, { idPhotoDataUrl: value as string | null }),
      );
      expect(pdf.getPageCount()).toBe(1);
    }
  });

  it("does not lose the whole document to a corrupt image", { timeout: 40_000 }, async () => {
    // A truncated upload claiming to be a PNG must cost the extra page, not
    // the title application.
    const pdf = await PDFDocument.load(
      await fill130U(sample, {
        idPhotoDataUrl: `data:image/png;base64,${Buffer.from("nonsense").toString("base64")}`,
      }),
    );
    expect(pdf.getPageCount()).toBe(1);
  });
});

describe("the seller's signature", () => {
  it("changes page one when a signature is supplied", { timeout: 40_000 }, async () => {
    const without = await fill130U(sample);
    const withSig = await fill130U(sample, { staffSignatureDataUrl: await pngDataUrl() });

    // Drawn onto the existing page rather than appended, so the page count is
    // unchanged and the document is larger for carrying the ink.
    const signed = await PDFDocument.load(withSig);
    expect(signed.getPageCount()).toBe(1);
    expect(withSig.byteLength).toBeGreaterThan(withoutLength(without));
  });

  it("ignores a signature that is not an image", { timeout: 40_000 }, async () => {
    const bytes = await fill130U(sample, { staffSignatureDataUrl: "data:text/plain;base64,aGk=" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("sits on the seller band and nowhere near the applicant lines", () => {
    // Measured off the template. The seller label is at y=77 and its printed
    // name box runs y=80 to y=104. The applicant signs at y=48 and any
    // additional applicant at y=20. Ink placed on either of those would be a
    // signature on somebody else's line, which on a title application is not a
    // convenience but a forgery.
    const box = fitWithin(
      { width: 320, height: 90 },
      { x: 24, y: 81, width: 262, height: 22 },
    );
    expect(box.y).toBeGreaterThan(77);
    expect(box.y + box.height).toBeLessThan(105);
    // Left of the printed name widget, which starts at x=293.51.
    expect(box.x + box.width).toBeLessThan(293);
  });
});

describe("decoding what arrives", () => {
  it("reads a PNG data URL", async () => {
    const decoded = decodeImageDataUrl(await pngDataUrl());
    expect(decoded?.mime).toBe("image/png");
    expect(decoded!.bytes.byteLength).toBeGreaterThan(64);
  });

  it("normalises image/jpg to image/jpeg", () => {
    const body = Buffer.alloc(128, 7).toString("base64");
    expect(decodeImageDataUrl(`data:image/jpg;base64,${body}`)?.mime).toBe("image/jpeg");
  });

  it("refuses formats no PDF library here can embed", () => {
    const body = Buffer.alloc(128, 7).toString("base64");
    expect(decodeImageDataUrl(`data:image/gif;base64,${body}`)).toBeNull();
    expect(decodeImageDataUrl(`data:image/svg+xml;base64,${body}`)).toBeNull();
    expect(decodeImageDataUrl(`data:application/pdf;base64,${body}`)).toBeNull();
  });

  it("refuses a payload too small to be a picture", () => {
    expect(decodeImageDataUrl(`data:image/png;base64,${Buffer.from("hi").toString("base64")}`)).toBeNull();
  });

  it("refuses anything that is not a data URL", () => {
    expect(decodeImageDataUrl(null)).toBeNull();
    expect(decodeImageDataUrl("")).toBeNull();
    expect(decodeImageDataUrl("https://example.com/sig.png")).toBeNull();
  });
});

describe("fitting a picture into a box", () => {
  it("never distorts", () => {
    const fitted = fitWithin({ width: 200, height: 100 }, { x: 0, y: 0, width: 50, height: 50 });
    expect(fitted.width / fitted.height).toBeCloseTo(2, 5);
    expect(fitted.width).toBeLessThanOrEqual(50);
    expect(fitted.height).toBeLessThanOrEqual(50);
  });

  it("centres what is left over", () => {
    const fitted = fitWithin({ width: 100, height: 100 }, { x: 10, y: 10, width: 50, height: 100 });
    expect(fitted.x).toBeCloseTo(10, 5);
    expect(fitted.y).toBeCloseTo(35, 5);
  });

  it("survives a degenerate image rather than dividing by zero", () => {
    const fitted = fitWithin({ width: 0, height: 0 }, { x: 5, y: 5, width: 10, height: 10 });
    expect(fitted.width).toBe(0);
    expect(Number.isFinite(fitted.x)).toBe(true);
  });
});

function withoutLength(bytes: Uint8Array): number {
  return bytes.byteLength;
}
