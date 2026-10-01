import { factOr } from "@/lib/dealership-config";
import { dealership, notSet, SITE_URL, SITE_URL_CONFIGURED } from '@/lib/dealership-config';

/**
 * Dealer identity on a document.
 *
 * Derived from the one dealership config rather than typed again here, so a
 * change of address or phone reaches the paperwork without anybody having to
 * remember this file exists.
 *
 * The legal entity as it appears on the dealer licence. Never derived by
 * appending a suffix to the trading name: until the owner supplies it, the
 * document prints its visible "Not set" marker.
 */
export const DEALER_NAME = factOr(dealership.legalName, "dealer legal name");
export const DEALER_ADDRESS = dealership.address.oneLine;
export const DEALER_PHONE = dealership.phone.display;
// Printed on paper: the configured domain, or its visible marker (never the dev host).
export const DEALER_WEBSITE = SITE_URL_CONFIGURED ? SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') : notSet('website domain');
export const DEALER_LICENSE = factOr(dealership.license, "dealer licence (GDN)");

export interface SignatureData {
  buyerIdPhoto: string;
  buyerSignature: string;
  buyerSignatureDate: string;
  coBuyerSignature: string;
  coBuyerSignatureDate: string;
  dealerSignature: string;
  dealerSignatureDate: string;
}

export const emptySignatures: SignatureData = {
  buyerIdPhoto: '',
  buyerSignature: '',
  buyerSignatureDate: '',
  coBuyerSignature: '',
  coBuyerSignatureDate: '',
  dealerSignature: '',
  dealerSignatureDate: '',
};

// Only data/HTTP(S)/root-relative URLs can render in an <img>. Older flows
// stored status strings like "uploaded" in the same fields — callers should
// show an "on file" chip instead of a broken image in those cases.
export function isRenderableImageSrc(value?: string | null): boolean {
  const src = (value ?? '').trim();
  return /^(data:image\/|https?:\/\/|\/)/.test(src);
}
