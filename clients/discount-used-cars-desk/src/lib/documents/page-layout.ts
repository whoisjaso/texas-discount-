/**
 * The stamp that tells a filed copy from before the page-by-page paperwork
 * from one after it.
 *
 * A renderer that learns to print a value differently must not reprint a
 * signed copy differently. Where the new reading uses a key every old copy
 * already carried (the bill of sale has always carried `amountPaidToday`),
 * the key itself cannot tell old from new, so filing stamps this, and the
 * renderer takes its new reading only on a copy that carries it:
 *
 *   Total Paid        what was paid today on a cash or in-house sale, the
 *                     total due (paid by the buyer and the lender together)
 *                     on a bank deal; an old copy prints the total due
 *   unsigned lines    dated with the sale date; an old copy keeps the date
 *                     it was printed, as it always did
 *   the 130-U state   no "TX" added to a mailing address that has none
 */
export const PAGE_LAYOUT = 1;

export function laidOutByPages(data: Record<string, unknown> | null | undefined): boolean {
  return typeof data?.pageLayout === "number" && data.pageLayout >= PAGE_LAYOUT;
}
