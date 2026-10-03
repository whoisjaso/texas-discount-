"use server";

import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import {
  censusRequest,
  looksLikeAStreet,
  readCensusMatch,
  type CompletedAddress,
} from "@/lib/admin/address-lookup";

/**
 * The rest of the address, from the street line the desk typed.
 *
 * Behind the admin session like every other action here. The reasoning about
 * which door to knock on and which answers to refuse lives in
 * `@/lib/admin/address-lookup`, where it can be tested without a network; this
 * file is the network and nothing else.
 *
 * It fails silent, always. A field that completes itself is a convenience, and
 * a convenience must never be the reason somebody cannot finish a sale: a
 * timeout, an outage, a shape nobody expected all come back as null, and the
 * desk types the four boxes exactly as it does today.
 */

/** Long enough to answer, short enough that nobody watches it. */
const TIMEOUT_MS = 2500;

export async function completeAddress(
  street: string,
  city: string,
  state: string,
): Promise<CompletedAddress | null> {
  if (!looksLikeAStreet(street)) return null;

  const access = await getCurrentAdminAccess();
  if (!access?.user) return null;

  try {
    const { url, params } = censusRequest(street, city, state);
    const query = new URLSearchParams(params).toString();

    const response = await fetch(`${url}?${query}`, {
      // A public reference file, and the same street answers the same way for
      // everybody, so there is nothing here to keep private per session.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;

    return readCensusMatch(await response.json(), state);
  } catch {
    return null;
  }
}
