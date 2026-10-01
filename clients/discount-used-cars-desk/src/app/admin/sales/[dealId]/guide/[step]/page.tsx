import { readSalePlan } from "@/lib/sales/sale-plan";
import { SALVAGE_STEP_KEY, readSalvagePlan } from "@/lib/sales/salvage-plan";
import { dealTitleBadge } from "@/lib/sales/deal-badge";
import type { TitleWorkRow } from "@/lib/vehicles/title-path";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import GuideStepScreen, {
  type GuideScreenStep,
} from "@/components/admin/guide/GuideStepScreen";
import { getSaleDetail, paperworkHref, saleDocumentHref, vehicleLabel } from "@/lib/admin/sale-desk";
import {
  buildGuideSteps,
  findGuideStep,
  nextOpenStep,
  stepPosition,
  type GuideStep,
} from "@/lib/sales/guide";
import { summaryHref } from "@/lib/sales/sale-summary";
import { buildLenderDirectory } from "@/lib/sales/lenders";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { readMoney } from "@/lib/sales/money";
import { readPaperwork } from "@/lib/sales/paperwork";
import { captureUrl, issueCaptureToken } from "@/lib/sales/capture-token";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL, factOr } from "@/lib/dealership-config";
import { buildHandoffFields } from "@/lib/sales/webdealer";
import { dealership } from "@/lib/dealership-config";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";

export const dynamic = "force-dynamic";
export const metadata = { title: `Sale - ${dealership.shortName} Auto` };

interface Props {
  params: Promise<{ dealId: string; step: string }>;
  /** `from=summary` when the expert lane sent the operator here to change one answer. */
  searchParams: Promise<{ from?: string }>;
}

/**
 * One stage, one screen.
 *
 * The whole viewport belongs to the question. There is no packet list beside
 * it, no buyer panel above it and no next-step hints below it, because every
 * one of those is a thing to read before answering, and the point of this
 * route is that there is nothing to read before answering.
 *
 * The steps come from the deal rather than from a script, so this and the desk
 * view never disagree: answer here and the desk changes, sign a document from
 * the desk and the step here is already done.
 *
 * This page is the server half: which step, what the deal holds, every href,
 * every signed URL. The words are the client half (GuideStepScreen), because
 * the corridor is bilingual and the toggle swaps every word in place without
 * a navigation — so every translated string renders through the provider.
 *
 * Kept from the pre-split page, because they are behavior rather than words:
 * the funding and lender steps move on when answered (a Next here would be a
 * second way to do the same thing, and the one that skips the question), and
 * both money steps carry their own Next inside the form — a keyboard has no
 * moment that means done, and on the price page a plain link lost a race
 * against the down-payment box's blur save.
 */

/** The catalogue key a guide step's question lives under. */
function questionKind(step: GuideStep): GuideScreenStep["questionKind"] {
  switch (step.key) {
    case "language":
      return "language";
    case "buyer":
      return "buyer";
    case "buyerId":
      return step.question === "Check What The Card Says."
        ? "buyerIdReview"
        : "buyerIdCapture";
    case "funding":
      return "funding";

    case "lender":
      return "lender";
    case "paid":
      return "paid";
    case "price":
      return "price";
    case "plate":
      return "plate";
    case "titleWork":
      return "titleWork";
    case SALVAGE_STEP_KEY:
      return "salvagePath";
    case "title":
      return "title";
    case "packet":
      return "packet";
    default:
      /*
        Narrowed on purpose.

        This used to return "signDocument" for anything it did not recognise,
        so a new step key that nobody wired rendered as a document heading
        with no controls underneath it: a dead end that looks like a working
        screen. Only an actual document key falls through now, and a plan
        question names itself.
      */
      if (step.key.startsWith("plan:")) return "planQuestion";
      if (step.key.startsWith("document:")) return "signDocument";
      return "packet";
  }
}

export default async function GuideStepPage({ params, searchParams }: Props) {
  const { dealId, step } = await params;
  const { from } = await searchParams;
  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  /**
   * The way home, when the summary opened this screen.
   *
   * Null on an ordinary walk. Set on a Change trip, and then it is what the
   * step navigates to once it saves and what the nav offers instead of Back
   * and Next. Half of Check Answers is the return; without it a change costs
   * the reader their place and the fast lane is slower than the corridor.
   */
  const returnHref = from === "summary" ? summaryHref(sale.id) : null;
  const fromQuery = returnHref ? "?from=summary" : "";

  const steps = buildGuideSteps(sale);
  const current = findGuideStep(steps, decodeURIComponent(step));

  // A step that does not exist on this deal, usually a stale link after the
  // funding answer changed, lands on whatever is actually outstanding rather
  // than on a 404 that tells the operator nothing. The trip marker survives
  // the redirect, so a stale summary link still comes back here.
  if (!current) {
    const open = nextOpenStep(steps);
    redirect(
      `/admin/sales/${encodeURIComponent(dealId)}/guide/${encodeURIComponent(open?.key ?? "buyer")}${fromQuery}`,
    );
  }

  // The last step is a page of its own, not a panel on this one.
  if (current.key === "packet") {
    redirect(`/admin/sales/${encodeURIComponent(dealId)}/packet`);
  }

  const index = stepPosition(steps, current.key);
  const following = index < steps.length - 1 ? steps[index + 1] : null;

  /**
   * The licence step needs three things only the server can produce: a signed
   * capture token, a QR of the link, and a short-lived signed URL for the
   * photograph. The bucket is private, so a plain path would render nothing.
   *
   * Built only on that step. Issuing a token on every screen would mint links
   * nobody asked for, and each one is valid for fifteen minutes.
   */
  const capture = await (async () => {
    if (current.key !== "buyerId") {
      return {
        url: "",
        token: "",
        qr: "",
        imageUrl: null as string | null,
        backUrl: null as string | null,
        documentUrl: null as string | null,
      };
    }

    const held = readBuyerId(sale.stepData);
    let imageUrl: string | null = null;
    let backUrl: string | null = null;
    let documentUrl: string | null = null;
    if (held.image || held.backImage || held.document) {
      const supabase = await createClient();
      // Ten minutes: long enough to read the card against the fields, short
      // enough that a URL copied out of the page stops working quickly.
      const sign = async (path: string | null) => {
        if (!path) return null;
        const { data } = await supabase.storage.from("buyer-ids").createSignedUrl(path, 600);
        return data?.signedUrl ?? null;
      };
      imageUrl = await sign(held.image);
      backUrl = await sign(held.backImage);
      documentUrl = await sign(held.document);
    }

    /**
     * The phone handoff is a convenience, and it is not allowed to be the
     * reason a sale cannot be written. Signing a capture link needs
     * `ADMIN_SESSION_SECRET`; a missing one costs the phone and nothing
     * else — the step still renders and the fields are still typable.
     * (Production error digest 2093187135 is why this is a try/catch.)
     */
    try {
      const token = issueCaptureToken(sale.id);
      const url = captureUrl(SITE_URL, token);
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 380,
        errorCorrectionLevel: "M",
      });
      return { url, token, qr, imageUrl, backUrl, documentUrl };
    } catch {
      return { url: "", token: "", qr: "", imageUrl, backUrl, documentUrl };
    }
  })();

  /** The bill of sale's answers, for the one figure the money step shares. */
  const billOfSale = readPaperwork(sale.stepData, "billOfSale");

  /**
   * The salvage car's title work, loaded only on the step that shows it.
   * The rows are the steps done so far; the checklist measures the rest.
   */
  const titleWork = await (async () => {
    if (current.key !== "titleWork" || !sale.vehicle?.id) return null;
    try {
      const { loadTitleWork } = await import("@/lib/vehicles/title-work-load");
      return { vehicleId: sale.vehicle.id, rows: await loadTitleWork(sale.vehicle.id) };
    } catch {
      return { vehicleId: sale.vehicle.id, rows: [] as TitleWorkRow[] };
    }
  })();

  const nextHref =
    returnHref ??
    (following
      ? `/admin/sales/${encodeURIComponent(dealId)}/guide/${encodeURIComponent(following.key)}`
      : `/admin/sales/${encodeURIComponent(dealId)}`);

  const screenSteps: GuideScreenStep[] = steps.map((entry) => ({
    key: entry.key,
    questionKind: questionKind(entry),
    question: entry.question,
    ...(entry.document?.documentType
      ? {
          documentState:
            sale.documents[entry.document.documentType] === "signed"
              ? ("signed" as const)
              : ("filed" as const),
        }
      : {}),
    ...(entry.document
      ? {
          documentType: entry.document.documentType,
          documentTitle: entry.document.title,
        }
      : {}),
    done: entry.done,
  }));

  const documentHref = current.document
    ? (paperworkHref(current.document, sale.id) ??
      saleDocumentHref(current.document, sale.id))
    : null;

  const { lang, userId } = await resolveAdminLanguageWithUser();

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <GuideStepScreen
        dealId={sale.id}
        vehicle={vehicleLabel(sale.vehicle)}
        buyerName={sale.buyer?.name?.trim() ?? ""}
        steps={screenSteps}
        currentKey={current.key}
        documentHref={documentHref}
        capture={capture}
        moneyInitial={readMoney(sale.stepData)}
        buyerIdInitial={readBuyerId(sale.stepData)}
        tradeInAllowance={
          billOfSale.tradeIn === "yes" ? Number(billOfSale.tradeInAllowance) || 0 : 0
        }
        funding={sale.funding.type}
        advertised={sale.vehicle?.salePrice ?? 0}
        lenders={buildLenderDirectory(dealership.lenders)}
        currentLenderId={sale.funding.lenderId}
        handoffFields={buildHandoffFields(sale, factOr(dealership.license, "dealer licence (GDN)"))}
        webDealerUrl={dealership.webDealerUrl}
        plate={sale.plate}
        salePlan={readSalePlan(sale.stepData)}
        titleWork={titleWork}
        salvagePath={readSalvagePlan(sale.stepData).path}
        badge={(() => {
          const badge = dealTitleBadge(sale.vehicle?.titleStatus, readSalvagePlan(sale.stepData).path);
          return { key: badge.key, tone: badge.tone };
        })()}
        nextHref={nextHref}
        returnHref={returnHref}
      />
    </FunnelLocaleProvider>
  );
}
