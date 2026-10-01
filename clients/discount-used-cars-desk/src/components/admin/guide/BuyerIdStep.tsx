"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera } from "@phosphor-icons/react";
import { useDeviceTier } from "@/hooks/useDeviceTier";
import ScannerUpload from "@/components/admin/guide/ScannerUpload";
import { DeskConfirm, useDeskConfirm } from "@/components/admin/DeskConfirm";
import { createClient } from "@/lib/supabase/client";
import { saveConfirmedId } from "@/lib/actions/buyer-id";
import {
  hasMailing,
  ID_FIELDS,
  joinAddress,
  MAILING_FIELDS,
  readBuyerId,
  suggestedMailing,
  type AamvaAddress,
  type BuyerId,
} from "@/lib/sales/buyer-id";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";

/**
 * The desk, waiting for a phone and then checking what it sent.
 *
 * Two states, and the transition between them is the point of the whole
 * feature: the screen changes on its own when the photograph lands. The
 * waiting screen still says out loud that nothing has arrived, and offers a
 * Check Again that runs the same read the poll runs, because a screen that
 * moves by itself and never says so is indistinguishable from a screen that
 * is broken, and the operator standing at it cannot tell which they have.
 *
 * How it notices:
 *
 *   realtime   a postgres_changes subscription on this one deal. The phone's
 *              UPDATE is the signal; there is no second notification that could
 *              drift out of step with the row.
 *   fallback   a slow poll, every eight seconds. Not hedging. Realtime has to
 *              be enabled per table in a Supabase project, and if a fork
 *              forgets, the feature would silently never advance and look
 *              broken rather than misconfigured. The poll stops the moment
 *              realtime proves it is working.
 *
 * Then the checking. Every value the reader produced is shown as an editable
 * field that starts empty of confirmation, because a pre-filled box somebody
 * skims is exactly how a wrong licence number reaches a title application.
 */

type Props = {
  dealId: string;
  captureUrl: string;
  /** The signed token inside captureUrl, for uploads that start at the desk. */
  captureToken: string;
  /** A short-lived link to the scanner's own file, when a scanner made one. */
  documentUrl: string | null;
  /** A short-lived link to the back of the card, when one was captured. */
  backUrl: string | null;
  qrDataUrl: string;
  initial: BuyerId;
  imageUrl: string | null;
  nextHref: string;
  onNavigate: () => void;
};

const POLL_MS = 8000;

const BUYER_ID_STAGES = ["licence", "mailing"] as const;
type BuyerIdStage = (typeof BUYER_ID_STAGES)[number];
type StageDirection = "forward" | "back";

/** What the browser's own autofill should offer in each box. */
const AUTOCOMPLETE: Record<string, string> = {
  street: "address-line1",
  city: "address-level2",
  state: "address-level1",
  postal: "postal-code",
};

export default function BuyerIdStep({
  dealId,
  captureUrl,
  captureToken,
  documentUrl,
  backUrl,
  qrDataUrl,
  initial,
  imageUrl,
  nextHref,
  onNavigate,
}: Props) {
  const router = useRouter();
  const { t } = useFunnel();
  const [buyerId, setBuyerId] = useState<BuyerId>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<BuyerIdStage>("licence");
  const [direction, setDirection] = useState<StageDirection>("forward");
  const stageIndex = BUYER_ID_STAGES.indexOf(stage);
  const stageShellRef = useRef<HTMLFormElement>(null);
  const stageQuestionRef = useRef<HTMLHeadingElement>(null);
  const mailingStreetRef = useRef<HTMLInputElement>(null);
  const movedStage = useRef(false);
  const mailingAsk = useDeskConfirm();
  const realtimeWorked = useRef(false);
  /** The photograph this screen has already asked the server to sign a URL for. */
  const lastImage = useRef<string | null>(initial.image);
  /**
   * The poll's own read, callable by a person.
   *
   * Assigned inside the effect where the Supabase client lives, so the Check
   * Again button runs exactly the read the eight second poll runs rather than
   * a second, slightly different one that could drift.
   */
  const checkNow = useRef<() => Promise<void>>(async () => {});
  /**
   * The typed way in, chosen while the photograph has not landed.
   *
   * Waiting on a phone is one way to answer this step, and it must never be
   * the only one on screen: the buyer's phone can be dead, the signal can be
   * gone, and the card is sitting right there on the desk. This reveals the
   * same fields the confirmation shows, saving through the same action, with
   * no photograph attached.
   */
  const [typing, setTyping] = useState(false);

  /**
   * Whether the camera is already in the operator's hand.
   *
   * `useDeviceTier` answers this for the whole product through
   * useSyncExternalStore, and it reports "mobile" during SSR and the first
   * client render, so the phone case is what renders first and nothing flashes
   * the wrong way round on the device that needs it.
   */
  const onThisDevice = useDeviceTier() !== "desktop";

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ID_FIELDS.map(({ key }) => [
        key,
        buyerId[key].confirmed ?? buyerId[key].read ?? "",
      ]),
    ),
  );
  const [mailing, setMailing] = useState<AamvaAddress>(() =>
    hasMailing(buyerId.mailing) ? buyerId.mailing : suggestedMailing(buyerId),
  );

  const waiting = !buyerId.image;

  /**
   * Watch this one deal for as long as the step is open.
   *
   * It used to stop watching the moment the photograph arrived, and that threw
   * away the half of the handoff that matters most. The phone's upload writes
   * the deal twice: once to attach the picture, which is what makes this screen
   * move, and again a few seconds later with whatever the reader made of the
   * card. By then this had already unsubscribed, so the fields sat empty and
   * the operator typed a licence number the software had in its hand.
   *
   * Staying subscribed is what makes the two screens one session: a retake
   * from the phone, a correction, a second read, all of it arrives here while
   * somebody is standing at the desk looking at it.
   */
  useEffect(() => {
    /**
     * No Supabase env means no live session — a local preview, or a fork
     * mid-setup. The subscription and the poll are conveniences on top of a
     * step that works typed; a missing configuration must cost the live
     * updates and nothing else. It used to throw out of this effect and
     * take the whole licence screen down, which the Spanish-first persona
     * walk hit at step 9 of a sale.
     */
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const adopt = (stepData: unknown) => {
      const next = readBuyerId(stepData);
      if (!next.image) return;

      // A new photograph needs a new signed URL, which only the server can
      // mint. Refreshing on every update instead would re-render the step
      // under the operator's hands for no reason.
      //
      // Tracked on a ref rather than compared inside the state updater: an
      // updater must be pure, and calling router.refresh() from inside one
      // schedules work on the router while this component is rendering, which
      // React reports as updating a component while rendering another.
      if (lastImage.current !== next.image) {
        lastImage.current = next.image;
        router.refresh();
      }

      setBuyerId(next);

      /**
       * Fill what is empty. Never touch what somebody has typed.
       *
       * The reader's answer can land while the operator is halfway through a
       * field, and having the box rewrite itself mid-word is worse than not
       * reading the card at all. Their typing outranks the machine, which is
       * the same rule that keeps a scan out of a document until a person has
       * confirmed it.
       */
      setValues((current) => {
        const merged = { ...current };
        for (const { key } of ID_FIELDS) {
          if ((merged[key] ?? "").trim().length > 0) continue;
          merged[key] = next[key].confirmed ?? next[key].read ?? "";
        }
        return merged;
      });

      // Same rule as the fields above: fill what is empty, never overwrite what
      // somebody has typed. Applied per part, so a scan that lands after the
      // city has been corrected fills only the postal code.
      setMailing((current: AamvaAddress) => {
        if (hasMailing(current)) return current;
        return hasMailing(next.mailing) ? next.mailing : suggestedMailing(next);
      });
    };

    const channel = supabase
      .channel(`deal-${dealId}-buyer-id`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deals",
          filter: `id=eq.${dealId}`,
        },
        (payload) => {
          realtimeWorked.current = true;
          adopt((payload.new as { step_data?: unknown })?.step_data);
        },
      )
      .subscribe();

    const readOnce = async () => {
      const { data } = await supabase
        .from("deals")
        .select("step_data")
        .eq("id", dealId)
        .maybeSingle();
      adopt((data as { step_data?: unknown } | null)?.step_data);
    };
    checkNow.current = readOnce;

    const poll = window.setInterval(() => {
      if (realtimeWorked.current) return;
      void readOnce();
    }, POLL_MS);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
    // Deliberately not keyed on `waiting`. That is what used to tear the
    // subscription down as soon as the picture landed.
  }, [dealId, router]);

  function save(mailingConfirmed: boolean) {
    setError(null);
    const data = new FormData();
    for (const { key } of ID_FIELDS) data.set(key, values[key] ?? "");
    for (const { key } of MAILING_FIELDS) data.set(`mailing.${key}`, mailing[key] ?? "");
    if (mailingConfirmed) data.set("mailingConfirmed", "true");

    startTransition(async () => {
      const result = await saveConfirmedId(dealId, data);
      if (!result.ok) {
        setError(result.error ?? t.chrome.couldNotSave);
        return;
      }
      if (mailingConfirmed) {
        onNavigate();
        router.push(nextHref);
        return;
      }
      router.refresh();
    });
  }

  /**
   * Move under the same press that answered the screen.
   *
   * Direction is written to the element before React swaps the keyed body.
   * Nothing waits for animation, persistence, or another browser event.
   */
  function moveStage(next: BuyerIdStage, nextDirection: StageDirection) {
    const shell = stageShellRef.current;
    if (shell) {
      shell.dataset.direction = nextDirection;
      shell.dataset.leaving = nextDirection;
    }
    movedStage.current = true;
    setDirection(nextDirection);
    setError(null);
    setStage(next);
  }

  useLayoutEffect(() => {
    const shell = stageShellRef.current;
    if (!shell) return;
    shell.dataset.direction = direction;
    delete shell.dataset.leaving;
    if (!movedStage.current) return;
    window.scrollTo(0, 0);
    stageQuestionRef.current?.focus({ preventScroll: true });
  }, [direction, stage]);

  async function confirmMailing() {
    tapHaptic();
    const confirmed = await mailingAsk.ask({
      question: t.buyerId.askTitle,
      address: joinAddress(mailing) ?? "",
      detail: t.buyerId.askNote,
      confirm: t.buyerId.confirm,
      cancel: t.buyerId.reenter,
      hold: t.holdConfirmation,
    });
    if (!confirmed) {
      requestAnimationFrame(() => mailingStreetRef.current?.focus());
      return;
    }
    save(true);
  }

  /**
   * No signed link means no phone, and that is all it means.
   *
   * The server could not sign a capture link, which in practice means
   * `ADMIN_SESSION_SECRET` is not set on this deployment. That used to throw
   * out of the page and the whole licence step became "This page couldn't
   * load", mid sale, with the customer waiting.
   *
   * Falling straight through to the fields is the right answer: typing a
   * licence is what this step did before the phone handoff existed, and it is
   * still a complete way to finish a sale. The line below says which of the
   * two is happening so nobody stands there waiting for a QR code that is
   * never going to appear.
   */
  const handoffReady = captureUrl.length > 0;

  if (waiting && handoffReady && !typing) {
    /**
     * A QR code is a way of getting a link from a screen with no camera onto a
     * device that has one. On a device that already has the camera it is a
     * picture of the page you are standing on.
     *
     * That is what this step used to show on a phone: a QR captioned "Scan
     * With The Phone", underneath it a hundred and thirty characters of signed
     * capture URL wrapped across four lines, and no way to take a photograph.
     * The operator holding the buyer's licence in one hand and the phone in
     * the other had nothing to press.
     *
     * So the coarse-pointer case gets the camera and the fine-pointer case
     * keeps the handoff it was designed for. Same URL, same token, same
     * fifteen minute expiry either way.
     */
    if (onThisDevice) {
      /*
        Only this link carries a way back, and only because it is this phone.

        The capture screen is a one-way street by design for the buyer's own
        phone, so the QR below stays the bare captureUrl. But when the desk's
        phone walks itself into the capture page, the operator has to be able
        to walk back out to this step, so the path here rides along as a query
        param. The capture page validates its shape before rendering it.
      */
      const hereUrl = `${captureUrl}${captureUrl.includes("?") ? "&" : "?"}back=${encodeURIComponent(
        `/admin/sales/${dealId}/guide/buyerId`,
      )}`;
      return (
        <div className="ed-idcap">
          <a className="ed-btn ed-btn-dark ed-idcap-here" href={hereUrl}>
            <Camera size={18} weight="regular" aria-hidden="true" />
            {t.buyerId.photographHere}
          </a>
          <p className="ed-idcap-wait">{t.buyerId.orSendLink}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="" width={130} height={130} className="ed-idcap-qr" />
          <button
            type="button"
            className="ed-start-quiet"
            onClick={() => setTyping(true)}
          >
            {t.buyerId.typeCard}
          </button>
        </div>
      );
    }

    /**
     * The desk. One question, two answers, and nothing else on the screen.
     *
     * What used to be here was the QR, a caption, and then the capture link
     * printed out in full: a hundred and thirty characters of signed token
     * wrapped across four lines, directly under a picture whose entire job is
     * to save somebody from ever seeing that string. Nobody has ever typed a
     * signed token. It was noise sitting where the answer should be.
     *
     * The second answer is the one the desk asked for. A dealership with a
     * printer usually has a flatbed on top of it, and a flatbed beats a phone
     * at this in every way: the card lies flat, the light is even, nothing has
     * to be held steady, and the barcode reads first time. It also ends with a
     * PDF of the customer's identification, which is the artifact that gets
     * attached to a filing later.
     */
    return (
      <div className="ed-idcap">
        <div className="ed-idcap-handoff">
        <div className="ed-idcap-way">
          {/* A data: URI generated on this render. next/image would add an
              optimizer round trip to bytes that are already inline, and the QR
              must stay pixel exact or a phone camera will not read it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="" width={170} height={170} className="ed-idcap-qr" />
          <p className="ed-idcap-wait">{t.buyerId.scanWithPhone}</p>
        </div>

        {captureToken ? (
          <div className="ed-idcap-way">
            <ScannerUpload token={captureToken} />
            <p className="ed-idcap-wait">{t.buyerId.orScanner}</p>
          </div>
        ) : null}
        </div>

        {/*
          The screen still moves on its own the moment the photograph lands.
          What was missing was the screen saying so. Waiting for a phone with
          no line about what has arrived is indistinguishable from a broken
          page, and the operator has no way to ask. So: the state, out loud,
          and a Check Again that runs the same read the poll runs, for the
          person who wants to press something rather than trust a subscription.
        */}
        <p className="ed-idcap-wait" role="status" aria-live="polite">
          {t.buyerId.nothingReceived}
        </p>
        <div className="ed-idcap-waitways">
          <button
            type="button"
            className="ed-start-quiet"
            onClick={() => void checkNow.current()}
          >
            {t.buyerId.checkAgain}
          </button>
          {/*
            And the fourth way in, which needs no phone at all. The card is on
            the desk; waiting on a subscription must never be the only choice.
          */}
          <button
            type="button"
            className="ed-start-quiet"
            onClick={() => setTyping(true)}
          >
            {t.buyerId.typeCard}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <form
        ref={stageShellRef}
        className="ed-idcap"
        data-buyer-id-confirmation
        data-buyer-id-stage={stage}
        data-direction={direction}
        onSubmit={(event) => {
          event.preventDefault();
          if (stage === "licence") {
            moveStage("mailing", "forward");
            return;
          }
          if (hasMailing(mailing)) void confirmMailing();
        }}
      >
        <p className="ed-cluster-count" data-buyer-id-local-progress aria-live="polite">
          {fillTemplate(t.chrome.countOf, {
            current: stageIndex + 1,
            total: BUYER_ID_STAGES.length,
          })}
        </p>

        <div key={stage} className="ed-cluster-stage" data-buyer-id-stage-panel={stage}>
          <h1
            ref={stageQuestionRef}
            className="ed-cluster-question"
            tabIndex={-1}
          >
            {stage === "licence"
              ? t.buyerId.licenceHeading
              : t.buyerId.mailingHeading}
          </h1>

          {stage === "licence" ? (
            <>
              {waiting && !handoffReady ? (
                <p className="ed-idcap-typeonly">{t.buyerId.notSetUp}</p>
              ) : null}

              {/* The typed way in stays watched. A late photograph fills only
                  the boxes the operator has not already touched. */}
              {waiting && handoffReady ? (
                <p className="ed-idcap-typeonly">{t.buyerId.noPhotoYet}</p>
              ) : null}

              {/* The card stays beside the facts read from it. Moving these
                  pictures to the postal question would leave identity material
                  on screen after the operator has finished checking it. */}
              {imageUrl || backUrl ? (
                <div
                  className="ed-idcap-shots"
                  data-both={imageUrl && backUrl ? "true" : "false"}
                >
                  {imageUrl ? (
                    <figure className="ed-idcap-side">
                      <Image
                        src={imageUrl}
                        alt={t.buyerId.frontAlt}
                        width={420}
                        height={264}
                        className="ed-idcap-shot"
                        unoptimized
                      />
                      <figcaption className="ed-fine">{t.buyerId.front}</figcaption>
                    </figure>
                  ) : null}
                  {backUrl ? (
                    <figure className="ed-idcap-side">
                      <Image
                        src={backUrl}
                        alt={t.buyerId.backAlt}
                        width={420}
                        height={264}
                        className="ed-idcap-shot"
                        unoptimized
                      />
                      <figcaption className="ed-fine">{t.buyerId.back}</figcaption>
                    </figure>
                  ) : null}
                </div>
              ) : null}

              {documentUrl ? (
                <a
                  className="ed-idcap-file"
                  href={documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.buyerId.scannedOnRecord}
                </a>
              ) : null}

              <div className="ed-idcap-fields">
                {ID_FIELDS.map(({ key, mode, caps }, index) => (
                  <label
                    key={key}
                    className="ed-idcap-field"
                    data-buyer-id-field={key}
                  >
                    <span className="ed-field-label">{t.buyerId.fields[key]}</span>
                    <input
                      className="ed-input"
                      value={values[key] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      disabled={pending}
                      inputMode={mode}
                      autoCapitalize={caps}
                      autoCorrect="off"
                      spellCheck={false}
                      // The first box keeps the keyboard ready when this review
                      // first opens. Later moves focus the new question instead.
                      autoFocus={index === 0}
                    />
                  </label>
                ))}
              </div>

              <div className="ed-idcap-actions">
                <button type="submit" className="ed-btn ed-btn-dark">
                  {t.chrome.next}
                </button>
              </div>
            </>
          ) : null}

          {stage === "mailing" ? (
            <>
              {/* Four stored facts stay four editable facts. Street and city
                  keep their own rows; only State and ZIP may read as one idea. */}
              <fieldset className="ed-idcap-mailing">
                <legend className="sr-only">{t.buyerId.mailingLegend}</legend>
                <div className="ed-idcap-mailgrid">
                  {MAILING_FIELDS.map(({ key, caps, mode }) => (
                    <label
                      key={key}
                      className={`ed-idcap-field ed-idcap-m-${key}`}
                      data-buyer-mailing-field={key}
                    >
                      <span className="ed-field-label">
                        {t.buyerId.mailingFields[key]}
                      </span>
                      <input
                        ref={key === "street" ? mailingStreetRef : undefined}
                        className="ed-input"
                        value={mailing[key] ?? ""}
                        onChange={(event) =>
                          setMailing((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        disabled={pending}
                        inputMode={mode}
                        autoCapitalize={caps}
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete={AUTOCOMPLETE[key]}
                        maxLength={key === "state" ? 2 : undefined}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="ed-idcap-actions">
                <button
                  type="button"
                  className="ed-cluster-back"
                  disabled={pending}
                  onClick={() => moveStage("licence", "back")}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  {t.chrome.back}
                </button>
                <button
                  type="button"
                  className="ed-btn ed-btn-outline"
                  disabled={pending}
                  onClick={() => save(false)}
                >
                  {t.buyerId.save}
                </button>
                <button
                  type="submit"
                  className="ed-btn ed-btn-dark"
                  disabled={pending || !hasMailing(mailing)}
                >
                  {t.buyerId.continueOn}
                </button>
              </div>
            </>
          ) : null}

          {error ? (
            <p className="ed-idcap-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>

      {/* The address is read back once through the desk's shared native
          dialog. Escape, backdrop, and Re-enter all resolve the same answer. */}
      <DeskConfirm pending={mailingAsk.pending} onAnswer={mailingAsk.answer} />
    </>
  );
}
