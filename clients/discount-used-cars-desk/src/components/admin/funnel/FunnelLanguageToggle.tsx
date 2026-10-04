"use client";

import LanguageToggle from "@/components/admin/LanguageToggle";
import {
  useFunnel,
  useHasFunnelProvider,
} from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * The corridor's EN/ES switch — the same pill as everywhere else, wired to
 * the funnel provider so a tap swaps every word on the screen in place.
 * Appears on every corridor page (the GOV.UK rule: the switcher is always
 * there, it keeps you on the same page, and it never costs you your answers).
 */
export default function FunnelLanguageToggle() {
  const hasProvider = useHasFunnelProvider();
  const { lang, setLang, savedLocally, t } = useFunnel();

  // An inert toggle is worse than none: outside a provider it is not drawn.
  if (!hasProvider) return null;

  return (
    <span className="ed-funnel-lang">
      <LanguageToggle lang={lang} onChange={setLang} />
      {savedLocally ? (
        <span className="sr-only" role="status">
          {t.chrome.savedLocallyNote}
        </span>
      ) : null}
    </span>
  );
}
