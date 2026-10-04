"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FunnelLocale, FunnelStrings } from "@/lib/sales/i18n";
import { setAdminLanguage } from "@/lib/actions/admin-language";
import enMessages from "../../../../messages/en.json";

/**
 * The corridor's language, held on the client so switching is instant.
 *
 * Every translated string in the sale corridor renders through a child of
 * this provider. The server page hands over BOTH bundles, so the toggle
 * swaps what is on screen with no navigation and no refresh — typed values,
 * focus, validation state and in-flight uploads all survive, which is the
 * GOV.UK rule for a language switcher: it must never cost the reader their
 * answers.
 *
 * Persistence is two writes with one owner each:
 *
 *   document.cookie   synchronous, in the click. The server reads it on the
 *                     next render, so even an immediate navigation lands in
 *                     the chosen language. Scoped to this signed-in person
 *                     by carrying their user id — see server-language.ts.
 *   setAdminLanguage  async, self-only, writes team_members. Coalesced:
 *                     the latest tap wins and a stale in-flight write is
 *                     ignored when it settles.
 */

type FunnelContextValue = {
  lang: FunnelLocale;
  t: FunnelStrings;
  setLang: (next: FunnelLocale) => void;
  /** True when the profile write failed and only this browser remembers. */
  savedLocally: boolean;
};

const FunnelContext = createContext<FunnelContextValue | null>(null);

export const ADMIN_LANG_COOKIE_NAME = "tj-admin-lang";

export default function FunnelLocaleProvider({
  bundles,
  initial,
  userId,
  children,
}: {
  bundles: Record<FunnelLocale, FunnelStrings>;
  initial: FunnelLocale;
  /** The signed-in auth user id the cookie is scoped to. */
  userId: string | null;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<FunnelLocale>(initial);
  const [savedLocally, setSavedLocally] = useState(false);
  const writeSeq = useRef(0);
  // The write CHAIN: each profile mutation awaits the one before it, so two
  // fast taps cannot land in the database out of order. writeSeq still
  // decides whose result the UI reads.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());

  const setLang = useCallback(
    (next: FunnelLocale) => {
      setLangState(next);

      // Synchronous, before anything can navigate. Path covers the whole
      // admin plus the corridor's own routes.
      if (typeof document !== "undefined" && userId) {
        document.cookie = `${ADMIN_LANG_COOKIE_NAME}=${encodeURIComponent(
          `${userId}.${next}`,
        )}; path=/; max-age=31536000; SameSite=Lax`;
      }

      // Serialized AND coalesced: mutations queue behind one another so an
      // older write can never reach the database after a newer one, and
      // only the newest write's result is read by the UI.
      const seq = ++writeSeq.current;
      writeChain.current = writeChain.current
        .then(() => setAdminLanguage(next))
        .then((result) => {
          if (writeSeq.current !== seq) return;
          setSavedLocally(!result.ok);
        })
        .catch(() => {
          if (writeSeq.current !== seq) return;
          setSavedLocally(true);
        });
    },
    [userId],
  );

  /**
   * The document says what language it is in, and changes its mind with the
   * toggle.
   *
   * Every screen under this provider is a corridor screen, and a corridor
   * screen has no dashboard around it, so when the corridor is in Spanish
   * the whole document is. Saying so is not decoration:
   *
   * - A screen reader pronounces `¿Mostró comprobante de seguro?` with
   *   Spanish phonetics instead of reading Spanish words through an English
   *   voice, which is close to unintelligible.
   * - It gives the stylesheet the one hook it needs to stop title-casing
   *   Spanish. The admin's buttons are `text-transform: capitalize`, which
   *   is the house style in English and simply wrong in Spanish: `Sí, Lo
   *   Mostró Hoy` is not a sentence anybody writes.
   *
   * Restored on the way out, so leaving the corridor for the dashboard does
   * not leave the document claiming to be Spanish.
   */
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = lang;
    return () => {
      root.lang = previous;
    };
  }, [lang]);

  const value = useMemo<FunnelContextValue>(
    () => ({ lang, t: bundles[lang], setLang, savedLocally }),
    [lang, bundles, setLang, savedLocally],
  );

  return <FunnelContext.Provider value={value}>{children}</FunnelContext.Provider>;
}

/**
 * Outside a provider — a threaded component reused on a screen that is not
 * part of the bilingual corridor yet — the words fall back to English and
 * the toggle is inert. Crashing there would make every reuse of a corridor
 * component a wiring exercise; falling back makes translation additive.
 */
const FALLBACK: FunnelContextValue = {
  lang: "en",
  t: enMessages.funnel,
  setLang: () => {},
  savedLocally: false,
};

export function useFunnel(): FunnelContextValue {
  return useContext(FunnelContext) ?? FALLBACK;
}

/** True only when a provider is actually above, i.e. the toggle would work. */
export function useHasFunnelProvider(): boolean {
  return useContext(FunnelContext) !== null;
}
