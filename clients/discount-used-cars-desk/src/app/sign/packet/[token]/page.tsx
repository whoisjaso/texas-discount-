import type { Metadata } from "next";
import { verifySigningToken } from "@/lib/sales/signing-token";
import { ceremonyCanSign, ceremonyDocuments, type CeremonyRow } from "@/lib/sales/signing-ceremony";
import { createServiceClient } from "@/lib/supabase/service";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { DocumentSheet, KNOWN_SECTIONS } from "@/components/documents/DocumentSheet";
import { getFunnelStrings } from "@/lib/sales/i18n";
import { dealership, brand, factOr } from "@/lib/dealership-config";
import { fieldCase } from "@/lib/documents/presentation-case";
import { readSalePlan } from "@/lib/sales/sale-plan";
import Wordmark from "@/components/site/shared/Wordmark";
import CeremonyClient, { type CeremonyPage } from "./CeremonyClient";
import OfficialFormSheet from "./OfficialFormSheet";

/**
 * The signing ceremony: the buyer's screen.
 *
 * Outside the site chrome, like the licence capture page, because the
 * person holding this is a buyer with a desk waiting, and every other link
 * on a page is a way to lose them. The token is checked here, on the
 * server, before anything renders; an expired one says so plainly, because
 * the fix is to ask the desk for a new one.
 *
 * Every sheet on this page is drawn by the same component the PDF renderer
 * uses, from the same filed payload. The buyer reads the page that will
 * print, not a summary of it.
 *
 * Whose language: the deal's. A sale conducted in Spanish shows Spanish
 * sheets and Spanish words around them, and, until counsel signs the
 * Spanish legal copy, ends with print for ink rather than a pad.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `Sign The Paperwork | ${dealership.shortName}`,
  robots: "noindex, nofollow",
};

function Plain({ title, note }: { title: string; note: string }) {
  return (
    <main className="ed-sign ed-sign-plain">
      <div className="ed-sign-plain-card">
        <Wordmark width={160} tone="dark" withSubline emblem />
        <h1 className="ed-sign-title">{title}</h1>
        <p className="ed-sign-lead">{note}</p>
        <p className="ed-sign-fine">
          {factOr(dealership.legalName, "dealer legal name")} · {dealership.phone.display}
        </p>
      </div>
    </main>
  );
}

export default async function SignPacketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  const verified = verifySigningToken(token);

  if (!verified.ok) {
    const en = getFunnelStrings("en").ceremony;
    const es = getFunnelStrings("es").ceremony;
    const expired = verified.reason === "expired";
    return (
      <Plain
        title={`${expired ? en.expiredTitle : en.invalidTitle} · ${expired ? es.expiredTitle : es.invalidTitle}`}
        note={`${expired ? en.expiredNote : en.invalidNote} · ${expired ? es.expiredNote : es.invalidNote}`}
      />
    );
  }

  const supabase = createServiceClient();
  const { data: deal } = await supabase
    .from("deals")
    .select("id, language, step_data, customers(name), vehicles(year, make, model)")
    .eq("id", verified.dealId)
    .maybeSingle();

  const dealRow = deal as unknown as {
    id: string;
    language: string | null;
    step_data: unknown;
    customers: { name: string | null } | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null;
  } | null;
  const language: "en" | "es" = dealRow?.language === "es" ? "es" : "en";
  const t = getFunnelStrings(language).ceremony;

  if (!dealRow) return <Plain title={t.invalidTitle} note={t.invalidNote} />;

  const { data: agreements } = await supabase
    .from("document_agreements")
    .select("id, document_type, status, finalized_at, completed_at, created_at, completed_link, has_buyer_signature, signed_at, form_data")
    .eq("deal_id", dealRow.id)
    .order("created_at", { ascending: false });

  const rows = ((agreements ?? []) as unknown as Array<{
    id: string;
    document_type: string | null;
    status: string | null;
    finalized_at: string | null;
    completed_at: string | null;
    completed_link: string | null;
    has_buyer_signature: boolean | null;
    signed_at: string | null;
    form_data: unknown;
  }>);

  const ceremonyRows: CeremonyRow[] = rows.map((row) => ({
    id: row.id,
    documentType: row.document_type,
    finalized:
      Boolean(row.finalized_at) || Boolean(row.completed_at) || row.status === "finalized" || row.status === "completed",
    hasCompletedLink: Boolean(row.completed_link),
    signed:
      Boolean(row.has_buyer_signature) ||
      Boolean(row.signed_at) ||
      Boolean((row.form_data as { signature?: unknown } | null)?.signature),
  }));
  // A 130-U the dealer signs under a power of attorney is not the buyer's to sign.
  const documents = ceremonyDocuments(ceremonyRows, {
    dealerSignsTitle: readSalePlan(dealRow.step_data).titleSignedBy === "dealer",
  });

  if (documents.length === 0) return <Plain title={t.nothingTitle} note={t.nothingNote} />;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const pages: CeremonyPage[] = [];
  for (const document of documents) {
    const row = byId.get(document.id);
    const decoded = row?.completed_link ? decodeCompletedLinkFromUrl(row.completed_link) : null;
    if (!decoded || !KNOWN_SECTIONS.has(decoded.s)) continue;
    pages.push({
      id: document.id,
      documentType: document.documentType,
      title: (getFunnelStrings(language).documents as Record<string, string>)[document.documentType] ?? document.title,
      meaning: (t.meanings as Record<string, string>)[document.documentType] ?? "",
      signed: document.signed,
      // The sheet as it will print, signatures included so a document the
      // buyer already signed shows their own stroke on it. The 130-U is the
      // state's own PDF, filled: the buyer reads the form the county gets,
      // not our drawing of it.
      sheet:
        document.documentType === "form130U" ? (
          <OfficialFormSheet
            src={`/api/sign/${encodeURIComponent(token)}/form-130u/${encodeURIComponent(document.id)}`}
            title={document.title}
          />
        ) : (
          <DocumentSheet decoded={decoded} includeSignatureImages includeIdImagery={false} />
        ),
    });
  }

  const buyerName = fieldCase(dealRow.customers?.name) || t.buyerFallbackName;
  const vehicle = [dealRow.vehicles?.year, fieldCase(dealRow.vehicles?.make), fieldCase(dealRow.vehicles?.model)]
    .filter(Boolean)
    .join(" ");

  return (
    <CeremonyClient
      token={token}
      language={language}
      buyerName={buyerName}
      vehicle={vehicle}
      dealer={brand.legal}
      canSign={ceremonyCanSign(dealRow.language)}
      pages={pages}
    />
  );
}
