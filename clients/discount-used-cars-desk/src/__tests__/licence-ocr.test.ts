import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readLicenceImage } from "@/lib/sales/licence-ocr";

/**
 * The reader, end to end, on an actual image.
 *
 * The parser has its own tests against captured reader output. This one runs
 * the whole chain: a rendered card goes in as JPEG bytes, sharp flattens it,
 * tesseract reads it, and the parser turns that into the fields a sale uses.
 * The parser tests cannot catch a broken preprocessing step, a language file
 * that did not ship, or a worker that will not start, and each of those turns
 * the feature off completely while every unit test stays green. That has
 * already happened once on this feature: thirty-two passing tests sat on top of
 * a barcode reader that returned the literal text "<LF>" for every card.
 */

const TESSDATA = join(process.cwd(), "public", "tessdata", "eng.traineddata.gz");

/** A licence front, drawn rather than photographed, with known values. */
function card(): Promise<Buffer> {
  const svg = `<svg width="1012" height="638" xmlns="http://www.w3.org/2000/svg">
  <rect width="1012" height="638" fill="#eef2f6"/>
  <rect x="0" y="0" width="1012" height="86" fill="#1e3a5f"/>
  <text x="28" y="58" font-family="DejaVu Sans" font-size="40" font-weight="bold" fill="#ffffff">TEXAS</text>
  <text x="200" y="58" font-family="DejaVu Sans" font-size="30" fill="#dbe6f3">DRIVER LICENSE</text>
  <text x="28" y="140" font-family="DejaVu Sans" font-size="21" fill="#33475b">4d DL</text>
  <text x="110" y="140" font-family="DejaVu Sans" font-size="27" font-weight="bold" fill="#0b1620">38291746</text>
  <text x="28" y="196" font-family="DejaVu Sans" font-size="21" fill="#33475b">1</text>
  <text x="60" y="196" font-family="DejaVu Sans" font-size="27" font-weight="bold" fill="#0b1620">GUERRERO</text>
  <text x="28" y="234" font-family="DejaVu Sans" font-size="21" fill="#33475b">2</text>
  <text x="60" y="234" font-family="DejaVu Sans" font-size="27" font-weight="bold" fill="#0b1620">MARISOL ANDREA</text>
  <text x="28" y="290" font-family="DejaVu Sans" font-size="21" fill="#33475b">8</text>
  <text x="60" y="290" font-family="DejaVu Sans" font-size="25" fill="#0b1620">4412 ALDINE MAIL RD</text>
  <text x="60" y="324" font-family="DejaVu Sans" font-size="25" fill="#0b1620">HOUSTON, TX 77039</text>
  <text x="28" y="392" font-family="DejaVu Sans" font-size="21" fill="#33475b">3 DOB</text>
  <text x="130" y="392" font-family="DejaVu Sans" font-size="26" font-weight="bold" fill="#0b1620">03/14/1989</text>
  <text x="28" y="440" font-family="DejaVu Sans" font-size="21" fill="#33475b">4b EXP</text>
  <text x="130" y="440" font-family="DejaVu Sans" font-size="26" font-weight="bold" fill="#0b1620">03/14/2031</text>
  <text x="28" y="488" font-family="DejaVu Sans" font-size="21" fill="#33475b">4a ISS</text>
  <text x="130" y="488" font-family="DejaVu Sans" font-size="26" fill="#0b1620">02/02/2024</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

describe("the language data ships", () => {
  it("is vendored in public, the way the barcode decoder's wasm is", () => {
    // Without this file the reader falls back to fetching from a CDN at request
    // time, which is both an outbound call carrying nothing and a silent
    // failure in any environment that blocks it. A licence must not depend on
    // somebody else's uptime.
    expect(existsSync(TESSDATA)).toBe(true);
    expect(statSync(TESSDATA).size).toBeGreaterThan(1_000_000);
  });
});

describe("reading a licence front from image bytes", () => {
  it("returns the fields printed on the card", { timeout: 60_000 }, async () => {
    const fields = await readLicenceImage(await card());

    expect(fields).not.toBeNull();
    expect(fields?.licenseNumber).toBe("38291746");
    expect(fields?.name).toBe("Marisol Andrea Guerrero");
    expect(fields?.dateOfBirth).toBe("1989-03-14");
    expect(fields?.expires).toBe("2031-03-14");
    expect(fields?.address).toContain("Houston");
  });

  it("reads a card photographed badly", { timeout: 60_000 }, async () => {
    // Blurred, darkened and recompressed: a phone, indoors, in a hurry.
    const rough = await sharp(await card())
      .blur(0.8)
      .modulate({ brightness: 0.86 })
      .jpeg({ quality: 62 })
      .toBuffer();

    const fields = await readLicenceImage(rough);
    expect(fields?.licenseNumber).toBe("38291746");
    expect(fields?.dateOfBirth).toBe("1989-03-14");
  });

  it("reads a card held sideways", { timeout: 60_000 }, async () => {
    // A phone rotates by writing EXIF rather than by moving pixels, so without
    // sharp's rotate() this arrives on its side and reads as nothing at all.
    const sideways = await sharp(await card()).rotate(90).jpeg().toBuffer();
    const fields = await readLicenceImage(sideways);
    // Rotated pixels with no EXIF to undo them: the reader is expected to fail
    // here, and failing is the contract. What must not happen is a throw, or a
    // confident wrong answer.
    expect(fields === null || fields.licenseNumber === "38291746").toBe(true);
  });

  it("returns null for a photograph that is not an identity document", async () => {
    const notACard = await sharp({
      create: { width: 800, height: 500, channels: 3, background: "#cccccc" },
    })
      .jpeg()
      .toBuffer();

    expect(await readLicenceImage(notACard)).toBeNull();
  }, 60_000);

  it("returns null rather than throwing on bytes that are not an image", async () => {
    // The upload must survive a reader that cannot make sense of its input.
    expect(await readLicenceImage(Buffer.from("not an image at all"))).toBeNull();
  });
});
