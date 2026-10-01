import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import { spanishEsignBlocked } from "@/lib/legal/spanish-esign";

/**
 * What the buyer is handed to sign, and in what order.
 *
 * Pure, so the page that draws the ceremony and the test that checks it read
 * the same rule. The rows come from `document_agreements`; the order is the
 * packet's own (the rebuilt disclosure before anything, then the bill of
 * sale), because that is the order the law wants them read in.
 *
 * What is left out, and why:
 *   - a draft: nothing is signed until it is filed
 *   - the power of attorney: its odometer disclosure is a wet signature on a
 *     state form, never a stroke on a screen
 *   - a row with no completed link: there is no sheet to show, and a buyer
 *     must not sign what they cannot read
 */

export type CeremonyRow = {
  id: string;
  documentType: string | null;
  finalized: boolean;
  hasCompletedLink: boolean;
  signed: boolean;
};

export type CeremonyDocument = {
  id: string;
  documentType: string;
  title: string;
  signed: boolean;
};

const INK_ONLY = new Set(["powerOfAttorney"]);

export type CeremonyOptions = {
  /**
   * True when the plan says WE sign the title application for an absent
   * buyer under a power of attorney. The 130-U is then not the buyer's to
   * sign, and offering it would put a buyer stroke on an application the
   * dealer is about to sign in their stead.
   */
  dealerSignsTitle?: boolean;
};

export function ceremonyDocuments(rows: CeremonyRow[], options: CeremonyOptions = {}): CeremonyDocument[] {
  const order = SALE_DOCUMENTS.map((entry) => entry.documentType).filter(Boolean) as string[];
  const rank = (type: string) => {
    const at = order.indexOf(type);
    return at === -1 ? order.length : at;
  };
  const seen = new Set<string>();
  return rows
    .filter((row) => row.documentType && row.finalized && row.hasCompletedLink && !INK_ONLY.has(row.documentType))
    .filter((row) => !(options.dealerSignsTitle && row.documentType === "form130U"))
    .sort((a, b) => rank(a.documentType as string) - rank(b.documentType as string))
    .filter((row) => {
      // One sheet per type: the filed row is the record, and a second row of
      // the same type is a re-filing whose newer copy the packet already
      // prefers. Rows arrive newest first, so the first seen wins.
      const type = row.documentType as string;
      if (seen.has(type)) return false;
      seen.add(type);
      return true;
    })
    .map((row) => ({
      id: row.id,
      documentType: row.documentType as string,
      title: SALE_DOCUMENTS.find((entry) => entry.documentType === row.documentType)?.title ?? (row.documentType as string),
      signed: row.signed,
    }));
}

/**
 * Whether a stroke may be taken on this sale at all.
 *
 * The one shared Spanish e-sign guard, read with a stand-in signature so it
 * answers the question "would a signature be refused": a Spanish sale's
 * ceremony shows the sheets and ends with print for ink until counsel signs
 * the Spanish copy.
 */
export function ceremonyCanSign(language: string | null | undefined): boolean {
  return !spanishEsignBlocked(language, "data:image/png;base64,stroke");
}
