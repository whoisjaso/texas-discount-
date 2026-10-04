import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { usDate } from "@/lib/documents/us-date";
import { printsOnStateForm } from "@/lib/forms/state-form-charset";

/**
 * A voided copy prints marked void (owner's decision 10/02/2026).
 *
 * The stored record is never touched: its row, its payload and its bytes are
 * the record of what was filed and signed. What the packet's Open and Print
 * hand out for a voided copy is those same bytes with a mark drawn over every
 * page: a diagonal VOID (VOID · ANULADO on a Spanish sale) and a band across
 * the top saying when it was voided, by whom and why. Nobody can mistake the
 * printout for a live document, and nothing about the original is lost.
 *
 * Helvetica (WinAnsi), like the state forms: a character it cannot draw is
 * replaced, and the reason is cut to two lines with an ellipsis. The full
 * reason stays in the packet's history and the audit event.
 */

export type VoidStamp = {
  voidedAt: string | null | undefined;
  byName: string | null | undefined;
  reason: string | null | undefined;
  language?: string | null;
};

const RED = rgb(0.72, 0.1, 0.08);

/** Text Helvetica can draw: anything else becomes "?". */
export function printableForStamp(text: string): string {
  return Array.from(text.normalize("NFC").replace(/\s+/g, " ").trim())
    .map((char) => (printsOnStateForm(char) ? char : "?"))
    .join("");
}

/** The band's sentence, in the copy's language. */
export function voidBandText(stamp: VoidStamp): string {
  const when = usDate(stamp.voidedAt ?? "") || "";
  const who = (stamp.byName ?? "").trim() || (stamp.language === "es" ? "el mostrador" : "the desk");
  const why = (stamp.reason ?? "").trim();
  return stamp.language === "es"
    ? `Anulado el ${when} por ${who}: ${why}`
    : `Voided ${when} by ${who}: ${why}`;
}

/** At most `lines` lines of `text` that fit `width` at `size`, the last cut with an ellipsis. */
export function wrapToWidth(text: string, font: PDFFont, size: number, width: number, lines = 2): string[] {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
  const cut = (value: string) => {
    let kept = value;
    while (kept.length > 0 && !fits(`${kept}...`)) kept = kept.slice(0, -1);
    return `${kept.trimEnd()}...`;
  };
  const all: string[] = [];
  let current = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) all.push(current);
    // A single word wider than the line is cut too.
    current = fits(word) ? word : cut(word);
  }
  if (current) all.push(current);
  if (all.length <= lines) return all;
  const kept = all.slice(0, lines);
  kept[lines - 1] = cut(kept[lines - 1]);
  return kept;
}

export async function stampVoided(bytes: Uint8Array | ArrayBuffer, stamp: VoidStamp): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const mark = stamp.language === "es" ? "VOID · ANULADO" : "VOID";
  const band = printableForStamp(voidBandText(stamp));

  for (const page of document.getPages()) {
    const { width, height } = page.getSize();

    // The diagonal mark, centred, sized to the page.
    const diagonal = Math.sqrt(width * width + height * height);
    let size = Math.min(150, (diagonal * 0.6) / Math.max(1, bold.widthOfTextAtSize(mark, 1)));
    size = Math.max(36, size);
    const textWidth = bold.widthOfTextAtSize(mark, size);
    const angle = Math.atan2(height, width);
    const cx = width / 2;
    const cy = height / 2;
    page.drawText(mark, {
      x: cx - (Math.cos(angle) * textWidth) / 2 + (Math.sin(angle) * size * 0.35),
      y: cy - (Math.sin(angle) * textWidth) / 2 - (Math.cos(angle) * size * 0.35),
      size,
      font: bold,
      color: RED,
      opacity: 0.35,
      rotate: degrees((angle * 180) / Math.PI),
    });

    // The band across the top: when, by whom, why.
    const margin = 18;
    const fontSize = 9;
    const lines = wrapToWidth(band, regular, fontSize, width - margin * 2 - 8, 2);
    const bandHeight = 10 + lines.length * (fontSize + 3);
    page.drawRectangle({
      x: margin,
      y: height - margin - bandHeight,
      width: width - margin * 2,
      height: bandHeight,
      color: rgb(1, 1, 1),
      opacity: 0.92,
      borderColor: RED,
      borderWidth: 1,
    });
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: margin + 4,
        y: height - margin - 6 - fontSize - i * (fontSize + 3),
        size: fontSize,
        font: i === 0 ? bold : regular,
        color: RED,
      });
    });
  }

  return document.save();
}
