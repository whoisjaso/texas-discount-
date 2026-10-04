import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ dealId: string; stepKey: string }>;
}

/**
 * The step flow is gone. Its links are not.
 *
 * A sale used to be nine screens, and six of them asked nothing: a document
 * icon, a status line, and Continue. The packet is a state, not a sequence, so
 * it is shown on the sale itself and the operator opens whatever is next.
 *
 * Bookmarks, texted links and half-finished sessions still point here, so this
 * route stays and lands them on the sale rather than on a 404.
 */
export default async function RetiredSaleStepPage({ params }: Props) {
  const { dealId } = await params;
  redirect(`/admin/sales/${encodeURIComponent(dealId)}`);
}
