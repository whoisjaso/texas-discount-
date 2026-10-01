import { completeAddress } from "@/lib/actions/address-complete";
import { texasCountyForCity } from "@/lib/sales/paperwork";
import { looksLikeAStreet } from "@/lib/admin/address-lookup";

/**
 * The lookup a document corridor does instead of asking.
 *
 * `paperwork.ts` defaults the county from a table of this metro's cities, and
 * that table gives up quietly: it covers the big cities and this lot's own
 * metro, "not all 254 counties", and its own comment says a city it does not
 * know "is simply asked, exactly as before". That is every buyer from a
 * smaller town typing field 19 by hand.
 *
 * So when the deal cannot answer, this asks a machine rather than a person.
 * The Census geocoder is not new here either: it is the same free, keyless,
 * government file the intake screen has completed addresses against for
 * months. What is new is that the corridor reaches for it.
 *
 * ## The empty weight is deliberately not here
 *
 * Box 11 was briefly resolved from NHTSA's curb weight, which was a mistake.
 * Curb weight is a manufacturer's figure for the model in general; the empty
 * weight is read off the door jamb or the old title of THIS vehicle, which is
 * what SALE_PROCESS_DESIGN.md has always said and what the dealership works
 * from. The vehicle row still supplies it when it holds one, straight through
 * `paperworkDefault`, and otherwise the question is asked.
 *
 * ## Rules this keeps
 *
 *   ask only when needed   a deal that already answers costs no request. The
 *                          need is checked before the network, not after.
 *   silent on failure      a timeout, an outage or an unexpected shape all
 *                          come back as "nothing learned", and the question is
 *                          asked exactly as it is asked today. A lookup must
 *                          never be the reason somebody cannot finish a sale.
 *   never overrule a person what the desk typed wins. It is consulted only
 *                          where the answer is missing.
 */

/**
 * The county this buyer's address sits in.
 *
 * In order: what somebody already typed, then the city table, then the
 * geocoder. The order matters and is the same one `paperworkDefault` uses. A
 * buyer who lives over a county line from their post town has already been a
 * real bug here, and a typed answer outranks both lookups for exactly that
 * reason.
 */
export async function resolveCounty(mailing: {
  county?: string | null;
  city?: string | null;
  street?: string | null;
  state?: string | null;
}): Promise<string> {
  const typed = (mailing.county ?? "").trim();
  if (typed) return typed;

  const city = (mailing.city ?? "").trim();
  const fromTable = texasCountyForCity(city);
  if (fromTable) return fromTable;

  const street = (mailing.street ?? "").trim();
  if (!looksLikeAStreet(street)) return "";

  try {
    const found = await completeAddress(street, city, (mailing.state ?? "").trim());
    return found?.county ?? "";
  } catch {
    return "";
  }
}
