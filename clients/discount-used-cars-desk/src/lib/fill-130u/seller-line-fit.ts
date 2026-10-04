import { StandardFontEmbedder, StandardFonts } from "pdf-lib";

/**
 * Whether a signer's name fits the 130-U seller line without being cut off.
 *
 * The seller's printed name is "Legal Name (First Last)" (owner's instruction
 * 10/01/2026; SOP 130-U bullet). A pairing too long for one line is drawn as
 * two lines at the 7.25pt house floor: the entity above, "(First Last)"
 * below. Nothing is ever drawn smaller, so a "(First Last)" wider than the box
 * at that size would be clipped by the box and the county would receive a
 * seller name with its end missing. This answers the question before that
 * can happen: at onboarding (the name is refused), before filing (the filer
 * is refused) and in the fill itself (the render throws).
 *
 * The figures are the fill's own (fill-pdf.ts: MIN_FONT_SIZE 7.25,
 * FIELD_HORIZONTAL_PADDING 4) and the box measured on public/forms/130-U.pdf
 * (221.13pt wide); a test reads the real field so they cannot drift apart.
 * Measured with the standard Helvetica metrics the fill embeds, without
 * loading the form.
 */

export const SELLER_NAME_BOX_WIDTH = 221.13;
export const SELLER_LINE_PADDING = 4;
export const SELLER_LINE_MIN_FONT_SIZE = 7.25;
export const SELLER_LINE_USABLE_WIDTH = SELLER_NAME_BOX_WIDTH - SELLER_LINE_PADDING;

let helvetica: StandardFontEmbedder | null = null;

/** Width of a line of the seller name at the 7.25pt floor, or Infinity when it cannot be drawn at all. */
export function sellerLineWidth(text: string, size: number = SELLER_LINE_MIN_FONT_SIZE): number {
  try {
    // pdf-lib's StandardFonts.Helvetica is the same string ("Helvetica") as
    // the embedder's own font-name type, which pdf-lib does not re-export.
    helvetica ??= StandardFontEmbedder.for(
      StandardFonts.Helvetica as unknown as Parameters<typeof StandardFontEmbedder.for>[0],
    );
    return helvetica.widthOfTextAtSize(text, size);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** True when "(person)" fits the seller box's lower line at the 7.25pt floor. */
export function signerFitsSellerLine(person: string, usable: number = SELLER_LINE_USABLE_WIDTH): boolean {
  const name = person.trim();
  if (!name) return true;
  return sellerLineWidth(`(${name})`) <= usable;
}
