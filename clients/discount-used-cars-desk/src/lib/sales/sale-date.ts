import { currentCopy, readPrintedData, type AgreementRecord } from "@/lib/sales/filed-documents";

/**
 * The date of sale every later document prints: the current filed bill of
 * sale's (or salvage bill of sale's), so a 130-U or an acknowledgment filed
 * the next morning is still dated the day the car was sold, and its lien
 * date is the sale's. Null when no bill of sale is filed yet (the document
 * being filed is the first, and today is its date). Signature dates stay
 * the day each signature was drawn.
 */
export async function saleDateFor(client: unknown, rows: readonly AgreementRecord[]): Promise<string | null> {
  const root = currentCopy(rows, "billOfSale") ?? currentCopy(rows, "salvageBillOfSale");
  if (!root?.id) return null;
  const printed = await readPrintedData(client, root.id).catch(() => null);
  const date = printed?.saleDate;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
