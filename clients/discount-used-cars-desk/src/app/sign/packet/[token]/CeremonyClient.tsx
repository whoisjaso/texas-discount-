"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import SignaturePad from "@/components/documents/SignaturePad";
import Wordmark from "@/components/site/shared/Wordmark";
import { signPacketDocument } from "@/lib/actions/packet-signing";
import { getFunnelStrings, fillTemplate } from "@/lib/sales/i18n";
import { tapHaptic } from "@/lib/haptics";
import { isSigningSheetReady } from "@/lib/sales/signing-sheet-readiness";
import "@/styles/signing-receipt.css";

/**
 * The ceremony, one document per screen.
 *
 * Cover, then each sheet in the packet's order, then the receipt. The sheet
 * is the page that will print, scrolled inside the screen at reading size,
 * and the pad does not appear until the sheet has been scrolled to its end:
 * that scroll is the reading, and it is what makes the stroke under it a
 * signature on something read rather than something shown.
 *
 * The first stroke is kept and offered on every later document as "use my
 * signature", with a fresh pad one tap away, so a six-document packet is six
 * taps rather than six drawings. Each tap writes to its own filed row
 * through the server action; nothing is held for a final submit, so a
 * buyer who stops after three has signed three.
 */

export type CeremonyPage = {
  id: string;
  documentType: string;
  title: string;
  meaning: string;
  signed: boolean;
  sheet: ReactNode;
};

type Stage = "cover" | "document" | "receipt";

export default function CeremonyClient({
  token,
  language,
  buyerName,
  vehicle,
  dealer,
  canSign,
  pages,
}: {
  token: string;
  language: "en" | "es";
  buyerName: string;
  vehicle: string;
  dealer: string;
  /** False on a Spanish sale until counsel signs the Spanish copy: read, then ink. */
  canSign: boolean;
  pages: CeremonyPage[];
}) {
  const t = getFunnelStrings(language).ceremony;
  const [stage, setStage] = useState<Stage>("cover");
  const [index, setIndex] = useState(0);
  const [signed, setSigned] = useState<Record<string, boolean>>(
    Object.fromEntries(pages.map((page) => [page.id, page.signed])),
  );
  const [kept, setKept] = useState("");
  const [finishedAt, setFinishedAt] = useState<string | null>(null);

  const page = pages[index];
  const isLast = index === pages.length - 1;

  function begin() {
    tapHaptic();
    const firstOpen = pages.findIndex((entry) => !signed[entry.id]);
    setIndex(firstOpen === -1 ? 0 : firstOpen);
    setStage("document");
  }

  function advance() {
    if (isLast) {
      setFinishedAt(new Date().toLocaleTimeString(language === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit" }));
      setStage("receipt");
      return;
    }
    setIndex(index + 1);
  }

  /** One document signed: remember it, keep the first stroke, move on. */
  function onSigned(id: string, dataUrl: string) {
    setSigned((current) => ({ ...current, [id]: true }));
    if (!kept) setKept(dataUrl);
    advance();
  }

  if (stage === "cover") {
    return (
      <main className="ed-sign" data-sign-stage="cover">
        <header className="ed-sign-head">
          <Wordmark width={140} tone="dark" withSubline emblem />
        </header>
        <section className="ed-sign-cover">
          <h1 className="ed-sign-title">{canSign ? t.title : t.inkTitle}</h1>
          <p className="ed-sign-lead">
            {canSign
              ? pages.length === 1
                ? fillTemplate(t.coverLeadOne, { name: buyerName, vehicle })
                : fillTemplate(t.coverLead, { name: buyerName, vehicle, count: pages.length })
              : t.inkLead}
          </p>
          <ol className="ed-sign-list">
            {pages.map((entry) => (
              <li key={entry.id} className="ed-sign-list-row" data-signed={signed[entry.id] ? "true" : "false"}>
                <span className="ed-sign-list-mark" aria-hidden="true">
                  {signed[entry.id] ? <Check size={14} weight="bold" /> : null}
                </span>
                <span>{entry.title}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="ed-btn ed-btn-dark ed-sign-begin" onClick={begin}>
            {t.begin}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      </main>
    );
  }

  if (stage === "receipt" || !page) {
    return (
      <main className="ed-sign" data-sign-stage="receipt">
        <header className="ed-sign-head">
          <Wordmark width={140} tone="dark" withSubline emblem />
        </header>
        <section className="ed-sign-cover">
          <span className="ed-sign-receipt-mark" aria-hidden="true">
            <Check size={28} weight="bold" />
          </span>
          <h1 className="ed-sign-title">{t.receiptTitle}</h1>
          <p className="ed-sign-lead">{fillTemplate(t.receiptLead, { name: buyerName, dealer })}</p>
          <ol className="ed-sign-list">
            {pages.map((entry) => (
              <li key={entry.id} className="ed-sign-list-row" data-signed={signed[entry.id] ? "true" : "false"}>
                <span className="ed-sign-list-mark" aria-hidden="true">
                  {signed[entry.id] ? <Check size={14} weight="bold" /> : null}
                </span>
                <span>{entry.title}</span>
              </li>
            ))}
          </ol>
          {pages.some((entry) => signed[entry.id]) ? (
            <div className="ed-sign-downloads">
              <p className="ed-sign-fine">{t.downloadNote}</p>
              {pages.filter((entry) => signed[entry.id]).map((entry) => (
                <a key={entry.id} className="ed-sign-download" href={`/api/sign/packet/${encodeURIComponent(token)}/documents/${encodeURIComponent(entry.id)}?inline=true`} target="_blank" rel="noopener noreferrer">
                  <span>{entry.title}</span><span>{t.savePdf} <ArrowRight size={14} aria-hidden="true" /></span>
                </a>
              ))}
            </div>
          ) : null}
          {finishedAt ? <p className="ed-sign-fine">{fillTemplate(t.receiptTime, { time: finishedAt })}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <DocumentStage
      key={page.id}
      token={token}
      language={language}
      page={page}
      index={index}
      total={pages.length}
      isLast={isLast}
      canSign={canSign}
      alreadySigned={Boolean(signed[page.id])}
      kept={kept}
      onSigned={onSigned}
      onAdvance={advance}
    />
  );
}

/**
 * One document, one screen. Mounted fresh for each page (keyed on the row
 * id), so its reading, its stroke and its error start clean without any
 * effect having to reset them.
 */
function DocumentStage({
  token,
  language,
  page,
  index,
  total,
  isLast,
  canSign,
  alreadySigned,
  kept,
  onSigned,
  onAdvance,
}: {
  token: string;
  language: "en" | "es";
  page: CeremonyPage;
  index: number;
  total: number;
  isLast: boolean;
  canSign: boolean;
  alreadySigned: boolean;
  kept: string;
  onSigned: (id: string, dataUrl: string) => void;
  onAdvance: () => void;
}) {
  const t = getFunnelStrings(language).ceremony;
  const [read, setRead] = useState(false);
  const [stroke, setStroke] = useState("");
  const [reuse, setReuse] = useState(false);
  /**
   * Explicit consent, each time a kept stroke is put on a new document.
   *
   * "Use my signature" is a convenience, and a convenience that signs a
   * second contract with a stroke drawn for a first is where an e-signature
   * stops being one. So reuse is two acts: choosing it, and ticking that
   * this document too has been read and is to carry that stroke. The
   * server records both and refuses a reused stroke without the tick.
   */
  const [reuseConsent, setReuseConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /*
    Reading is scrolling to the end. A sheet short enough to fit the screen
    is read on arrival; anything taller has to be scrolled through. The
    check runs on every scroll and once shortly after mount, so a phone in
    landscape that shows the whole sheet does not wait for a scroll that
    cannot happen.
  */
  const checkRead = useCallback(() => {
    const box = sheetRef.current;
    if (!box) return;
    // A short loading/error placeholder is not a document. Revoke an
    // earlier read if a rendered sheet is replaced or an image fails.
    if (!isSigningSheetReady(box)) { setRead(false); return; }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 24) setRead(true);
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
    const timer = window.setTimeout(checkRead, 250);
    // A state form draws its pages after it arrives, so the sheet grows
    // under the reader; the check runs again whenever its height changes.
    const box = sheetRef.current;
    const inner = box?.firstElementChild;
    const observer =
      inner && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => checkRead()) : null;
    if (inner && observer) observer.observe(inner);
    const readiness = box ? new MutationObserver(checkRead) : null;
    if (box) {
      readiness?.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-sign-ready", "src", "srcset"] });
      box.addEventListener("load", checkRead, true);
      box.addEventListener("error", checkRead, true);
    }
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      readiness?.disconnect();
      box?.removeEventListener("load", checkRead, true);
      box?.removeEventListener("error", checkRead, true);
    };
  }, [checkRead]);

  async function sign() {
    if (busy) return;
    if (!read || !isSigningSheetReady(sheetRef.current)) {
      setRead(false);
      setError(t.errors.notRead);
      return;
    }
    const dataUrl = reuse ? kept : stroke;
    if (!dataUrl) {
      setError(t.errors.noSignature);
      return;
    }
    if (reuse && !reuseConsent) {
      setError(t.errors.reuseConsent);
      return;
    }
    setBusy(true);
    setError(null);
    tapHaptic();
    try {
      const result = await signPacketDocument(token, page.id, dataUrl, {
        scrolledToEnd: read,
        reused: reuse,
        reuseConsent: reuse && reuseConsent,
      });
      if (!result.ok) {
        const errors = t.errors as Record<string, string>;
        setError(errors[result.error] ?? t.errors.generic);
        setBusy(false);
        return;
      }
      onSigned(page.id, dataUrl);
    } catch {
      setError(t.errors.generic);
      setBusy(false);
    }
  }

  const advance = onAdvance;

  return (
    <main className="ed-sign" data-sign-stage="document" data-sign-read={read ? "true" : "false"}>
      <header className="ed-sign-head ed-sign-head-doc">
        <Wordmark width={120} tone="dark" />
        <span className="ed-sign-count">{fillTemplate(t.documentOf, { current: index + 1, total })}</span>
      </header>

      <h1 ref={headingRef} tabIndex={-1} className="ed-sign-doc-title" style={{ outline: "none" }}>
        {page.title}
      </h1>
      {page.meaning ? <p className="ed-sign-meaning">{page.meaning}</p> : null}

      {/* The sheet as it prints, at reading size, scrolled inside its frame. */}
      <div ref={sheetRef} className="ed-sign-sheet" onScroll={checkRead} data-sign-sheet>
        <div className="ed-sign-sheet-inner">{page.sheet}</div>
      </div>

      <div className="ed-sign-pad" aria-live="polite">
        {!canSign ? (
          <button type="button" className="ed-btn ed-btn-dark ed-sign-action" disabled={!read} onClick={advance}>
            {isLast ? t.receiptTitle : t.next}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : alreadySigned ? (
          <>
            <p className="ed-sign-read">
              <Check size={14} weight="bold" aria-hidden="true" /> {t.alreadySigned}
            </p>
            <button type="button" className="ed-btn ed-btn-dark ed-sign-action" onClick={advance}>
              {isLast ? t.receiptTitle : t.next}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </>
        ) : !read ? (
          <p className="ed-sign-read ed-sign-read-open">{t.readToEnd}</p>
        ) : (
          <>
            <p className="ed-sign-read">
              <Check size={14} weight="bold" aria-hidden="true" /> {t.readDone}
            </p>
            {kept && reuse ? (
              <div className="ed-sign-kept">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={kept} alt={t.signHere} className="ed-sign-kept-image" />
                <label className="ed-sign-consent" data-sign-consent>
                  <input
                    type="checkbox"
                    checked={reuseConsent}
                    onChange={(event) => {
                      setReuseConsent(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span>{t.reuseConsent}</span>
                </label>
                <button
                  type="button"
                  className="ed-guide-back"
                  onClick={() => {
                    setReuse(false);
                    setReuseConsent(false);
                  }}
                >
                  {t.signAgain}
                </button>
              </div>
            ) : (
              <div className="ed-sign-pad-box" data-sign-pad>
                <SignaturePad
                  label={t.signHere}
                  value={stroke}
                  dateValue=""
                  onChange={setStroke}
                  onDateChange={() => undefined}
                />
                {kept ? (
                  <button type="button" className="ed-guide-back" onClick={() => setReuse(true)}>
                    {t.useMySignature}
                  </button>
                ) : null}
              </div>
            )}
            <button
              type="button"
              className="ed-btn ed-btn-dark ed-sign-action"
              disabled={busy || !(reuse ? kept && reuseConsent : stroke)}
              onClick={() => void sign()}
              data-sign-submit
            >
              {busy ? t.signing : isLast ? t.signAndFinish : t.signAndContinue}
              {busy ? null : <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </>
        )}
        {error ? (
          <p className="ed-money-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
