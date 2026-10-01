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
import { currentPacketDocuments, packetProgress } from "@/lib/sales/packet-status";
import { usePacketStatus } from "./usePacketStatus";
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

export type PacketScreenDocument = {
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
}: {
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
  const progress = packetProgress(documents, dealerSignsTitle);
  const current = currentPacketDocuments(documents);
  const filed = current.filter((document) => document.finalized);
  const drafts = current.filter((document) => !document.finalized);
  const earlierCopies = documents.filter((document) => document.finalized && !filed.some((entry) => entry.id === document.id));
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

  const signedOn = (value: string): string => {
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return "";
    return when.toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
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
            <h2>{progress.complete ? copy.ready : progress.total > 0 ? copy.waiting : copy.documents}</h2>
            <p role="status" aria-live="polite" aria-atomic="true">
              {progress.total > 0 ? <><strong>{progress.signed} / {progress.total}</strong> {copy.signed}</> : <>{progress.filed} {copy.onFile.toLowerCase()}</>}
              {progress.drafts > 0 ? <span> · {progress.drafts} {copy.draft.toLowerCase()}</span> : null}
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
