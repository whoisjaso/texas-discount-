import type { SaleDetail } from "@/lib/admin/sale-desk";
import { paperworkMoney, readPaperwork, type PaperworkContext, type PaperworkMoney } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { emptyWeightContext } from "@/lib/vehicles/empty-weight/on-the-sale";
import type { DealFeeLines } from "@/lib/sales/fee-schedule";

/**
 * What a document's questions and review screen know about the sale, built
 * once for the review page and for the filing that checks it, so the answers
 * the screen shows and the answers the server files are worked out the same
 * way (refile-gates.ts, answersDiffer).
 *
 * The county is the one input looked up from outside the sale (the review
 * page resolves it from the mailing address); it only ever starts the 130-U's
 * county answer when nobody has typed one, so the caller passes it in. The
 * 130-U's box 11 is read off the sale (empty-weight/on-the-sale.ts), never
 * looked up here.
 */
export function paperworkFilingContext(
  sale: SaleDetail,
  documentType: string,
  buyerCounty: string,
  /** The sale's own fee lines (dealership-fees.ts); absent, the config's. */
  fees?: DealFeeLines,
): { money: PaperworkMoney; context: PaperworkContext } {
  const answers = readPaperwork(sale.stepData, documentType);
  /*
    The trade-in is asked on the bill of sale only, so every document reads
    the money with the bill of sale's answers (SOP "Money": tax after
    trade-in; "every figure is read off the sale once").
  */
  const money = paperworkMoney(
    sale.vehicle?.salePrice,
    readPaperwork(sale.stepData, "billOfSale"),
    readMoney(sale.stepData),
    sale.funding.type,
    fees,
  );
  const mailing = readBuyerId(sale.stepData).mailing;
  const context: PaperworkContext = {
    funding: sale.funding.type,
    bodyStyle: (sale.vehicle?.bodyStyle ?? "").toLowerCase(),
    licenceState: sale.buyer?.idState ?? "",
    paidToday: money.paidToday > 0 ? money.paidToday : null,
    buyerCity: mailing.city ?? "",
    buyerCounty,
    vehicleWeight: sale.vehicle?.weightLbs ?? null,
    /*
      Box 11 as the review screen resolves it: the deal's confirmed answer
      with its record, or the vehicle's document figure. No lookup and no
      estimate (an unconfirmed estimate is never an answer), so the server's
      answers carry the same box 11 the review posted, and a 130-U posted
      with a box 11 the sale no longer holds is refused.
    */
    emptyWeight: documentType === "form130U" ? emptyWeightContext(sale.vehicle, null) : null,
    dealTotal: money.total,
    vehicleYear: sale.vehicle?.year ?? null,
    saleYear: Number((sale.startedAt ?? sale.createdAt).slice(0, 4)) || undefined,
    answers,
  };
  return { money, context };
}
