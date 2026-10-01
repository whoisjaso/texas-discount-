// ============================================================
// Sale corridor i18n — the funnel's own strings, EN and ES
//
// Mirrors src/lib/documents/i18n.ts: the catalogues are imported
// directly from messages/*.json, so there is no next-intl in the
// admin and no request-time loading. The corridor pages hand BOTH
// bundles to the client provider, which is what lets the operator
// switch language mid-question without a navigation and without
// losing anything they have typed.
// ============================================================

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

export type FunnelLocale = "en" | "es";

type Messages = typeof en;
const messages: Record<FunnelLocale, Messages> = { en, es };

/** The whole funnel namespace for one locale. */
export function getFunnelStrings(locale: string = "en") {
  const safe: FunnelLocale = locale === "es" ? "es" : "en";
  return messages[safe].funnel;
}

export type FunnelStrings = ReturnType<typeof getFunnelStrings>;

/** Both bundles at once, for the client provider. */
export function getFunnelBundles(): Record<FunnelLocale, FunnelStrings> {
  return { en: messages.en.funnel, es: messages.es.funnel };
}

export function resolveFunnelLocale(input: string | null | undefined): FunnelLocale {
  return input === "es" ? "es" : "en";
}

/**
 * Fill `{name}` slots in a catalogue string. The catalogue never carries
 * markup, so plain replacement is the whole job.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/**
 * Money, in the reader's locale. Both render as "$1,234.56" in US English
 * and US Spanish — the formatter exists so the locale decision lives in one
 * place rather than as `en-US` hardcoded per component.
 */
export function funnelDollars(amount: number, locale: FunnelLocale): string {
  return amount.toLocaleString(locale === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: "USD",
  });
}
