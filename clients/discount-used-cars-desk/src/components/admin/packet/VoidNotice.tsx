"use client";

import Link from "next/link";
import { ArrowSquareOut, DownloadSimple, Prohibit } from "@phosphor-icons/react";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import { localizeDocumentTitle } from "@/lib/sales/question-i18n";
import type { PacketStatusDocument } from "@/lib/sales/packet-status";
import { dealership } from "@/lib/dealership-config";
import "@/styles/void-freeze.css";

/**
 * What a void left behind, on the packet (owner's decision 10/02/2026).
 *
 * The notice: while anything waits to be filed again, who voided the bill of
 * sale, when and why, what to file again, and that the buyer signs the new
 * copies through a new link. The history: every voided copy, kept and
 * printable (stamped VOID), grouped by the void that took it, with whether
 * the buyer had signed it. Nothing here is a control that changes a record.
 */

const viewHref = (id: string) => `/api/documents/agreements/${encodeURIComponent(id)}/pdf?inline=true`;
const saveHref = (id: string) => `/api/documents/agreements/${encodeURIComponent(id)}/pdf`;

type Doc = PacketStatusDocument & { title: string };

function useDate() {
  const { lang } = useFunnel();
  return (value: string | null | undefined): string => {
    const when = new Date(value ?? "");
    if (Number.isNaN(when.getTime())) return "";
    // The business date (the dealership's clock), as the voided PDF's band
    // prints it, never the viewer's or the server's own day.
    return when.toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: dealership.timeZone,
    });
  };
}

/** The voided copies, newest void first, one group per void. */
export function voidGroups(documents: readonly Doc[]): Array<{ id: string; at: string | null; by: string | null; reason: string | null; rows: Doc[] }> {
  const groups = new Map<string, { id: string; at: string | null; by: string | null; reason: string | null; rows: Doc[] }>();
  for (const document of documents) {
    if (!document.voided) continue;
    const key = document.voidGroupId ?? `${document.voidedAt ?? ""}|${document.voidReason ?? ""}`;
    const group = groups.get(key) ?? { id: key, at: document.voidedAt ?? null, by: document.voidedByName ?? null, reason: document.voidReason ?? null, rows: [] };
    group.rows.push(document);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0));
}

export function VoidNotice({ dealId, documents, refile }: { dealId: string; documents: readonly Doc[]; refile: string[] }) {
  const { t } = useFunnel();
  const v = t.void;
  const date = useDate();
  const latest = voidGroups(documents)[0];
  if (!latest || refile.length === 0) return null;
  const base = `/admin/sales/${encodeURIComponent(dealId)}`;
  const list = refile.map((type) => localizeDocumentTitle(t, type, type)).join(", ");
  return (
    <section className="ed-void-notice" role="status" aria-labelledby="void-notice-title" data-void-notice>
      <h2 id="void-notice-title" className="ed-void-notice-title">
        <Prohibit size={18} aria-hidden="true" />
        {v.noticeTitle}
      </h2>
      <p>{fillTemplate(v.noticeBy, { date: date(latest.at), name: latest.by ?? "" })}</p>
      {latest.reason ? <p className="ed-void-quote">“{latest.reason}”</p> : null}
      <p>{fillTemplate(v.noticeRefile, { list })}</p>
      <p>{v.noticeSign}</p>
      <div className="ed-void-notice-actions">
        <Link className="ed-btn ed-btn-dark" href={`${base}/guide`}>
          {v.fileAgain}
        </Link>
        <Link className="ed-btn ed-btn-outline" href={`${base}/summary`}>
          {v.changeSale}
        </Link>
        <a className="ed-void-see" href="#voided-copies">
          {v.seeVoided}
        </a>
      </div>
    </section>
  );
}

export function VoidedCopies({ documents }: { documents: readonly Doc[] }) {
  const { t } = useFunnel();
  const v = t.void;
  const date = useDate();
  const groups = voidGroups(documents);
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  if (count === 0) return null;
  const rootTypes = new Set(["billOfSale", "salvageBillOfSale"]);
  return (
    <details id="voided-copies" className="packet-supporting ed-voided-copies" data-voided-copies={count}>
      <summary>
        <Prohibit size={18} aria-hidden="true" />
        {v.voidedHeading} ({count})
      </summary>
      {groups.map((group) => (
        <div key={group.id} className="ed-void-group">
          <p className="ed-packet-gloss ed-void-line">
            {fillTemplate(v.voidedLine, { date: date(group.at), name: group.by ?? "", reason: group.reason ?? "" })}
          </p>
          <ul className="ed-packet-list">
            {group.rows.map((document) => (
              <li key={document.id} className="ed-packet-row" data-voided="true">
                <div className="ed-packet-what">
                  <p className="ed-packet-title">{localizeDocumentTitle(t, document.documentType, document.title)}</p>
                  <p className="ed-packet-gloss">
                    {document.signed
                      ? fillTemplate(v.wasSigned, { date: date(document.filedAt) })
                      : v.wasFiled}
                  </p>
                  {!rootTypes.has(document.documentType) ? (
                    <p className="ed-packet-gloss">{v.voidedWithBillOfSale}</p>
                  ) : null}
                </div>
                {document.printable ? (
                  <div className="ed-packet-actions">
                    <a className="ed-btn ed-btn-outline ed-packet-action" href={viewHref(document.id)} target="_blank" rel="noreferrer">
                      <ArrowSquareOut size={15} aria-hidden="true" />
                      {t.packetLive.view}
                    </a>
                    <a className="ed-btn ed-btn-outline ed-packet-action" href={saveHref(document.id)}>
                      <DownloadSimple size={15} aria-hidden="true" />
                      {t.packet.save}
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}
