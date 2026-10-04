import { describe, it, expect } from 'vitest';
import { getDocStrings, resolveLocale } from '../lib/documents/i18n';
import { dealership } from '../lib/dealership-config';

describe('getDocStrings', () => {
  it('returns English strings for "en"', () => {
    const strings = getDocStrings('en');
    expect(strings.billOfSale.title).toBe('Bill of Sale');
    expect(strings.contract.title).toBe('Retail Installment Contract');
    expect(strings.rental.title).toBe('Vehicle Rental Agreement');
  });

  it('returns Spanish strings for "es"', () => {
    const strings = getDocStrings('es');
    expect(strings.billOfSale.title).toBe('Carta de Venta');
    expect(strings.contract.title).toBe('Contrato de Venta a Plazos');
    expect(strings.rental.title).toBe('Contrato de Arrendamiento de Vehículo');
  });

  it('falls back to English for invalid locale', () => {
    const strings = getDocStrings('fr');
    expect(strings.billOfSale.title).toBe('Bill of Sale');
  });

  it('falls back to English for empty string', () => {
    const strings = getDocStrings('');
    expect(strings.billOfSale.title).toBe('Bill of Sale');
  });

  it('defaults to English when no argument', () => {
    const strings = getDocStrings();
    expect(strings.billOfSale.title).toBe('Bill of Sale');
  });

  it('has matching keys in both locales', () => {
    const en = getDocStrings('en');
    const es = getDocStrings('es');

    // Check top-level sections exist in both
    const enKeys = Object.keys(en).sort();
    const esKeys = Object.keys(es).sort();
    expect(enKeys).toEqual(esKeys);

    // Check nested keys match for each section
    for (const section of enKeys) {
      const enSection = Object.keys((en as Record<string, Record<string, string>>)[section]).sort();
      const esSection = Object.keys((es as Record<string, Record<string, string>>)[section]).sort();
      expect(esSection, `Missing keys in es.documents.${section}`).toEqual(enSection);
    }
  });

  it('has shared section with dealer info', () => {
    const strings = getDocStrings('en');
    // The licensee on the TxDMV record, read from the one config, never typed here.
    expect(strings.shared.dealerName).toBe(dealership.legalName);
    expect(strings.shared.buyerSignature).toBe('Buyer Signature');
  });

  it('has form130U section with Spanish header', () => {
    const en = getDocStrings('en');
    const es = getDocStrings('es');
    // Both locales should have the Spanish header (it's always in Spanish)
    expect(en.form130U.spanishHeader).toContain('TxDMV');
    expect(es.form130U.spanishHeader).toContain('TxDMV');
  });
});

describe('resolveLocale', () => {
  it('returns "es" for "es"', () => expect(resolveLocale('es')).toBe('es'));
  it('returns "en" for "en"', () => expect(resolveLocale('en')).toBe('en'));
  it('returns "en" for null', () => expect(resolveLocale(null)).toBe('en'));
  it('returns "en" for undefined', () => expect(resolveLocale(undefined)).toBe('en'));
  it('returns "en" for invalid', () => expect(resolveLocale('fr')).toBe('en'));
});
