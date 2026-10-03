"use client";

import Link from "next/link";
import { ArrowLeft, ArrowSquareOut, ArrowClockwise, Check, DownloadSimple, FileText, Clock, WifiSlash } from "@phosphor-icons/react";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import { localizeDocumentTitle } from "@/lib/sales/question-i18n";
import SendPaperworkText from "@/components/admin/packet/SendPaperworkText";
import TextSigningLink from "@/components/admin/packet/TextSigningLink";
import DealBadge from "@/components/admin/DealBadge";
import type { DealBadgeKey } from "@/lib/sales/deal-badge";
import { currentPacketDocuments, packetProgress, packetRefileTypes, type PacketStatusDocument } from "@/lib/sales/packet-status";
import { VOIDED_WITH_BILL_OF_SALE, type VoidRefusalCode } from "@/lib/sales/void-bill-of-sale";
import { dealership } from "@/lib/dealership-config";
import { usePacketStatus } from "./usePacketStatus";
import VoidBillOfSale from "./VoidBillOfSale";
import { VoidNotice, VoidedCopies } from "./VoidNotice";
import "@/styles/packet-screen.css";

// Mirrors sale-packet.ts's href builders. Not imported from there because
// that module pulls in the server Supabase client, which cannot cross into
// a client component.
const packetViewHref = (agreementId: string) =>
  `/api/documents/agreements/${encodeURIComponent(agreementId)}/pdf?inline=true`;
const packetDownloadHref = (agreementId: string) =>
  `/api/documents/agreements/${encodeURIComponent(agreementId)}/pdf`;

/**
 * The packet's words, on the client so the toggle can swap them in place.
 * The server page keeps everything that needs the server: the packet read,
 * the licence's short-lived signed URLs, the Buyers Guide hrefs. See the
 * page for the screen's reasoning; only the rendering moved here.
 */

export type PacketScreenDocument = PacketStatusDocument & {
  id: string;
  documentType: string;
  title: string;
  gloss: string;
  filedAt: string | null;
  finalized: boolean;
  /** False for the one document nothing here can print: a POA on the county's secure form. */
  printable: boolean;
  /** The buyer's own stroke is on it. */
  signed: boolean;
};

/** Voiding the filed bill of sale, as this viewer and this sale allow it (owner's decision 10/02/2026). */
export type PacketVoidContext = {
  /** Owner or Manager. */
  canVoid: boolean;
  /** Why the rules refuse a void on this sale now (a closed sale, the title at the county). */
  refusal: VoidRefusalCode | null;
  /** Opened straight from a refusal's "Void The Bill Of Sale" link. */
  openOnLoad: boolean;
  /** The guide step that link came from, to land back on. */
  returnTo: string | null;
};

const BILL_OF_SALE_ROOTS = new Set(["billOfSale", "salvageBillOfSale"]);

export default function PacketScreen({
  dealId,
  vehicle,
  buyerName,
  documents: initialDocuments,
  loadFailed,
  photographs,
  buyersGuideLanguages,
  buyersGuideHrefs,
  textingEnabled,
  buyerHasPhone,
  signing = null,
  dealerSignsTitle = false,
  badge = null,
  owed,
  voidContext = null,
}: {
  /** The documents this sale owes, so a voided one still owed counts as waiting. */
  owed?: readonly string[];
  voidContext?: PacketVoidContext | null;
  dealId: string;
  /** What the title lets this sale be, said over the packet too. */
  badge?: { key: DealBadgeKey; tone: "ok" | "hold" | "stop" } | null;
  /** The plan says we sign the 130-U for an absent buyer under a power of attorney. */
  dealerSignsTitle?: boolean;
  /** The signing session, when a filed document still lacks the buyer's stroke. */
  signing?: { url: string; qr: string; canSign: boolean } | null;
  vehicle: string;
  buyerName: string;
  documents: PacketScreenDocument[];
  loadFailed: boolean;
  photographs: Array<{ kind: "front" | "back" | "document"; url: string }>;
  buyersGuideLanguages: readonly ("en" | "es")[];
  buyersGuideHrefs: Record<"en" | "es", string>;
  textingEnabled: boolean;
  buyerHasPhone: boolean;
}) {
  const { t, lang } = useFunnel();
  const { documents, connection, checkNow } = usePacketStatus(dealId, initialDocuments, dealerSignsTitle);
  const progress = packetProgress(documents, dealerSignsTitle, owed);
  const refile = packetRefileTypes(documents, owed);
  const current = currentPacketDocuments(documents);
  const filed = current.filter((document) => document.finalized);
  const drafts = current.filter((document) => !document.finalized);
  // Earlier filed copies that were superseded; a voided copy is listed under
  // Voided Copies instead.
  const earlierCopies = documents.filter((document) => document.finalized && !document.voided && !filed.some((entry) => entry.id === document.id));
  const voidedById = new Map(documents.filter((document) => document.voided).map((document) => [document.id, document]));
  const voidCandidates = filed
    .filter((document) => (VOIDED_WITH_BILL_OF_SALE as readonly string[]).includes(document.documentType))
    .map((document) => ({ id: document.id, documentType: document.documentType, title: document.title, signed: document.signed }));
  const voidStays = filed
    .filter((document) => !(VOIDED_WITH_BILL_OF_SALE as readonly string[]).includes(document.documentType))
    .map((document) => ({ id: document.id, documentType: document.documentType, title: document.title, signed: document.signed }));
  const copy = t.packetLive;
  const connectionLabel = connection === "live" ? copy.live : connection === "checking" ? copy.checking : connection === "retrying" ? copy.retrying : connection === "offline" ? copy.offline : copy.expired;
  const needsAttention = connection === "retrying" || connection === "offline" || connection === "expired";

  const glosses = t.documentGlosses as Record<string, string>;
  const photoLabel = (kind: "front" | "back" | "document") =>
    kind === "front"
      ? t.packet.licenceFront
      : kind === "back"
        ? t.packet.licenceBack
        : t.packet.uploadedCopy;

  // The business date (the dealership's clock), the same day the void notice
  // and the voided PDF's band show, whatever the viewer's or server's zone.
  const signedOn = (value: string): string => {
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return "";
    return when.toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: dealership.timeZone,
    });
  };

  return (
    <div className="ed-guide ed-packet-screen">
      <header className="ed-guide-head">
        <Link className="ed-guide-exit" href={`/admin/sales/${encodeURIComponent(dealId)}`}>
          {t.chrome.leave}
        </Link>
        <FunnelLanguageToggle />
      </header>

      <main className="ed-guide-body">
        <p className="ed-guide-car">{vehicle}</p>
        {badge && badge.tone !== "ok" ? (
          <DealBadge
            badge={badge}
            label={(t.badges as Record<string, string>)[badge.key] ?? ""}
            gloss={(t.badges as Record<string, string>)[`${badge.key}Gloss`]}
          />
        ) : null}
        <h1 className="ed-guide-question">{copy.title}</h1>
        <p className="ed-packet-lead">{buyerName || t.packet.leadUnnamed}</p>

        <section className="packet-progress" data-complete={progress.complete} aria-label={copy.countLabel}>
          <div className="packet-progress-icon" aria-hidden="true">
            {progress.complete ? <Check size={25} weight="bold" /> : <FileText size={25} weight="light" />}
          </div>
          <div className="packet-progress-content">
            <h2>{progress.complete ? copy.ready : progress.refile > 0 ? t.void.progressWaiting : progress.total > 0 ? copy.waiting : copy.documents}</h2>
            <p role="status" aria-live="polite" aria-atomic="true">
              {progress.total > 0 ? <><strong>{progress.signed} / {progress.total}</strong> {copy.signed}</> : <>{progress.filed} {copy.onFile.toLowerCase()}</>}
              {progress.drafts > 0 ? <span> · {progress.drafts} {copy.draft.toLowerCase()}</span> : null}
              {progress.refile > 0 ? <span data-refile={progress.refile}> · {fillTemplate(t.void.toFileAgain, { count: progress.refile })}</span> : null}
            </p>
            {progress.total > 0 ? <progress value={progress.signed} max={progress.total} aria-label={copy.countLabel} /> : null}
          </div>
        </section>
        <div className="packet-live" data-attention={needsAttention}>
          <span role="status" aria-live="polite">
            {connection === "offline" ? <WifiSlash size={14} aria-hidden="true" /> : <span className="packet-live-dot" aria-hidden="true" />}
            {connectionLabel}
          </span>
          {needsAttention && connection !== "expired" ? <button type="button" onClick={checkNow}><ArrowClockwise size={15} aria-hidden="true" />{copy.retry}</button> : null}
          {connection === "expired" ? <Link href="/admin/login">{copy.expired}</Link> : null}
        </div>

        {/* What a void left behind, while anything waits to be filed again. */}
        <VoidNotice dealId={dealId} documents={documents} refile={refile} />

        {loadFailed && connection !== "live" && documents.length === 0 ? <p className="ed-money-error" role="alert">{t.packet.loadError}</p> : null}
        {documents.length === 0 && !loadFailed ? <p className="ed-packet-empty">{copy.empty}</p> : null}

        {signing && progress.pending > 0 ? (
          <section className="ed-packet-sign" aria-label={t.packet.signHeading} data-signing-url={signing.url}>
            <div className="ed-packet-sign-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ed-packet-sign-qr" src={signing.qr} alt={t.packet.signHeading} />
              <div className="ed-packet-sign-actions">
                <h2 className="ed-packet-heading">{copy.scan}</h2>
                <p className="ed-packet-gloss">{signing.canSign ? copy.scanLead : t.packet.signInkOnly}</p>
                <a className="ed-btn ed-btn-dark" href={signing.url} target="_blank" rel="noreferrer">
                  {t.packet.signOpenHere}<ArrowSquareOut size={16} aria-hidden="true" />
                </a>
              </div>
            </div>
            <TextSigningLink dealId={dealId} enabled={textingEnabled && Boolean(signing?.canSign)} hasPhone={buyerHasPhone} />
          </section>
        ) : null}

        {filed.length > 0 ? (
          <ul className="ed-packet-list">
            {filed.map((document) => (
              <li key={document.id} className="ed-packet-row">
                <div className="ed-packet-what">
                  <p className="ed-packet-title">
                    {localizeDocumentTitle(t, document.documentType, document.title)}
                  </p>
                  <p className="ed-packet-gloss">
                    {document.filedAt ? fillTemplate(document.signed ? t.packet.signedOn : t.packet.filedOn, { date: signedOn(document.filedAt) }) : copy.onFile}
                  </p>
                  {/* A copy filed again after a void says which copy it replaces. */}
                  {document.replacesId && voidedById.get(document.replacesId)?.voidedAt ? (
                    <p className="ed-packet-gloss" data-replaces={document.replacesId}>
                      {fillTemplate(t.void.replaces, { date: signedOn(voidedById.get(document.replacesId)?.voidedAt ?? "") })}
                    </p>
                  ) : null}
                  {/* Which is which: the buyer's stroke is on it, or we filed
                      it and it waits for ink or the ceremony. The power of
                      attorney is ink by law and says nothing here. */}
                  {document.documentType !== "powerOfAttorney" ? (
                    document.documentType === "form130U" && dealerSignsTitle && !document.signed ? (
                      /* Not the buyer's to sign on this sale: we sign the
                         application for an absent buyer under the power of
                         attorney, so "not yet signed" would be untrue. */
                      <p className="ed-packet-signed" data-signed="dealer">
                        <Check size={13} weight="bold" aria-hidden="true" />
                        {t.packet.signedByDealerPoa}
                      </p>
                    ) : (
                      <p className="ed-packet-signed" data-signed={document.signed ? "true" : "false"}>
                        {document.signed ? <Check size={13} weight="bold" aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
                        {document.signed ? t.packet.signedByBuyer : t.packet.filedUnsigned}
                      </p>
                    )
                  ) : null}
                </div>
                {document.printable ? (
                  <div className="ed-packet-actions">
                    {/* Two links and not one. Opening it is what somebody at a
                        desk wants before they print; saving it is what somebody
                        emailing a lender wants. */}
                    <a
                      className={`ed-btn ${progress.complete ? "ed-btn-dark" : "ed-btn-outline"} ed-packet-action`}
                      href={packetViewHref(document.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ArrowSquareOut size={15} aria-hidden="true" />
                      {copy.view}
                    </a>
                    <a
                      className="ed-btn ed-btn-outline ed-packet-action"
                      href={packetDownloadHref(document.id)}
                    >
                      <DownloadSimple size={15} aria-hidden="true" />
                      {t.packet.save}
                    </a>
                    {/* The filed bill of sale can be voided here, by an
                        owner or a manager, and filed again. */}
                    {voidContext && BILL_OF_SALE_ROOTS.has(document.documentType) ? (
                      <VoidBillOfSale
                        dealId={dealId}
                        root={{ id: document.id, documentType: document.documentType }}
                        voids={voidCandidates}
                        stays={voidStays}
                        canVoid={voidContext.canVoid}
                        refusal={voidContext.refusal}
                        buyerName={buyerName}
                        vehicle={vehicle}
                        openOnLoad={voidContext.openOnLoad}
                        returnTo={voidContext.returnTo}
                      />
                    ) : null}
                  </div>
                ) : (
                  /* The county's secure form is paper the state controls. Two
                     buttons that answer with an error are worse than a
                     sentence that says where the record is. */
                  <p className="ed-packet-gloss ed-packet-ink">{t.packet.secureFormOnFile}</p>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {/* The way the paperwork leaves with the buyer's phone rather than
            only on paper. Behind the dealership's own release flag; the
            action derives everything else server-side. */}
        <SendPaperworkText
          dealId={dealId}
          enabled={textingEnabled}
          hasPhone={buyerHasPhone}
        />

        {/* Listed rather than hidden. A document started and never signed is
            the single most useful thing this screen can tell somebody. */}
        {drafts.length > 0 ? (
          <div className="ed-packet-drafts">
            <p className="ed-packet-heading">{t.packet.draftsHeading}</p>
            <ul className="ed-packet-list">
              {drafts.map((document) => (
                <li key={document.id} className="ed-packet-row">
                  <div className="ed-packet-what">
                    <p className="ed-packet-title">
                      {localizeDocumentTitle(t, document.documentType, document.title)}
                    </p>
                    <p className="ed-packet-gloss">
                      {glosses[document.documentType] ?? document.gloss}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="packet-supporting">
          <summary><FileText size={18} aria-hidden="true" />{copy.extras}</summary>
        {/* On every deal, whatever was or was not signed: the window sticker
            is printed, never stored, so no database read can produce it. */}
        <ul className="ed-packet-list">
          <li className="ed-packet-row">
            <div className="ed-packet-what">
              <p className="ed-packet-title">{t.packet.buyersGuideTitle}</p>
              <p className="ed-packet-gloss">{t.packet.buyersGuideGloss}</p>
            </div>
            <div className="ed-packet-actions">
              {buyersGuideLanguages.map((code) => (
                <a
                  key={code}
                  className="ed-btn ed-btn-outline ed-packet-action"
                  href={buyersGuideHrefs[code]}
                >
                  <DownloadSimple size={15} aria-hidden="true" />
                  {code === "es" ? t.packet.spanishPdf : t.packet.englishPdf}
                </a>
              ))}
            </div>
          </li>
        </ul>

        {photographs.length > 0 ? (
          <div className="ed-packet-photos">
            <p className="ed-packet-heading">{t.packet.licenceHeading}</p>
            <div className="ed-packet-shots">
              {photographs.map((photograph) => (
                <figure key={photograph.kind} className="ed-packet-shot">
                  {/* Not next/image: these are signed URLs that expire in ten
                      minutes, and the optimiser would cache them past that. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photograph.url} alt={photoLabel(photograph.kind)} />
                  <figcaption>
                    <a href={photograph.url} target="_blank" rel="noreferrer">
                      {photoLabel(photograph.kind)}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}
        {earlierCopies.length > 0 ? <div>
          <p className="ed-packet-heading">{copy.earlier}</p>
          <ul className="ed-packet-list">{earlierCopies.map((document) => <li className="ed-packet-row" key={document.id}>
            <div className="ed-packet-what"><p className="ed-packet-title">{localizeDocumentTitle(t, document.documentType, document.title)}</p><p className="ed-packet-gloss">{document.filedAt ? signedOn(document.filedAt) : copy.onFile}</p></div>
            {document.printable ? <a className="ed-btn ed-btn-outline ed-packet-action" href={packetViewHref(document.id)} target="_blank" rel="noreferrer">{copy.view}<ArrowSquareOut size={15} aria-hidden="true" /></a> : <p className="ed-packet-gloss ed-packet-ink">{t.packet.secureFormOnFile}</p>}
          </li>)}</ul>
        </div> : null}
        </details>

        {/* Every voided copy, kept, readable and printable, stamped VOID. */}
        <VoidedCopies documents={documents} />

      </main>

      <nav className="ed-guide-nav" aria-label={t.chrome.paperworkNav}>
        <Link
          className="ed-guide-back"
          href={`/admin/sales/${encodeURIComponent(dealId)}/guide/title`}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {t.chrome.back}
        </Link>
        <Link className="ed-btn ed-btn-outline" href={`/admin/sales/${encodeURIComponent(dealId)}`}>
          {t.chrome.finish}
        </Link>
      </nav>
    </div>
  );
}
