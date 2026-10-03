import fontkit from "@pdf-lib/fontkit";
import { firstUnprintableOnStateForm } from "@/lib/forms/state-form-charset";

/**
 * A font that can print the name it is given, on a state form: the part
 * that runs anywhere (the server's fillers and the browser's preview of the
 * state's rebuilt disclosure). The server's file read lives in
 * `unicode-text.ts`; this module never imports a Node built-in, so a client
 * component can load it.
 *
 * The state forms are filled in Helvetica, whose encoding is WinAnsi. A
 * buyer named "Nguyễn Văn An" or "Łukasz Wójcik" could not be printed:
 * pdf-lib threw while measuring the name and the whole document failed to
 * render. When every value is WinAnsi the answer is the Helvetica the caller
 * embedded and the output is byte for byte what it was. Only when a value is
 * not does it embed DejaVu Sans (public/fonts/pdf, Bitstream Vera licence
 * beside it), a Helvetica-like face that covers Latin Extended and
 * Vietnamese.
 */

/** Where the browser fetches the face; the server reads the same file. */
export const UNICODE_FONT_PUBLIC_PATH = "/fonts/pdf/DejaVuSans.ttf";

/** True when Helvetica can print every value given. */
export function printsInHelvetica(...values: Array<string | null | undefined>): boolean {
  return values.every((value) => !value || firstUnprintableOnStateForm(value) === null);
}

export type FontDocument<F> = {
  registerFontkit(kit: unknown): void;
  embedFont(bytes: Uint8Array, options?: { subset?: boolean }): Promise<F>;
};

/** The face's bytes: the file on the server, a fetch in the browser. */
export type UnicodeFontLoader = () => Promise<Uint8Array>;

/** The browser's loader: the same file, served from public/. */
export const fetchUnicodeFont: UnicodeFontLoader = async () => {
  const response = await fetch(UNICODE_FONT_PUBLIC_PATH);
  if (!response.ok) throw new Error("The font for this name could not be loaded.");
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * The Helvetica the caller embedded, or the Unicode face when any value
 * needs it. One font for the whole document, so a name and its neighbours
 * print in the same face.
 *
 * `subset: false` for the decrypting pdf-lib fork the VTR-271 uses: its
 * subsetter expects a newer fontkit than the one installed and throws, so
 * that form embeds the whole face (only for a name Helvetica cannot print).
 */
export async function embedFontFor<F>(
  pdf: FontDocument<F>,
  helvetica: F,
  values: Array<string | null | undefined>,
  load: UnicodeFontLoader,
  options: { subset?: boolean } = {},
): Promise<{ font: F; unicode: boolean }> {
  if (printsInHelvetica(...values)) return { font: helvetica, unicode: false };
  const bytes = await load();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(bytes, { subset: options.subset ?? true });
  return { font, unicode: true };
}

/** Every string value of a record, for `fontFor`. */
export function stringValues(record: Record<string, unknown>): string[] {
  return Object.values(record).filter((value): value is string => typeof value === "string");
}
