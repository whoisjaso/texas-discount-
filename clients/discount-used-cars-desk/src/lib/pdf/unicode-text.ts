import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { embedFontFor, type FontDocument, type UnicodeFontLoader } from "@/lib/pdf/unicode-font";

export { printsInHelvetica, stringValues } from "@/lib/pdf/unicode-font";

/**
 * The server's side of `unicode-font.ts`: the Unicode face read from
 * public/fonts/pdf, for the fillers that run on the server (the 130-U, the
 * VTR-271, the VTR-61 and the PDF route's rebuilt disclosure).
 */

export const UNICODE_FONT_PATH = join(process.cwd(), "public", "fonts", "pdf", "DejaVuSans.ttf");

let fontBytes: Uint8Array | null = null;

/** The face's bytes, read once per process. */
export const readUnicodeFont: UnicodeFontLoader = async () => {
  fontBytes ??= new Uint8Array(await readFile(UNICODE_FONT_PATH));
  return fontBytes;
};

/** The Helvetica the caller embedded, or the Unicode face when any value needs it. */
export async function fontFor<F>(
  pdf: FontDocument<F>,
  helvetica: F,
  values: Array<string | null | undefined>,
  options: { subset?: boolean } = {},
): Promise<{ font: F; unicode: boolean }> {
  return embedFontFor(pdf, helvetica, values, readUnicodeFont, options);
}
