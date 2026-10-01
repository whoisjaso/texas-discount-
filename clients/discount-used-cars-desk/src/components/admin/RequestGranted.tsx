"use client";

import { useEffect, useRef } from "react";
import Monogram from "@/components/site/shared/Monogram";

/**
 * The moment the request lands.
 *
 * The owner asked for a reward at this point and named confetti, then left it
 * open: "even if it does not have to be confetti, there needs to be some type
 * of haptic reward... in a way that fits the vibe, aesthetic, and front end
 * luxurious, opulence."
 *
 * Confetti is the wrong instrument for this brand. Paper scraps falling out
 * of the top of the screen is a birthday card, and this site is a warm sheet
 * of paper with one copper rule on it. The equivalent gesture in that world
 * is a seal being pressed: a copper ring closes around the monogram, the mark
 * settles, and the words arrive after it. It is deliberate rather than
 * scattered, which is what expensive things do when they congratulate you.
 *
 * The haptic is real where it exists. `navigator.vibrate` is Android and
 * desktop Chrome; iOS Safari does not implement it, so this is enhancement
 * rather than the reward itself, and the visual has to carry the moment on
 * its own. The pattern is two short taps and a longer one: a press, not an
 * alert.
 *
 * `prefers-reduced-motion` gets the composed end state with no animation, and
 * no vibration either. Somebody who asked for less movement did not ask for
 * their phone to buzz instead.
 */

type Props = {
  /** The server's own sentence about what happens next. */
  message: string;
};

export default function RequestGranted({ message }: Props) {
  const buzzed = useRef(false);

  useEffect(() => {
    if (buzzed.current) return;
    buzzed.current = true;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) return;
    // Not on every browser, and never worth throwing over.
    try {
      navigator.vibrate?.([14, 60, 14, 90, 32]);
    } catch {
      /* A device that will not buzz is not an error. */
    }
  }, []);

  return (
    <div className="ed-granted" role="status" aria-live="polite">
      <div className="ed-granted-seal" aria-hidden="true">
        <span className="ed-granted-ring" />
        <span className="ed-granted-mark">
          <Monogram height={40} tone="ink" title="" />
        </span>
      </div>

      <h1 className="ed-granted-title">Request Received</h1>
      <p className="ed-granted-note">{message}</p>
    </div>
  );
}
