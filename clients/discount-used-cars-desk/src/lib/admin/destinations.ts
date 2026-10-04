/**
 * Every place the desk can go, named once.
 *
 * Start Here reads this to draw the new-hire directory. The command palette
 * reads the same list, so a tool cannot exist in one and be missing from the
 * other, and a route that gets renamed does not quietly rot in two places.
 *
 * `what` is the line a person reads when the name alone is not enough. It is
 * shown on Start Here, where someone is deliberately learning the product, and
 * used as search text in the palette, where someone typing "plates" should find
 * Form 130-U without knowing it is called that.
 */

export interface AdminDestination {
  label: string;
  href: string;
  what: string;
  group: string;
  /** Extra words a person might type looking for this. Never displayed. */
  also?: string[];
}

export const ADMIN_DESTINATIONS: AdminDestination[] = [
  {
    group: "Sale",
    label: "Start A Sale",
    href: "/admin/sales/new",
    what: "Pick the car, enter the buyer, and the sale exists.",
    also: ["new deal", "new sale", "begin", "paperwork"],
  },
  {
    group: "Sale",
    label: "Handle A Sale",
    href: "/admin/sales",
    what: "Every sale that is open, and the packet each one still owes.",
    also: ["open deals", "unfinished", "deals", "in progress"],
  },
  {
    group: "Sale",
    label: "Past Sales",
    href: "/admin/sales/past",
    what: "Completed sales, newest first.",
    also: ["sold", "history", "finished"],
  },
  {
    group: "Sale",
    label: "Sale Times",
    href: "/admin/sales/times",
    what: "How long each sale took, and the fair-sale median.",
    also: ["clock", "speed", "timing"],
  },
  {
    group: "Sale",
    label: "Promises",
    href: "/admin/sales/promises",
    what: "Balances promised and when they are due, soonest first.",
    also: ["balance", "owed", "due"],
  },
  {
    group: "Title",
    label: "Title Status",
    href: "/admin/inventory/title-status",
    what: "Confirm what kind of title each car on the lot has.",
    also: ["salvage", "rebuilt", "title", "brand"],
  },
  {
    group: "Account",
    label: "Your Signature",
    href: "/admin/account/signature",
    what: "The signature printed on the dealer line of every document you file.",
    also: ["sign", "signature", "dealer line"],
  },
];

/**
 * Match on the name first, then on what a person would actually type.
 *
 * The trap here is the substring. Typing "plates" matched "Templates" before it
 * matched Form 130-U, because "plates" sits inside "Templates" and a naive
 * contains-check ranked that above the synonym list. So a word has to land on a
 * word boundary to count as a name match, and a synonym that starts with what
 * you typed beats a coincidence in the middle of another word.
 */
function atWordBoundary(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  return i === 0 || /[^a-z0-9]/.test(haystack[i - 1]);
}

export function searchDestinations(
  query: string,
  destinations: AdminDestination[] = ADMIN_DESTINATIONS,
): AdminDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) return destinations;

  const scored = destinations
    .map((d) => {
      const label = d.label.toLowerCase();
      const what = d.what.toLowerCase();
      const also = (d.also ?? []).map((a) => a.toLowerCase());

      if (label.startsWith(q)) return { d, score: 0 };
      if (atWordBoundary(label, q)) return { d, score: 1 };
      if (also.some((a) => a.startsWith(q))) return { d, score: 2 };
      if (also.some((a) => atWordBoundary(a, q))) return { d, score: 3 };
      if (atWordBoundary(what, q)) return { d, score: 4 };
      if (label.includes(q)) return { d, score: 5 };
      if (what.includes(q)) return { d, score: 6 };
      return null;
    })
    .filter((x): x is { d: AdminDestination; score: number } => x !== null);

  return scored.sort((a, b) => a.score - b.score).map((x) => x.d);
}
