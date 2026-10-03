/**
 * Putting a raster into a PDF, whichever kind of raster arrived.
 *
 * The two images this product puts on paper come from different places and
 * arrive in different formats, and the format is not a detail: `embedPng`
 * throws on a JPEG rather than coping with it, so a single wrong guess turns a
 * document into a 500.
 *
 *   signature pads  ->  PNG   (`toDataURL("image/png")`, transparent ground)
 *   licence photos  ->  JPEG  (the camera path encodes at quality 0.92)
 *
 * So nothing here guesses. The mime is read off the data URL, and anything that
 * is neither PNG nor JPEG is refused rather than attempted.
 *
 * Deliberately not typed against `pdf-lib`. The 130-U uses plain `pdf-lib` and
 * the VTR-271 uses the `@cantoo/pdf-lib` fork, because that form is published
 * encrypted and plain pdf-lib cannot open it. Their `PDFDocument` types are not
 * interchangeable, so this takes the smallest shape that both satisfy.
 */

/** The part of a PDFDocument this file needs. Both pdf-lib builds satisfy it. */
export interface ImageEmbedder<TImage> {
  embedPng(bytes: Uint8Array): Promise<TImage>;
  embedJpg(bytes: Uint8Array): Promise<TImage>;
}

export interface DecodedImage {
  bytes: Uint8Array;
  /** Normalised: "image/png" or "image/jpeg". */
  mime: string;
}

const SUPPORTED = new Set(["image/png", "image/jpeg"]);

/**
 * Pull the bytes out of a `data:` URL.
 *
 * Returns null rather than throwing for anything unusable, because every caller
 * is decorating a document rather than depending on the image: a missing
 * signature is a line somebody signs in ink, and a missing licence photograph
 * is a page that does not get appended. Neither is worth failing a document
 * generation over.
 */
export function decodeImageDataUrl(value: string | null | undefined): DecodedImage | null {
  if (!value || typeof value !== "string") return null;
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value.trim());
  if (!match) return null;

  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (!SUPPORTED.has(mime)) return null;

  try {
    const bytes = Buffer.from(match[2], "base64");
    // A handful of bytes is a truncated upload, not a picture.
    if (bytes.byteLength < 64) return null;
    return { bytes: new Uint8Array(bytes), mime };
  } catch {
    return null;
  }
}

/** Embed a decoded image, choosing the decoder from its actual mime. */
export async function embedImage<TImage>(
  pdf: ImageEmbedder<TImage>,
  image: DecodedImage,
): Promise<TImage | null> {
  try {
    return image.mime === "image/png"
      ? await pdf.embedPng(image.bytes)
      : await pdf.embedJpg(image.bytes);
  } catch {
    // A file that claims to be a PNG and is not gets refused here rather than
    // taking the whole document down with it.
    return null;
  }
}

/** Embed straight from a data URL. Null when there is nothing usable. */
export async function embedImageDataUrl<TImage>(
  pdf: ImageEmbedder<TImage>,
  value: string | null | undefined,
): Promise<TImage | null> {
  const decoded = decodeImageDataUrl(value);
  return decoded ? embedImage(pdf, decoded) : null;
}

/**
 * Fit a picture inside a box without distorting it.
 *
 * A signature stretched to fill its line stops looking like the person's
 * handwriting, and a licence squashed to a page shape stops being readable
 * evidence of anything. Both keep their aspect ratio and get centred in
 * whatever space they were given.
 */
export function fitWithin(
  image: { width: number; height: number },
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (image.width <= 0 || image.height <= 0) {
    return { x: box.x, y: box.y, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}
