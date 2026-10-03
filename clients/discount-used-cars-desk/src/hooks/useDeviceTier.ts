"use client";

import { useSyncExternalStore } from "react";

export type DeviceTier = "mobile" | "tablet" | "desktop";

/**
 * useDeviceTier — SSR-safe device classifier
 * ──────────────────────────────────────────────────────────────
 *
 *   SSR / first hydrate render       →  'mobile'   (safe default)
 *   After hydration, one re-render   →  computed tier
 *
 *   Decision table:
 *     prefers-reduced-motion: reduce  →  'mobile'   (force)
 *     pointer: coarse  +  w < 768     →  'mobile'
 *     pointer: coarse  +  768 ≤ w<1024→  'tablet'
 *     pointer: coarse  +  w >= 1024   →  'tablet'   (large touch = iPad Pro)
 *     pointer: fine    +  w >= 1024   →  'desktop'
 *     pointer: fine    +  768 ≤ w<1024→  'tablet'
 *     pointer: fine    +  w < 768     →  'mobile'
 *
 *   Why default to 'mobile' on SSR:
 *     - Matches the first client render → zero hydration mismatch
 *     - Mobile path is strictly lighter (no canvas, no rAF)
 *     - Brief 1-frame flash on desktop is imperceptible because
 *       StaticPhaseSection uses the same backgrounds as canvas
 *
 *   Why tier is SESSION-STABLE (cached at module level):
 *     - Rotating an iPhone from portrait (390px) to landscape (844px)
 *       would otherwise cross the breakpoint and trigger a canvas
 *       mount mid-session. That's hostile UX.
 *     - Tier is computed ONCE on first client access and reused
 *       for the rest of the session.
 *
 *   Why useSyncExternalStore:
 *     - Canonical React 19 pattern for reading external mutable state
 *     - Avoids the `react-hooks/set-state-in-effect` lint rule
 *     - Handles the SSR→client snapshot swap cleanly
 */

let cachedTier: DeviceTier | null = null;

function computeTier(): DeviceTier {
  if (typeof window === "undefined") return "mobile";

  const mm =
    typeof window.matchMedia === "function" ? window.matchMedia : null;

  if (!mm) return "mobile";

  // Reduced-motion forces mobile-tier behavior even on desktop
  const reducedMotion = mm("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return "mobile";

  const width = window.innerWidth || 0;
  const isPrimaryTouch = mm("(pointer: coarse)").matches;
  const isPrimaryFine = mm("(pointer: fine)").matches;
  const canHover = mm("(hover: hover)").matches;
  const hasAnyTouch = mm("(any-pointer: coarse)").matches;

  if (isPrimaryTouch || hasAnyTouch) {
    if (width < 768) return "mobile";
    return "tablet"; // includes iPad Pro 1024px — still touch = tablet UX
  }

  if (width >= 1024 && isPrimaryFine && canHover) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

function getClientSnapshot(): DeviceTier {
  if (cachedTier !== null) return cachedTier;
  cachedTier = computeTier();
  return cachedTier;
}

function getServerSnapshot(): DeviceTier {
  return "mobile";
}

// No-op subscribe: tier is session-stable by design, never re-notifies.
// getSnapshot returns the same cached reference, so React never re-renders
// after the initial SSR→client swap.
function subscribe(): () => void {
  return () => {};
}

export function useDeviceTier(): DeviceTier {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
