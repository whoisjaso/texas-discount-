import { brand } from "@/lib/dealership-config";

/**
 * The text a client gets when they ask for their pre-approval link by phone,
 * and the sentence they agreed to in order to get it.
 *
 * Both live here together on purpose. The consent a carrier or a court asks
 * about is the wording that was actually on the screen under the button, so
 * the screen renders `SMS_CONSENT_WORDING` and the ledger stores that same
 * constant. If they lived in two files they would drift, and the record
 * would be of words nobody was ever shown.
 *
 * The message says who is texting, why, and how to stop, because those three
 * are what a carrier looks for and what a stranger's phone deserves. It is
 * written to fit one segment: a link is worth about 46 characters and the
 * rest is counted against 160.
 */

export type SmsLanguage = "en" | "es";

/**
 * The line under the two tiles. Nothing is sent until this has been read and
 * the text tile tapped.
 *
 * It names the button rather than saying "tap", because the line sits under
 * both tiles and only one of them is a text. It names the sender, because
 * consent is to be messaged by someone in particular. And it offers HELP,
 * which the Telnyx webhook answers — the two shipped together, since a
 * keyword advertised and unanswered is worse than one never offered.
 *
 * There is deliberately no checkbox. Consent needs a clear disclosure and an
 * affirmative act; a button labelled "Text it to me" directly under this
 * sentence is that act, and it states what is being agreed to. A checkbox
 * cannot be pre-ticked and still be consent, so it could only add a tap to
 * the screen where people convert without making the record any stronger.
 */
export const SMS_CONSENT_WORDING: Record<SmsLanguage, string> = {
  en:
    `Tap "Text it to me" and ${brand.short} sends one message with your link. ` +
    "Message and data rates may apply. Reply HELP for help, STOP to opt out.",
  es:
    `Toque "Por mensaje" y ${brand.short} le envia un mensaje con su enlace. ` +
    "Pueden aplicar tarifas de mensajes y datos. Responda HELP para ayuda, STOP para salir.",
};

/**
 * The line under the "Text it to me" choice on the access request screen.
 *
 * Same principle as the pre-approval wording above: the sentence the person
 * agreed to is the sentence stored against their number. This one is its own
 * constant because what is being agreed to is different. One code, now, for a
 * request they are making, rather than a link about a car.
 *
 * This is screen text, so Spanish carries its accents. The message body that
 * actually goes out (in `code-store`) deliberately does not: an accent is
 * outside GSM-7 and drops the whole text to 70 characters a segment. Two
 * different rules for two different surfaces, which is why they are not
 * shared.
 */
export const SMS_CODE_CONSENT_WORDING: Record<SmsLanguage, string> = {
  en: "Tap to get your six-digit code by text. Message and data rates may apply. Reply HELP for help, STOP to opt out.",
  es: "Toque para recibir su código de seis dígitos por mensaje. Pueden aplicar tarifas de mensajes y datos. Responda HELP para ayuda, STOP para salir.",
};

/**
 * The message.
 *
 * Spanish here avoids á, í, ó and ú, which are outside the GSM-7 alphabet
 * and would push the whole message into UCS-2, where a segment is 70
 * characters instead of 160. That is three segments and three times the
 * price for one accent, so the wording works around them rather than
 * misspelling a word to save a penny.
 */
export function preApprovalTextBody(
  language: SmsLanguage,
  input: { lender: string; url: string },
): string {
  if (language === "es") {
    return `${brand.short}: su enlace seguro con ${input.lender}. ${input.url} Responda STOP para salir.`;
  }
  return `${brand.short}: your ${input.lender} pre-approval link. ${input.url} Reply STOP to opt out.`;
}

/**
 * Characters outside the GSM-7 alphabet force UCS-2, where a segment holds
 * 70 characters rather than 160. Used by the guard that keeps the message
 * to one segment; the extended set (the handful that cost two characters)
 * is not worth modelling for a message this short.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
  "^{}\\[~]|€";

export function isGsm7(text: string): boolean {
  return [...text].every((char) => GSM7.includes(char));
}

/** How many messages the carrier will actually bill for. */
export function smsSegments(text: string): number {
  const length = [...text].length;
  if (isGsm7(text)) return length <= 160 ? 1 : Math.ceil(length / 153);
  return length <= 70 ? 1 : Math.ceil(length / 67);
}
