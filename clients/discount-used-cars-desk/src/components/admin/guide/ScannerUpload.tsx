"use client";

import { useRef, useState } from "react";
import { Printer } from "@phosphor-icons/react";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { readBarcodesFromImageData, prepareZXingModule } from "zxing-wasm/reader";
import { looksLikeLicence, readAamva } from "@/lib/sales/aamva";

/**
 * The licence off the office scanner, instead of off a phone.
 *
 * A desk that has a printer usually has a flatbed on top of it, and a flatbed
 * beats a phone at this in every way that matters here: the card lies flat, the
 * light is even, the resolution is whatever the glass was set to, and nobody
 * has to hold anything steady. The barcode reads first time.
 *
 * It also ends with a better record. A scan is already a file, and a PDF of the
 * customer's identification is the thing that gets attached to a filing later,
 * so it is kept exactly as the scanner made it. The rasterised page goes
 * alongside it because a screen cannot show a PDF and the desk needs to look at
 * the card while checking the fields.
 *
 * The barcode is decoded here, in this browser, for the same reason the phone
 * decodes it in that one: a customer's licence should not travel anywhere it
 * does not have to, and this dealership's own storage is far enough.
 */

/** Serve the decoder from this origin; the default CDN is blocked by policy. */
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? `/wasm/${path}` : `${prefix}${path}`,
  },
  fireImmediately: false,
});

/**
 * Rasterising width for a scanned page.
 *
 * A PDF417 needs roughly two pixels per bar to decode, and a licence barcode is
 * about four hundred modules across on a page that is mostly white space around
 * it. Two thousand pixels of page width leaves the code comfortably above that
 * even when somebody has scanned the card in the corner of a full sheet.
 */
const RASTER_WIDTH = 2000;

/** Anything past this is a multi-page document, not a licence. */
const MAX_PAGES = 4;

type Status = "idle" | "reading" | "sending" | "error";

type Props = {
  /** The same signed token the QR code carries. */
  token: string;
};

export default function ScannerUpload({ token }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const { t } = useFunnel();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  /** Decodes a licence barcode out of one rendered page, or returns null. */
  async function decode(canvas: HTMLCanvasElement): Promise<string | null> {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const results = await readBarcodesFromImageData(frame, {
      formats: ["PDF417"],
      tryHarder: true,
      maxNumberOfSymbols: 1,
      // Not the default. "HRI" renders the record separators that divide a
      // licence into fields as the literal text "<LF>", and the payload then
      // parses as one meaningless line.
      textMode: "Plain",
    });
    const text = results[0]?.text;
    return text && looksLikeLicence(text) ? text : null;
  }

  /** Draws an image file onto a canvas at its natural size. */
  async function fromImage(file: File): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  /** Renders the pages of a scanned PDF, largest side first. */
  async function fromPdf(file: File): Promise<HTMLCanvasElement[]> {
    const pdfjs = await import("pdfjs-dist");
    // Turbopack emits the worker as an asset from this URL form, so there is
    // no copy step and no version to keep in step by hand.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: HTMLCanvasElement[] = [];

    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RASTER_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(canvas);
    }

    await doc.destroy();
    return pages;
  }

  async function send(file: File) {
    setError(null);
    setStatus("reading");

    try {
      const isPdf = file.type === "application/pdf";
      const pages = isPdf ? await fromPdf(file) : [await fromImage(file)];
      if (pages.length === 0) {
        setError(t.buyerId.scanner.errNothingRead);
        setStatus("error");
        return;
      }

      /*
        Both sides usually come off a flatbed in one pass, so every page is
        tried and the first licence barcode wins. The page that is shown on the
        desk is the first one either way, because that is the side somebody
        laid down first and it is the side with the face on it.
      */
      let payload: string | null = null;
      for (const page of pages) {
        payload = await decode(page);
        if (payload) break;
      }

      const shown = await new Promise<Blob | null>((resolve) =>
        pages[0].toBlob((blob) => resolve(blob), "image/jpeg", 0.9),
      );
      if (!shown) {
        setError(t.buyerId.scanner.errPrepare);
        setStatus("error");
        return;
      }

      setStatus("sending");
      const body = new FormData();
      body.set("token", token);
      body.set("image", shown, "licence.jpg");
      // The original, kept as the scanner made it. Only PDFs: an image the
      // scanner produced is already what was uploaded above.
      if (isPdf) body.set("document", file, file.name || "licence.pdf");
      if (payload) body.set("fields", JSON.stringify(readAamva(payload)));

      const response = await fetch("/api/capture", { method: "POST", body });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        documentKept?: boolean;
      };
      if (!response.ok || !result.ok) {
        setError(result.error ?? t.buyerId.scanner.errSave);
        setStatus("error");
        return;
      }

      // The licence went on the sale and the scanner's own file did not. Worth
      // saying out loud, because keeping that file is half the reason somebody
      // used the scanner, and nothing else on the screen would ever show it
      // missing.
      if (result.documentKept === false) {
        setError(t.buyerId.scanner.errKept);
      }

      // No success state beyond that. The desk is subscribed to this deal, so
      // the screen this sits on replaces itself the moment the write lands.
      setStatus("idle");
    } catch {
      setError(t.buyerId.scanner.errRead);
      setStatus("error");
    }
  }

  const busy = status === "reading" || status === "sending";

  return (
    <div className="ed-idscan">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-label={t.buyerId.scanner.upload}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change, which
          // is what trying again after a bad scan actually is.
          event.target.value = "";
          if (file) void send(file);
        }}
      />

      <button
        type="button"
        className="ed-btn ed-btn-outline ed-idscan-pick"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Printer size={18} weight="regular" aria-hidden="true" />
        {status === "reading"
          ? t.buyerId.scanner.reading
          : status === "sending"
            ? t.buyerId.scanner.sending
            : t.buyerId.scanner.upload}
      </button>

      {error ? (
        <p className="ed-idscan-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
