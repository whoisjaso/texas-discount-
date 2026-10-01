"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A state form, drawn page by page on the buyer's screen.
 *
 * The 130-U is the TxDMV's PDF with its real fields filled, not a page of
 * ours, so it cannot be drawn the way the other sheets are. pdf.js renders
 * each page into a canvas at the width of the sheet frame, sharp for the
 * screen's pixel ratio, and the pages stack the way they would on paper.
 *
 * Until the first page is drawn, a letter-sized placeholder holds the
 * frame's height, so the ceremony's "read to the end" scroll cannot be
 * satisfied by an empty box.
 */

const LETTER_ASPECT = 11 / 8.5;

export default function OfficialFormSheet({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const renderKey = useMemo(() => Symbol(src), [src]);
  const [result, setResult] = useState<{ key: symbol; source: string; pages: { url: string; ready: boolean }[]; finished: boolean; failed: boolean }>();
  const current = result?.key === renderKey ? result : undefined;
  const pages = current?.pages ?? [];
  const failed = current?.failed ?? false;
  const ready = Boolean(current?.finished && !failed && pages.length > 0 && pages.every(page => page.ready));

  useEffect(() => {
    let cancelled = false;
    const key = renderKey;
    const frame = frameRef.current;
    if (!frame) return;

    async function draw() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const response = await fetch(src, { cache: "no-store" });
        if (!response.ok) throw new Error(`form ${response.status}`);
        const doc = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
        const width = Math.max(320, frame?.clientWidth ?? 640);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const drawn: string[] = [];
        for (let number = 1; number <= doc.numPages; number += 1) {
          const page = await doc.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("no canvas");
          await page.render({ canvasContext: context, viewport }).promise;
          drawn.push(canvas.toDataURL("image/png"));
          if (cancelled) return;
          setResult(previous => ({ key, source: src, failed: previous?.key === key && previous.failed || false, finished: number === doc.numPages, pages: drawn.map((url, index) => ({ url, ready: previous?.key === key && previous.pages[index]?.ready || false })) }));
        }
      } catch {
        if (!cancelled) setResult(previous => ({ key, source: src, pages: previous?.key === key ? previous.pages : [], finished: false, failed: true }));
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [src, renderKey]);

  function imageFailed(key: symbol) {
    setResult(previous => previous?.key === key ? { ...previous, failed: true } : previous);
  }
  async function imageLoaded(image: HTMLImageElement, key: symbol, index: number) {
    try {
      if (image.decode) await image.decode();
      if (!image.complete || !image.naturalWidth || !image.naturalHeight) throw new Error("Incomplete image");
      setResult(previous => previous?.key === key ? { ...previous, pages: previous.pages.map((page, pageIndex) => pageIndex === index ? { ...page, ready: true } : page) } : previous);
    } catch { imageFailed(key); }
  }

  return (
    <div ref={frameRef} className="ed-sign-form" data-sign-official-form data-sign-ready={ready ? "true" : "false"} data-pages={pages.length}>
      {pages.map((page, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}:${index}`} src={page.url} onLoad={event => void imageLoaded(event.currentTarget, current!.key, index)} onError={() => imageFailed(current!.key)} alt={`${title}, page ${index + 1}`} className="ed-sign-form-page" />
      ))}
      {pages.length === 0 ? (
        <div className="ed-sign-form-placeholder" style={{ aspectRatio: `1 / ${LETTER_ASPECT}` }} aria-busy={!failed}>
          {failed ? (
            <p className="ed-sign-form-note">
              The form could not be drawn here. Ask the desk to print it.
            </p>
          ) : null}
        </div>
      ) : null}
      {failed && pages.length > 0 ? <p role="alert" className="ed-sign-form-note">The form could not be drawn here. Ask the desk to print it.</p> : null}
    </div>
  );
}
