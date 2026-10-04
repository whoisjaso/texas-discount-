/**
 * The buyer details a sale carries between documents.
 *
 * A customer row holds name, phone and email as columns; the ID number and
 * address live on `profile_data` under `dealership.buyerProfile`, which is the
 * shape the sale portal already wrote. Reading and merging both happen here so
 * the sale desk, the portal and every document prefill agree on where these
 * two fields live instead of each guessing.
 */

import { readIdKind, type IdDocumentKind } from "@/lib/forms/id-document";

export type BuyerProfileFields = {
  idNumber?: string;
  /**
   * Who issued the document: the two letter state for a licence or ID card,
   * the ISO country code for a passport. Captured at intake, so no document
   * asks.
   */
  idState?: string;
  /**
   * What kind of document the number came off. The 130-U ticks a different
   * box for a licence, a passport and a military ID, and a passport's box
   * wants the issuing country written beside it. Absent on records that
   * predate the question, which every reader treats as a licence.
   */
  idKind?: IdDocumentKind;
  address?: string;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Pull the ID number and address out of a customer's `profile_data`. */
export function readBuyerProfile(profileData: unknown): BuyerProfileFields {
  const buyer = asRecord(asRecord(asRecord(profileData).dealership).buyerProfile);
  const kind = text(buyer.buyerIdKind);
  return {
    idNumber: text(buyer.buyerLicense),
    idState: text(buyer.buyerLicenseState),
    idKind: kind ? readIdKind(kind) : undefined,
    address: text(buyer.buyerAddress),
  };
}

/**
 * Merge captured fields into an existing `profile_data`, keeping everything
 * else untouched — a second sale for a returning buyer must never blank
 * details the first one recorded.
 */
export function mergeBuyerProfile(
  profileData: unknown,
  captured: Record<string, unknown>,
): Record<string, unknown> {
  const prior = asRecord(profileData);
  const dealership = asRecord(prior.dealership);
  const buyer = asRecord(dealership.buyerProfile);

  return {
    ...prior,
    dealership: {
      ...dealership,
      buyerProfile: { ...buyer, ...captured },
    },
  };
}

/**
 * US numbers get typed a dozen ways at a desk. Store one form, so looking a
 * returning buyer up by phone actually finds them.
 */
export function toE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
