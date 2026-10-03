"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, CheckCircle, Images } from "@phosphor-icons/react";
import Scanner, { type ScanResult } from "@/components/sales/LicenceScanner";
import LanguageToggle from "@/components/admin/LanguageToggle";
import { getFunnelStrings } from "@/lib/sales/i18n";

/**
 * The phone. One job: get the licence onto the deal.
 *
 * The scanner is the whole experience and it has no shutter button. What is
 * below it is the fallback for the cases where a live camera is not available
 * at all: permission refused, a browser that will not grant it on this origin,
 * a device with no camera. Those all end in the same place, a plain file
 * picker, because somebody standing at a desk with a customer needs a way
 * forward rather than an explanation of why there isn't one.
 */

type Status = "scanning" | "manual" | "sending" | "done" | "error";

export default function CaptureClient({
  token,
  back = null,
  locale = null,
}: {
  token: string;
  /**
   * The deal's confirmed language, or null when nobody has answered it yet.
   * Null draws a tiny EN/ES toggle and the person holding the phone picks —
   * the buyer is the reader here, so the buyer resolves the ambiguity.
   */
  locale?: "en" | "es" | null;
  /**
   * A validated same-origin path back into the sale guide, or null.
   *
   * Present only when the desk's own phone opened this page: the licence step
   * put the path on the link, and the server checked its shape before it got
   * here. The buyer's phone, arriving by QR, never has one, so it never sees
   * a door into the admin.
   */
  back?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("scanning");
  const [chosenLang, setChosenLang] = useState<"en" | "es">("en");
  const lang = locale ?? chosenLang;
  const t = getFunnelStrings(lang).capture;
  /**
   * Whether the upload in flight came from the camera or from the picker.
   * Only the camera's send has a scanner worth leaving on screen.
   *
   * State rather than a ref, because it decides what is rendered. A ref read
   * during render is the kind of thing that works until the day two updates
   * land in different ticks.
   */
  const [viaScanner, setViaScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState(false);

  const send = useCallback(
    async (image: Blob, back: Blob | null, fields: ScanResult["fields"]) => {
      setStatus("sending");
      setError(null);

      const body = new FormData();
      body.set("token", token);
      body.set("image", image, "licence.jpg");
      // Both sides, when both were taken. A licence is a two sided document
      // and a file holding one side of it is an incomplete file.
      if (back) body.set("back", back, "licence-back.jpg");
      // Sent as the reader's output, never as confirmed values. A person at the
      // desk still looks at every one before it can reach a document.
      if (fields) body.set("fields", JSON.stringify(fields));

      try {
        const response = await fetch("/api/capture", { method: "POST", body });
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          setError(payload.error ?? t.didNotSend);
          setStatus("error");
          return;
        }
        setRead(Boolean(fields));
        setStatus("done");
      } catch {
        setError(t.didNotSend);
        setStatus("error");
      }
    },
    [token, t.didNotSend],
  );

  const onScanned = useCallback(
    (result: ScanResult) => {
      setViaScanner(true);
      void send(result.front, result.back, result.fields);
    },
    [send],
  );

  const onFallback = useCallback(() => setStatus("manual"), []);

  /**
   * Files chosen rather than photographed.
   *
   * Two of them where there are two: a phone's picker lets somebody select the
   * front and the back together, and a licence already photographed once does
   * not need photographing again just because this software prefers its own
   * camera. First is the front, second the back, which is the order they come
   * back in and the order anybody lays two pictures of a card down in.
   */
  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Cleared so picking the same file twice still fires a change event, which
    // is what a retake after a failed send actually is.
    event.target.value = "";
    setViaScanner(false);
    if (files.length === 0) return;
    // Nothing is read off a chosen file here. The desk types what the card
    // says, which is what this path has always meant.
    void send(files[0], files[1] ?? null, null);
  }

  /*
    The scanner stays up while the upload runs.

    It used to be swapped out the instant the barcode decoded, which meant the
    confirmation it draws in the middle of the frame was mounted and unmounted
    in the same tick and nobody ever saw it. The person watching would get the
    camera, then a "Sending" screen, with nothing in between saying the card
    had been read.

    Leaving it mounted costs nothing, because the camera has already been shut
    off by the time this runs. The alternative was to hold the check for a beat
    inside the scanner before handing the image over, which buys the same
    moment with somebody's time while a customer waits.
  */
  if (status === "scanning" || (status === "sending" && viaScanner)) {
    return (
      <Scanner
        onScanned={onScanned}
        onFallback={onFallback}
        // On the phone, leaving the camera lands on the picker rather than on
        // nothing: this page has one job and a dead end here would mean asking
        // the desk for a new link.
        onExit={onFallback}
        // Not "Leave". On this page the control opens the manual photo screen,
        // and a buyer reading Leave thinks they are walking out on the errand.
        exitLabel={t.anotherWay}
        lang={lang}
      />
    );
  }

  return (
    <main className="ed-capture" lang={lang}>
      {/* Only when nobody has answered the deal's language: the person
          holding the phone picks, and every word follows instantly. */}
      {locale === null ? (
        <div className="ed-capture-lang">
          <LanguageToggle lang={lang} onChange={setChosenLang} />
        </div>
      ) : null}
      {/* Two inputs, because `capture` is not a preference, it is an override:
          an input carrying it opens the camera and never offers the library.
          One of each is the only way to have both. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={onPick}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onPick}
      />

      {status === "done" ? (
        <>
          <CheckCircle size={56} weight="light" aria-hidden="true" />
          <h1 className="ed-capture-title">{t.sent}</h1>
          <p className="ed-capture-note">
            {read ? t.deskHasDetails : t.deskHasIt}
          </p>
          {/* What happens next depends on whose phone this is. The desk's own
              phone gets walked back into the sale. The buyer's phone is done,
              and saying so beats leaving somebody staring at a stopped
              screen. */}
          {back ? (
            <a className="ed-capture-shutter" href={back}>
              {t.backToSale}
            </a>
          ) : (
            <p className="ed-capture-note">
              {t.allSet}
            </p>
          )}
          <button
            type="button"
            className="ed-capture-again"
            onClick={() => input.current?.click()}
          >
            {t.retake}
          </button>
        </>
      ) : (
        <>
          <h1 className="ed-capture-title">{t.title}</h1>
          {/* Says what to do, not what the screen is. Both sides, because a
              file holding one side of a two sided document is an incomplete
              file, and nobody thinks to turn the card over unasked. */}
          <p className="ed-capture-note">{t.frontFirst}</p>

          <button
            type="button"
            className="ed-capture-shutter"
            disabled={status === "sending"}
            onClick={() => input.current?.click()}
          >
            <Camera size={26} weight="light" aria-hidden="true" />
            {status === "sending" ? t.sending : t.openCamera}
          </button>

          {/* For a card already photographed. Doing it again because this
              software prefers its own camera is work for nothing. */}
          <button
            type="button"
            className="ed-capture-pick"
            disabled={status === "sending"}
            onClick={() => library.current?.click()}
          >
            <Images size={18} weight="regular" aria-hidden="true" />
            {t.choosePhotos}
          </button>

          {/* Leave used to be one way: this screen had no route back to the
              scanner and no route anywhere else, which on the desk's phone
              meant a dead end with a customer waiting. */}
          <button
            type="button"
            className="ed-capture-again"
            disabled={status === "sending"}
            onClick={() => setStatus("scanning")}
          >
            {t.backToCamera}
          </button>

          {/* Hidden rather than disabled while a send is in flight: a link
              cannot be disabled, and walking out mid-upload would quietly
              abandon it. */}
          {back && status !== "sending" ? (
            <a className="ed-capture-again" href={back}>
              {t.backToSale}
            </a>
          ) : null}

          {error ? (
            <p className="ed-capture-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
