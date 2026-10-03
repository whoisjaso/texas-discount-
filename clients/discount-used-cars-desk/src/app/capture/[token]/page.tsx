import type { Metadata } from "next";
import { safeBackPath } from "@/lib/sales/capture-back";
import { verifyCaptureToken } from "@/lib/sales/capture-token";
import { dealership } from "@/lib/dealership-config";
import { createServiceClient } from "@/lib/supabase/service";
import { isLanguageSettled } from "@/lib/sales/deal-language";
import { getFunnelStrings } from "@/lib/sales/i18n";
import CaptureClient from "./CaptureClient";

/**
 * The phone screen. One job: photograph the licence.
 *
 * Deliberately outside `[locale]`, so it carries none of the site chrome. There
 * is no header, no menu and no footer, because the person holding this phone
 * arrived from a QR code at a desk with a customer waiting, and every other
 * link on the page is a way to lose that.
 *
 * The token is checked here, on the server, before anything renders. An expired
 * link says so plainly, because the fix is to ask the desk for a new one and
 * somebody needs to know that rather than tapping a dead button.
 *
 * Whose language? The buyer's — this is often the buyer's own phone. One
 * rule, resolved here by re-reading the deal at open (so a language answered
 * after the link was issued still lands): the deal's language when it has
 * been CONFIRMED, else a tiny EN/ES toggle and the person holding the phone
 * picks. The customer row is never consulted — its schema default makes an
 * unasked value untrustworthy — and the operator's screen preference plays
 * no part on a customer-facing page.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `Photograph The Licence | ${dealership.shortName}`,
  robots: "noindex, nofollow",
};

export default async function CapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ back?: string | string[] }>;
}) {
  const { token } = await params;
  const { back } = await searchParams;
  // Only the desk's own phone carries this, and it is attacker-writable like
  // any query param, so it is only ever used once it proves it is a path into
  // this site's sale guide. Anything else renders as no link at all.
  const backPath = safeBackPath(Array.isArray(back) ? back[0] : back);
  const verified = verifyCaptureToken(decodeURIComponent(token));

  if (!verified.ok) {
    // The dead-link screen has no deal to read a language from, so it says
    // both — with EQUAL weight, heading included. An English-primary error
    // with Spanish demoted underneath is exactly the inversion the persona
    // walk flagged: the person most likely to be holding this phone alone
    // is the one reading the small print.
    const en = getFunnelStrings("en").capture;
    const es = getFunnelStrings("es").capture;
    const expired = verified.reason === "expired";
    return (
      <main className="ed-capture ed-capture-dead">
        <h1 className="ed-capture-title" lang="es">
          {expired ? es.expiredTitle : es.invalidTitle}
        </h1>
        <p className="ed-capture-note" lang="es">
          {expired ? es.expiredNote : es.invalidNote}
        </p>
        <h2 className="ed-capture-title">
          {expired ? en.expiredTitle : en.invalidTitle}
        </h2>
        <p className="ed-capture-note">{expired ? en.expiredNote : en.invalidNote}</p>
      </main>
    );
  }

  // Re-read the deal for its language, best-effort: a capture link must
  // never die because a language read failed — the chooser is the fallback.
  let locale: "en" | "es" | null = null;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("deals")
      .select("language, step_data")
      .eq("id", verified.dealId)
      .maybeSingle();
    if (data && isLanguageSettled(data.step_data)) {
      locale = data.language === "es" ? "es" : "en";
    }
  } catch {
    locale = null;
  }

  return (
    <CaptureClient
      token={decodeURIComponent(token)}
      back={backPath}
      locale={locale}
    />
  );
}
