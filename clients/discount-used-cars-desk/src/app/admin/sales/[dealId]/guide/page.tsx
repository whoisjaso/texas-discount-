import { notFound, redirect } from "next/navigation";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { buildGuideSteps, nextOpenStep } from "@/lib/sales/guide";

export const dynamic = "force-dynamic";

/**
 * The way into the funnel.
 *
 * Somebody arriving at a sale wants the next thing to do, not a menu of every
 * thing there is to do. This works that out from the deal and sends them
 * straight to it, so starting a sale, coming back to one, and following a link
 * from the desk all land on the same screen: the first question still waiting
 * on an answer.
 *
 * There was no route here for a long time, and that absence is what made the
 * product feel like a pile rather than a process. Starting a sale dropped the
 * operator on the deal's summary page, which lists the whole packet at once,
 * so the step-by-step flow existed and nothing ever walked anybody into it.
 *
 * When every step is done there is nothing to ask, so the summary is the right
 * destination: at that point a list of what happened is exactly what is wanted.
 */
export default async function GuideEntryPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  const steps = buildGuideSteps(sale);
  const next = nextOpenStep(steps);

  redirect(next ? `/admin/sales/${dealId}/guide/${next.key}` : `/admin/sales/${dealId}`);
}
