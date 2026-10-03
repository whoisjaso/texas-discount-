"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check } from "@phosphor-icons/react";
import { prepareZXingModule, readBarcodesFromImageData } from "zxing-wasm/reader";
import {
  advanceStreak,
  coachFrame,
  cutoutInSource,
  measureFrame,
  shouldCapture,
} from "@/lib/sales/frame-quality";
import { getFunnelStrings } from "@/lib/sales/i18n";
import { looksLikeLicence, readAamva, type AamvaFields } from "@/lib/sales/aamva";
import { capturedHaptic, tapHaptic } from "@/lib/haptics";

/**
 * The camera, for both sides of a licence.
 *
 * One scanner, used from two places, which is why it lives here rather than
 * beside either of them: the customer's own phone at /capture/[token], and the
 * desk's own device on the Start A Sale form. A second copy on the entry screen
 * is how this product ended up with a worse scanner that every sale reached
 * first and a better one nobody got to.
 *
 * Each side is taken the same way, and the sequence is the same both times:
 *
 *   aim      the frame's shape says what is wanted. Card-shaped for the front,
 *            barcode-shaped for the back.
 *   take     the phone takes it by itself when the frame is good enough, or
 *            the shutter takes it when somebody decides not to wait. Both
 *            exist because both happen: a card under a desk lamp trips the
 *            quality gate in a second, and a card in a dim showroom never
 *            does, and the person holding it can see that before the software
 *            can.
 *   check    the picture is held still on screen and asked about. This is the
 *            only moment anybody can catch a thumb over a corner or a glare
 *            across the barcode, and it costs one tap. Retake puts the camera
 *            straight back, because the camera never stopped.
 *
 * The decoder runs entirely on the phone. Nothing is uploaded to be read, so a
 * customer's licence never travels anywhere except to this dealership's own
 * storage, and the scan works on a bad signal in a lot with no bars.
 */

/** Serve the decoder from this origin. The default is a CDN, which the site's
 *  content policy blocks, and which would also fail on a weak connection at
 *  exactly the moment somebody is standing at the desk waiting. */
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? `/wasm/${path}` : `${prefix}${path}`,
  },
  fireImmediately: false,
});

/** Live preview cadence. Faster buys nothing: a hand cannot move a card into
 *  frame in less than this, and every frame costs battery and heat. */
const FRAME_MS = 80;

/** After this long on the back without a decode, the barcode is not going to
 *  read, and continuing to say "hold still" is a lie. The way out is on the
 *  screen from the start; this only turns the hint honest. */
const BARCODE_PATIENCE_MS = 12000;

/** Long enough that the framing is not the problem any more. The commonest
 *  reason a barcode will not read on a phone is the card held too close for
 *  the lens to focus, and the person doing it cannot tell: the preview is
 *  small and the blur is subtle. Coaching them back is the fix. */
const BACKOFF_HINT_MS = 5000;

/**
 * One frame, read as hard as the decoder can.
 *
 * `tryDenoise` is the option that is not a default, and it exists for exactly
 * this: a morphological pass that recovers 2D codes from the slight softness a
 * phone lens gives a card at close range. It costs time, which is why the
 * frames it runs on are cropped to the barcode window first.
 */
async function decodeLicence(frame: ImageData): Promise<AamvaFields | null> {
  const results = await readBarcodesFromImageData(frame, {
    formats: ["PDF417"],
    tryHarder: true,
    tryDenoise: true,
    maxNumberOfSymbols: 1,
    // Not the default. The decoder's default text mode is "HRI", which
    // renders every non-graphical character as an angle-bracket escape,
    // so the record separators that divide a licence into fields come
    // back as the literal text "<LF>" and the payload parses as one
    // meaningless line. Every real licence would have been rejected.
    textMode: "Plain",
  });
  const text = results[0]?.text;
  if (text && looksLikeLicence(text)) return readAamva(text);
  return null;
}

export type ScanResult = {
  /** The front of the card, as a JPEG blob for upload. */
  front: Blob;
  /**
   * The back of the card, kept as well as read.
   *
   * It used to be decoded and discarded, which meant the sale held a
   * photograph of one side of a two sided document. Every dealership that
   * files a licence files both sides, because the back carries the
   * restrictions, the endorsements and the issuing authority's own text, and
   * an auditor asking to see the licence is not asking to see half of it.
   *
   * Null only when the barcode never read and the person went on without it.
   */
  back: Blob | null;
  /** What the barcode said, or null when the person skipped that pass. */
  fields: AamvaFields | null;
};

/**
 * `ready` is the one screen with a button on it, and it is not a shutter.
 *
 * A browser will not vibrate a page that nobody has touched. Chrome states it
 * outright in the console: "Blocked call to navigator.vibrate because user
 * hasn't tapped on the frame or any embedded frame yet." This page is reached
 * by pointing a phone camera at a QR code on a desk and opening a link, so
 * nobody ever touches it, and every buzz this scanner tries to give was being
 * swallowed. Seen in the console of a real run, not reasoned about.
 *
 * The two `Review` stages hold a still of what was just taken. The camera is
 * left running underneath them, so Retake is instant rather than a second
 * permission prompt and a second warm-up.
 */
type Stage =
  | "ready"
  | "starting"
  | "front"
  | "frontReview"
  | "back"
  | "backReview"
  | "done";

type Props = {
  onScanned: (result: ScanResult) => void;
  /** Shown when the camera cannot be used at all, so there is always a way on. */
  onFallback: () => void;
  /**
   * Leaving without a licence.
   *
   * Every full-screen thing in this product has a way out that is not the
   * browser's back button, and this one had none: a camera that has taken over
   * the screen with no exit is a trap, and it is worse on a desk machine where
   * there is no swipe to fall back on.
   */
  onExit: () => void;
  /**
   * Whether this document has already been tapped.
   *
   * True from the desk, where a button was pressed to get here, so the browser
   * will already vibrate and the ready screen would be a second tap buying
   * nothing. False on the phone, which arrives from a QR code untouched and
   * needs the tap for the reason in the Stage comment above.
   */
  activated?: boolean;
  /**
   * What the way out calls itself.
   *
   * "Leave" is right at the desk, where the exit goes back to a form. On the
   * buyer's own phone the same control opens the manual photo screen, and a
   * buyer reading "Leave" thinks they are abandoning the errand, so that page
   * hands in a word that says where it actually goes.
   */
  exitLabel?: string;
  /** The reader's language. The buyer holds this phone on the capture page. */
  lang?: "en" | "es";
};

export default function Scanner({
  onScanned,
  onFallback,
  onExit,
  activated = false,
  exitLabel,
  lang = "en",
}: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cutout = useRef<HTMLDivElement>(null);
  const crop = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const streak = useRef(0);
  const front = useRef<Blob | null>(null);
  const back = useRef<Blob | null>(null);
  const fields = useRef<AamvaFields | null>(null);
  const backStartedAt = useRef<number>(0);

  const t = getFunnelStrings(lang).scanner;
  const exit = exitLabel ?? t.leave;
  const [stage, setStage] = useState<Stage>(activated ? "starting" : "ready");
  const [hint, setHint] = useState<string | null>(null);
  /** The still being checked, as an object URL over the live preview. */
  const [held, setHeld] = useState<string | null>(null);

  // The interval closure needs to know which pass is running, and it is created
  // once. Mirrored into a ref in an effect rather than assigned during render,
  // which React forbids and which would make the value depend on render timing.
  const stageRef = useRef<Stage>(activated ? "starting" : "ready");
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /** Asks the running interval to take the next frame, whoever asked for it. */
  const shutter = useRef(false);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  /*
    The still is a blob URL and the browser keeps it alive until it is revoked.
    Cleared whenever it is replaced and when this screen closes, so a scan that
    is retaken four times does not leave four photographs of somebody's licence
    alive in the tab.
  */
  useEffect(() => {
    if (!held) return;
    return () => URL.revokeObjectURL(held);
  }, [held]);

  /** Pulls the current video frame into the canvas at its natural size. */
  const grab = useCallback((): ImageData | null => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c || v.videoWidth === 0) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  }, []);

  /**
   * The barcode region of the frame just grabbed, padded for an unsteady hand.
   *
   * The veil forces the barcode inside the cutout, so pixels outside it are
   * desk. Decoding only this window is what makes the higher capture
   * resolution affordable: fewer pixels per decode, and every one of them is
   * barcode. Padded by a sixth each side because a hand drifts between the
   * frame being shown and the frame being read, and clamped so the pad cannot
   * reach outside the sensor.
   */
  const grabCutout = useCallback((): ImageData | null => {
    const v = video.current;
    const c = canvas.current;
    const box = cutout.current?.getBoundingClientRect();
    if (!v || !c || !box || c.width === 0) return null;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const rect = cutoutInSource(
      { width: c.width, height: c.height },
      { width: v.clientWidth, height: v.clientHeight },
      { width: box.width, height: box.height },
    );
    if (rect.width === 0 || rect.height === 0) return null;

    const padX = Math.round(rect.width / 6);
    const padY = Math.round(rect.height / 6);
    const x = Math.max(0, rect.x - padX);
    const y = Math.max(0, rect.y - padY);
    const width = Math.min(c.width - x, rect.width + padX * 2);
    const height = Math.min(c.height - y, rect.height + padY * 2);
    if (width <= 0 || height <= 0) return null;
    return ctx.getImageData(x, y, width, height);
  }, []);

  useEffect(() => {
    if (stage === "ready") return;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onFallback();
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            /*
              Raised from 1080p, and the barcode is why. A licence PDF417 packs
              its bars at about a quarter millimetre, and at 1920 across a card
              filling the frame the decoder gets barely two pixels per bar,
              which is the edge of what it can read. The front never noticed
              because a photograph does not care. The back failed on real
              phones in the owner's hands. The decode cost is held down by
              reading only the cutout region, below.
            */
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;

        /*
          Ask the lens to keep focusing. Phones that support it hunt focus
          continuously, which matters at barcode distance; phones that do not
          throw, and the catch swallows it because the stream is already good.
        */
        try {
          const track = media.getVideoTracks()[0];
          await track?.applyConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          });
        } catch {
          // The stream works without it.
        }
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => {});
        }
        setStage("front");
      } catch {
        // Refused permission, no camera, or a browser that will not allow it on
        // this origin. All three have the same answer: offer the plain picker.
        onFallback();
      }
    }

    void start();

    /**
     * A JPEG of the current frame.
     *
     * `toCutout` crops to the window the person is framing through, which is
     * right for the front: what they lined up is what gets filed, so the
     * exported ID fills a sheet rather than sitting as a stamp in the middle
     * of a picture of a desk.
     *
     * It is wrong for the back. The frame there is barcode-shaped and smaller
     * than the card, so cropping to it would file a photograph of a barcode
     * and lose the restrictions, the endorsements and the issuing authority's
     * own text, which is most of why anybody keeps the back at all. The whole
     * sensor frame is kept instead, and the card is inside it by definition:
     * it had to be, to fill the frame.
     */
    async function snapshot(toCutout: boolean): Promise<Blob | null> {
      return new Promise<Blob | null>((resolve) => {
        const full = canvas.current;
        const out = crop.current;
        const v = video.current;
        if (!full || !out || !v) {
          resolve(null);
          return;
        }

        const box = toCutout ? cutout.current?.getBoundingClientRect() : null;
        const rect = box
          ? cutoutInSource(
              { width: full.width, height: full.height },
              { width: v.clientWidth, height: v.clientHeight },
              { width: box.width, height: box.height },
            )
          : { x: 0, y: 0, width: full.width, height: full.height };

        if (rect.width === 0 || rect.height === 0) {
          resolve(null);
          return;
        }
        out.width = rect.width;
        out.height = rect.height;
        const ctx = out.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(
          full,
          rect.x, rect.y, rect.width, rect.height,
          0, 0, rect.width, rect.height,
        );
        out.toBlob((b) => resolve(b), "image/jpeg", 0.92);
      });
    }

    /** Freezes what was just taken and asks about it. */
    function hold(blob: Blob, next: Stage) {
      setHeld(URL.createObjectURL(blob));
      streak.current = 0;
      setHint(null);
      setStage(next);
    }

    async function tick() {
      const current = stageRef.current;
      // A review is a still. Nothing is measured, decoded or captured while
      // one is on screen, so the frame being looked at cannot be replaced
      // underneath the person looking at it.
      if (
        cancelled ||
        current === "ready" ||
        current === "starting" ||
        current === "frontReview" ||
        current === "backReview" ||
        current === "done"
      ) {
        return;
      }

      const frame = grab();
      if (!frame) return;

      const asked = shutter.current;
      shutter.current = false;

      if (current === "front") {
        const coaching = coachFrame(
          measureFrame(frame.data, frame.width, frame.height),
        );
        setHint(coaching.hint);
        streak.current = advanceStreak(streak.current, coaching.good);

        // Either the phone decided, or a person did. A person pressing the
        // shutter overrides the quality gate on purpose: they can see the card
        // and the gate is a guess about pixels.
        if (asked || shouldCapture(streak.current)) {
          // Saved as the card, not as the whole sensor frame. What the person
          // framed in the cutout is what is filed, so the exported ID fills a
          // sheet rather than sitting as a stamp in the middle of a desk.
          const blob = await snapshot(true);
          if (blob && !cancelled) {
            front.current = blob;
            tapHaptic();
            hold(blob, "frontReview");
          }
        }
        return;
      }

      // Reading the barcode. No quality gate here: the decoder is a better
      // judge of whether it can read a frame than any statistic about it, and
      // a barcode that decodes from a frame we would have rejected is still a
      // correct barcode.
      let read: AamvaFields | null = null;
      try {
        // The cutout region first: all barcode, few pixels, fast. The full
        // frame only on a shutter press, where the person has declared the
        // card is in view and one slow exhaustive read is worth it even if
        // their framing drifted outside the window.
        const region = grabCutout() ?? frame;
        read = await decodeLicence(region);
        if (!read && asked && region !== frame) {
          read = await decodeLicence(frame);
        }
      } catch {
        // A frame the decoder could not handle. The next one is 80ms away.
      }

      if (read || asked) {
        // Taken from the frame that just decoded, before anything else moves.
        // On a decode this is the one moment the card is known to be square to
        // the lens, in focus and filling the view, because a barcode that read
        // is proof of all three.
        const backShot = await snapshot(false);
        if (backShot && !cancelled) {
          back.current = backShot;
          fields.current = read;
          if (read) capturedHaptic();
          else tapHaptic();
          hold(backShot, "backReview");
        }
        return;
      }

      const waited = Date.now() - backStartedAt.current;
      if (waited > BARCODE_PATIENCE_MS) {
        // The barcode has genuinely failed. Saying "hold still" any longer
        // would be a lie, so the hint points at the way out instead.
        setHint(t.wontRead);
      } else if (waited > BACKOFF_HINT_MS) {
        // The one correction worth making out loud. Too close for the lens to
        // focus is the commonest reason a barcode never reads, and the person
        // holding the card cannot see the blur on a small preview.
        setHint(t.notReading);
      }
    }

    const timer = window.setInterval(() => void tick(), FRAME_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stop();
    };
    // `stage` is here only to start the camera once the tap has happened.
    // Every later stage change is mirrored onto stageRef, which the interval
    // reads, so this does not tear the camera down and rebuild it per pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grab, grabCutout, onFallback, stop, stage === "ready"]);

  /** Throw the held still away and put the camera back on the same side. */
  function retake() {
    tapHaptic();
    setHeld(null);
    setHint(null);
    streak.current = 0;
    if (stageRef.current === "frontReview") {
      front.current = null;
      setStage("front");
    } else {
      back.current = null;
      fields.current = null;
      backStartedAt.current = Date.now();
      setStage("back");
    }
  }

  /** Accept the held still and go on: to the back, or off this screen. */
  function keep() {
    tapHaptic();
    setHeld(null);
    if (stageRef.current === "frontReview") {
      backStartedAt.current = Date.now();
      setStage("back");
      return;
    }
    const captured = front.current;
    if (!captured) return;
    stop();
    setStage("done");
    onScanned({ front: captured, back: back.current, fields: fields.current });
  }

  /** Sends the front alone, for a card whose barcode will not read. */
  function skipBarcode() {
    if (!front.current) return;
    stop();
    setStage("done");
    // No back image either. A card whose barcode never read is one nobody has
    // framed successfully, and filing a blurry photograph of the back would
    // put something on the record that looks like evidence and is not.
    onScanned({ front: front.current, back: null, fields: null });
  }

  /*
    The one tap, and the whole screen is it.

    Nothing to aim at, because aiming at a button is work and there is nothing
    else on this screen to hit by mistake. What it buys is stated in the Stage
    comment above: a browser will not vibrate a document nobody has touched,
    and this one is opened from a QR code without ever being touched.
  */
  if (stage === "ready") {
    return (
      <main className="ed-scan-begin-screen">
        <button type="button" className="ed-scan-begin" onClick={() => setStage("starting")}>
          <Camera size={40} weight="light" aria-hidden="true" />
          <span className="ed-scan-begin-title">{t.begin}</span>
          <span className="ed-scan-begin-note">{t.beginNote}</span>
        </button>
        <button type="button" className="ed-scan-leave" onClick={onExit}>
          {exit}
        </button>
      </main>
    );
  }

  const reviewing = stage === "frontReview" || stage === "backReview";

  return (
    <main className="ed-scan">
      <video
        ref={video}
        className="ed-scan-video"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />
      <canvas ref={canvas} className="sr-only" aria-hidden="true" />
      <canvas ref={crop} className="sr-only" aria-hidden="true" />

      {/* The still, over the live preview rather than instead of it. The camera
          keeps running underneath, so Retake is immediate. */}
      {held ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ed-scan-held" src={held} alt={t.justTaken} />
      ) : null}

      {/* The way out, in the same word and the same place the guide uses for
          it. A camera that has taken the whole screen with no exit is a trap,
          and on a desk machine there is no swipe to fall back on. */}
      <button type="button" className="ed-scan-leave" onClick={onExit}>
        {exit}
      </button>

      {reviewing ? null : (
        <div className="ed-scan-veil" aria-hidden="true">
          <div
            ref={cutout}
            className="ed-scan-cutout"
            data-stage={stage}
          >
            {/*
              The frame's shape is the aiming instruction, and it changes with
              the pass. Card-shaped for the front, because a photograph of a
              licence is what is wanted. Barcode-shaped and nearly the width of
              the screen for the back, because what is wanted there is not a
              picture of a card but enough pixels across the bars to decode, and
              the only way to get them is to bring the card closer. See
              `.ed-scan-cutout[data-stage]`.
            */}
          </div>
        </div>
      )}

      {stage === "done" ? (
        <span className="ed-scan-got ed-scan-got-alone">
          <Check size={34} weight="bold" aria-hidden="true" />
        </span>
      ) : null}

      <div className="ed-scan-copy">
        <p className="ed-scan-title" role="status" aria-live="polite">
          {stage === "starting"
            ? t.opening
            : stage === "front"
              ? t.front
              : stage === "frontReview"
                ? t.canYouRead
                : stage === "back"
                  ? t.turnOver
                  : stage === "backReview"
                    ? fields.current
                      ? t.barcodeRead
                      : t.canYouRead
                    : t.gotIt}
        </p>

        {/* One line, and only when something is wrong. The screen advancing on
            its own is the confirmation; a "looks good" message would be noise
            competing with it. */}
        {hint && !reviewing ? (
          <p className="ed-scan-hint">
            {/* frame-quality speaks English keys; the dictionary localizes
                the three it can produce and passes anything else through. */}
            {hint === "More light"
              ? t.moreLight
              : hint === "Too bright"
                ? t.tooBright
                : hint === "Hold still"
                  ? t.holdStill
                  : hint}
          </p>
        ) : null}

        {stage === "back" && !hint ? (
          <p className="ed-scan-hint">{t.fillFrame}</p>
        ) : null}

        {stage === "frontReview" ? (
          <p className="ed-scan-hint">{t.frontLegible}</p>
        ) : null}

        {stage === "backReview" ? (
          <p className="ed-scan-hint">
            {fields.current ? t.detailsCame : t.noBarcode}
          </p>
        ) : null}

        {/*
          The shutter, on both aiming passes.

          The phone still takes it by itself the moment the frame is good
          enough. This is for the times it will not: a dim showroom, a worn
          card, a laminate throwing glare. The person holding the card can see
          that the picture is fine well before a statistic about pixels agrees.
        */}
        {stage === "front" || stage === "back" ? (
          <button
            type="button"
            className="ed-scan-shutter"
            aria-label={t.shutter}
            onClick={() => {
              shutter.current = true;
            }}
          >
            <span className="ed-scan-shutter-ring" aria-hidden="true" />
          </button>
        ) : null}

        {reviewing ? (
          <div className="ed-scan-choice">
            <button type="button" className="ed-scan-retake" onClick={retake}>
              {t.retake}
            </button>
            <button type="button" className="ed-scan-keep" onClick={keep}>
              {stage === "frontReview" ? t.useItTurn : t.useIt}
            </button>
          </div>
        ) : null}

        {/*
          The way past the camera, on both aiming passes, from the first frame.

          It used to appear only after twelve seconds of the back pass failing,
          which meant a person who already knew the card would not scan, or a
          buyer who simply did not want to aim a camera at it, stood waiting for
          a button the screen was deliberately withholding. Nobody's question
          should have a timer on its answer.

          On the front nothing has been captured yet, so the whole scan is
          stepped past into the manual path. On the back the front is already
          taken and kept, so only the barcode is skipped.
        */}
        {stage === "front" || stage === "back" ? (
          <button
            type="button"
            className="ed-scan-skip"
            onClick={stage === "front" ? onFallback : skipBarcode}
          >
            {t.typeInstead}
          </button>
        ) : null}
      </div>
    </main>
  );
}
