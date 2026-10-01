"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import type { OfficialRebuiltDisclosureData } from "@/lib/documents/official-rebuilt-disclosure";

/** The purchaser reviews the same original state page that the PDF route fills. */
export default function OfficialRebuiltDisclosureDocument({ data }: { data: OfficialRebuiltDisclosureData }) {
  const key = JSON.stringify(data);
  const [attempt, setAttempt] = useState(0);
  const renderKey = useMemo(() => Symbol(`${key}:${attempt}`), [key, attempt]);
  const [result, setResult] = useState<{ key: symbol; page?: string; error?: string }>();
  const [readyKey, setReadyKey] = useState<symbol>();
  const current = result?.key === renderKey ? result : undefined;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    async function prepare() {
      try {
        const [{ fillOfficialRebuiltDisclosure }, pdfjs, response] = await Promise.all([
          import("@/lib/documents/official-rebuilt-disclosure"),
          import("pdfjs-dist"),
          fetch("/forms/ENF-MV-RBLT-DSCLMR.pdf", { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error("The state disclosure could not be loaded.");
        const bytes = await fillOfficialRebuiltDisclosure(new Uint8Array(await response.arrayBuffer()), JSON.parse(key));
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ data: bytes });
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The state disclosure could not be displayed.");
        await page.render({ canvasContext: context, viewport }).promise;
        if (active) setResult({ key: renderKey, page: canvas.toDataURL("image/png") });
        canvas.width = 0;
        canvas.height = 0;
        await pdf.destroy();
        task = undefined;
      } catch (error) {
        if (active && !controller.signal.aborted) setResult({ key: renderKey, error: error instanceof Error ? error.message : "The state disclosure could not be displayed." });
      }
    }
    void prepare();
    return () => { active = false; controller.abort(); void task?.destroy(); };
  }, [key, renderKey]);

  function imageFailed(imageKey: symbol) {
    setResult(previous => previous?.key === imageKey ? { key: imageKey, error: "The state disclosure could not be displayed." } : previous);
  }
  async function imageLoaded(image: HTMLImageElement, imageKey: symbol) {
    try {
      if (image.decode) await image.decode();
      if (!image.complete || !image.naturalWidth || !image.naturalHeight) throw new Error("Incomplete image");
      setReadyKey(imageKey);
    } catch { imageFailed(imageKey); }
  }

  if (current?.error) return <div role="alert" data-sign-ready="false" className="p-6"><p>{current.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 min-h-11 underline">Try Again</button></div>;
  if (!current?.page) return <div role="status" data-sign-ready="false" className="flex min-h-[420px] items-center justify-center text-sm">Preparing State Disclosure</div>;
  return <div className="print-doc official-rebuilt-sheet" data-sign-ready={readyKey === current.key ? "true" : "false"}>
    <img key={`${key}:${attempt}`} src={current.page} onLoad={event => void imageLoaded(event.currentTarget, current.key)} onError={() => imageFailed(current.key)} alt="Texas Rebuilt Motor Vehicle Written Disclosure, filled with the purchaser and vehicle details" style={{ width: "100%", height: "auto", display: "block" }} />
  </div>;
}
