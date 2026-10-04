import { DOC_FEE_CH345, centsAsDollars } from "@/lib/legal/texas-dealer-fees";

/**
 * Vehicles sold under Tex. Fin. Code ch. 345 rather than ch. 348: motorcycles,
 * mopeds, ATVs, towable RVs, boats, boat motors and boat trailers (rulebook
 * texas-dealer-fees.md 1.1). Their documentary fee has a hard maximum no
 * filing raises, $200.00 on a contract for land vehicles only or watercraft
 * only and $250.00 when one contract covers both (Fin. Code §345.251(b)-(d);
 * 7 TAC §86.201(c)-(e)), with its own notice wording, and a ch. 345 retail
 * seller charges it to cash and credit buyers alike (§345.251(b)(1)).
 *
 * Handle A Sale's paperwork is ch. 348 paperwork (its contract, its notice,
 * its $225.00 limit). So a sale whose vehicle reads as one of these refuses
 * to file a document that prints the documentary fee, rather than print a
 * ch. 348 fee and notice on a ch. 345 sale. Read off the vehicle's body
 * style, the one field the desk holds that says what kind of vehicle it is.
 *
 * Pure, safe in the browser.
 */
const CHAPTER_345_KINDS: readonly RegExp[] = [
  /\bmotor ?cycles?\b/i,
  /\bmotor ?bikes?\b/i,
  /\bdirt ?bikes?\b/i,
  /\bmopeds?\b/i,
  /\bmotor ?scooters?\b/i,
  /\bscooters?\b/i,
  /\batvs?\b/i,
  /\ball[- ]terrain\b/i,
  /\butvs?\b/i,
  /\bside[- ]by[- ]sides?\b/i,
  /\btravel trailers?\b/i,
  /\bfifth[- ]wheels?\b/i,
  /\btoy haulers?\b/i,
  /\bpop[- ]?up campers?\b/i,
  /\bcamper trailers?\b/i,
  /\btowable\b/i,
  /\bboats?\b/i,
  /\bwatercraft\b/i,
  /\bjet ?skis?\b/i,
  /\bpwc\b/i,
  /\boutboards?\b/i,
];

/** Whether a body style reads as a ch. 345 vehicle. */
export function isChapter345Vehicle(bodyStyle: string | null | undefined): boolean {
  const text = (bodyStyle ?? "").trim();
  if (!text) return false;
  return CHAPTER_345_KINDS.some((pattern) => pattern.test(text));
}

/** The documents that print the documentary fee, refused on a ch. 345 vehicle. */
export const DOC_FEE_DOCUMENTS = ["billOfSale", "salvageBillOfSale", "financing"] as const;

export const CHAPTER_345_MESSAGE = `Handle A Sale's paperwork is for cars, trucks, SUVs and vans (Tex. Fin. Code ch. 348). A motorcycle, moped, ATV, towable RV or boat is sold under ch. 345, with a documentary fee of ${centsAsDollars(DOC_FEE_CH345.maxCentsLandOnlyOrWatercraftOnly)} at most that no filing raises, and its own notice (Fin. Code §345.251; 7 TAC §86.201). Do this sale's paperwork by hand.`;
