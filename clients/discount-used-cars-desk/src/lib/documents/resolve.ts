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
 * ## The empty weight is resolved elsewhere, and never silently
 *
 * Box 11 was once filled from NHTSA's curb weight as if it were a fact about
 * this car, which was a mistake: it is a figure for the model in general and
 * vPIC's often reads the heaviest version. It now lives in
 * `vehicles/empty-weight/`, under the same rules as this file plus one more:
 * every figure carries its source. A document figure on the vehicle (a
 * title, an MCO, a weight certificate) is box 11 and skips the question; an
 * estimate (EPA test weight less 300 lb, Transport Canada, the decode) is
 * shown with its source and becomes box 11 only when a person confirms it;
 * with neither, the question is asked as it always was.
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
/**
 * The county a mailing address is in, by the address alone: the county the
 * intake typed, else the one the street geocodes to. Never the county the
 * city implies, which is a guess the 130-U's screen offers but does not file
 * (deal-facts.ts, countyOfResidence). Empty when neither answers.
 */
export async function resolveCountyByAddress(mailing: {
  county?: string | null;
  city?: string | null;
  street?: string | null;
  state?: string | null;
}): Promise<string> {
  const typed = (mailing.county ?? "").trim();
  if (typed) return typed;
  const street = (mailing.street ?? "").trim();
  if (!looksLikeAStreet(street)) return "";
  try {
    const found = await completeAddress(street, (mailing.city ?? "").trim(), (mailing.state ?? "").trim());
    return found?.county ?? "";
  } catch {
    return "";
  }
}

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
