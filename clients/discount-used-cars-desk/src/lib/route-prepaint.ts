import {
  ROUTE_FADE_MS,
  ROUTE_HOLD_FIRST_MS,
  ROUTE_HOLD_MS,
  ROUTE_SAFETY_SLACK_MS,
} from "@/lib/route-hold";

type RoutePrepaintTiming = {
  firstHoldMs: number;
  holdMs: number;
  fadeMs: number;
  safetySlackMs: number;
};

/**
 * Serialized into the document head. Keep this function self-contained:
 * only its timing argument and browser globals survive serialization.
 */
function runRoutePrepaint(timing: RoutePrepaintTiming) {
  try {
    const root = document.documentElement;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isAdmin = location.pathname.indexOf("/admin") === 0;
    const seen = sessionStorage.getItem("tj.seen") === "1";

    if (sessionStorage.getItem("tj.loaderShown") === "1" || reducedMotion) {
      root.dataset.tjLoader = "skip";
    }

    if (seen && !reducedMotion && !isAdmin) {
      const now = Date.now();
      let hold = 0;
      try {
        const run = JSON.parse(sessionStorage.getItem("tj.holdRun") || "0");
        if (run && run.s && run.d && run.s + run.d > now) {
          hold = run.s + run.d - now;
        }
      } catch {
        // A malformed in-flight record falls back to the session's hold.
      }

      if (!hold) {
        hold = sessionStorage.getItem("tj.held") === "1"
          ? timing.holdMs
          : timing.firstHoldMs;
      }
      sessionStorage.setItem("tj.held", "1");
      sessionStorage.setItem("tj.holdRun", JSON.stringify({ s: now, d: hold }));
      root.style.setProperty(
        "--tj-route-safety",
        (hold + timing.fadeMs + timing.safetySlackMs) + "ms",
      );
      root.dataset.tjRoute = "hold";
      setTimeout(function () {
        root.dataset.tjRoutePhase = "leaving";
      }, hold);
      setTimeout(function () {
        delete root.dataset.tjRoute;
        delete root.dataset.tjRoutePhase;
        try {
          sessionStorage.removeItem("tj.holdRun");
        } catch {
          // The overlay must clear even if storage stops accepting writes.
        }
      }, hold + timing.fadeMs);
    }

    if (!isAdmin) sessionStorage.setItem("tj.seen", "1");
  } catch {
    // Unavailable browser storage must never create a held screen.
  }
}

/** Avoid production constant folding of concatenated script templates. */
export const routePrepaintScript = [
  "(",
  runRoutePrepaint.toString(),
  ")(",
  JSON.stringify({
    firstHoldMs: ROUTE_HOLD_FIRST_MS,
    holdMs: ROUTE_HOLD_MS,
    fadeMs: ROUTE_FADE_MS,
    safetySlackMs: ROUTE_SAFETY_SLACK_MS,
  } satisfies RoutePrepaintTiming),
  ");",
].join("");
