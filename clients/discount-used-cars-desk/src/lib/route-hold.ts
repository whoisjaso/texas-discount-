/**
 * How long the branded screen is held between one public page and the next.
 *
 * Its own module because two very different things read it and neither can
 * import the other: the pre-paint script in the root layout, which is a string
 * of JavaScript in the document head, and the client component that renders
 * the screen. A hold that lived in one of them and was copied into the other
 * is a hold that gets changed in one place.
 *
 * The screen is deliberate. It is the one thing in this product built to cost
 * a visitor time, so that it reads as one piece rather than as pages snapping
 * in and out. `src/components/site/RouteLoader.tsx` carries the whole reasoning
 * and the guards that keep it from costing anything else.
 *
 * Two lengths since 2026-08-27, by the owner's decision: the full brand
 * moment on the FIRST held arrival of a session, and a short beat on every
 * one after it. The measurement that forced the split: a Marketplace buyer
 * browsing four pages was paying ~25 seconds of logo at the old
 * everywhere-7s number, and the interstitial research (69% abandonment on
 * Google's own data; +113% mobile bounce at 7s load) says that is exactly
 * the visitor with the least patience to spend. The brand moment survives;
 * the browse stops paying it four times.
 */

/** The first held arrival of a session, from when the document starts parsing. */
export const ROUTE_HOLD_FIRST_MS = 7000;

/** Every held arrival after the first. */
export const ROUTE_HOLD_MS = 1200;

/** The fade out afterwards. Not part of the hold. */
export const ROUTE_FADE_MS = 340;

/** Slack the backstop allows past its own hold before force-clearing. */
export const ROUTE_SAFETY_SLACK_MS = 2000;

/**
 * The backstop's DEFAULT length, short-based on purpose.
 *
 * A CSS animation clears the screen whatever else happens, so a timer that
 * never fires cannot leave a black rectangle over a page that has already
 * arrived. Whichever runtime starts a hold feeds the backstop the ACTIVE
 * hold's length through the `--tj-route-safety` custom property; this
 * constant is only the fallback when no script ran, and it is derived from
 * the short hold so a failed 1.2-second timer is cleared in ~3.5 seconds
 * rather than pinned for the first-visit ceiling.
 */
export const ROUTE_SAFETY_MS = ROUTE_HOLD_MS + ROUTE_FADE_MS + ROUTE_SAFETY_SLACK_MS;

/**
 * Session keys, shared by both runtimes.
 *
 * `tj.held` — a hold has STARTED this session. Written at start, not at
 * completion, so no completion path (timer, backstop, teardown) has to
 * succeed for the next page to get the short hold.
 *
 * `tj.holdRun` — the in-flight record `{s: startedAt, d: duration}`. A hard
 * navigation tears the old document down mid-hold; the incoming document's
 * pre-paint script reads this and RESUMES the remaining time instead of
 * misreading "started" as "done" and cutting the very first hold short.
 * Cleared when a hold completes.
 */
export const ROUTE_HELD_KEY = "tj.held";
export const ROUTE_HOLD_RUN_KEY = "tj.holdRun";
