// ============================================================
// Document i18n — server-side translation access for documents
//
// Imports messages/*.json directly (no next-intl dependency).
// Used by the document preview components (which Puppeteer renders
// to PDF via /documents/render) and the customer portal.
// ============================================================

import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import { applyBrandTokens } from '@/lib/brand-messages';

// Resolved once at module load rather than per call: the catalogues are
// static imports, so the substitution is build-time work either way.
const messages: Record<string, typeof en> = {
  en: applyBrandTokens(en),
  es: applyBrandTokens(es),
};

export type DocLocale = 'en' | 'es';

/** Get the full documents translation namespace for a locale */
export function getDocStrings(locale: string = 'en') {
  const safeLocale: DocLocale = (locale === 'es') ? 'es' : 'en';
  return messages[safeLocale].documents;
}

/** Get the locale string, validated */
export function resolveLocale(input: string | null | undefined): DocLocale {
  return input === 'es' ? 'es' : 'en';
}

export type DocStrings = ReturnType<typeof getDocStrings>;
