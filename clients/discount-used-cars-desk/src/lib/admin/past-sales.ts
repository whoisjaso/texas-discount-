/**
 * Past sales, as the browser handles them: the shape, the order, the search.
 *
 * Split from the reader on purpose, and the reason is a bug rather than taste.
 * The list component is a client component, and importing the reader from it
 * pulled `createAdminDataClient`, then `next/headers`, into the browser
 * bundle. The page stopped compiling with "This API is only available in
 * Server Components". Nothing in this file may import anything that touches a
 * request.
 *
 * `past-sales-data.ts` is the other half, and it runs on the server only.
 */

export type PastSale = {
  id: string;
  /** The buyer, or a plain stand-in rather than an empty cell. */
  customer: string;
  /** Year make model, or the VIN when that is all there is. */
  vehicle: string;
  plate: string | null;
  /**
   * ISO, or null when the record does not say.
   *
   * Most sold cars on this lot carry no `date_sold`. A row is not worth
   * inventing a date for: `updated_at` is when somebody last touched the
   * record, and printing that as the day the car sold would be a wrong answer
   * given confidently. An undated sale is still a sale.
   */
  closedAt: string | null;
  /**
   * The person at the desk, by name.
   *
   * `deals.created_by` is an auth user id, which is meaningless to read. The
   * reader resolves it through `team_members.auth_user_id`, and leaves it null
   * when there is no match rather than printing a UUID at somebody.
   */
  handledBy: string | null;
  /**
   * Where the row goes.
   *
   * The packet when a deal was run, because a finished sale is a thing you go
   * looking for in order to print something out of it. The car's record when
   * it was not — which on this lot is most of them.
   */
  /** The packet, or null for a car marked sold without a deal on this desk. */
  href: string | null;
};

/**
 * The two sources of a past sale, merged into one book.
 *
 * Pure, and here rather than in the reader, so the merge can be checked
 * against the shape the live database actually holds — thirty-seven sold cars,
 * five finished deals, three of them overlapping — without a database standing
 * behind it. The reader does the querying and nothing else.
 */
export type SoldVehicleRow = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  buyer_name: string | null;
  date_sold: string | null;
};

export type PastDealRow = {
  id: string;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
  vehicle_id: string | null;
  plate: string | null;
  customerName: string | null;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
  } | null;
};

/** Year make model, or the VIN, or the honest absence of both. */
export function describeVehicle(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
} | null): string {
  if (!vehicle) return "No vehicle on file";
  const named = [vehicle.year, vehicle.make, vehicle.model]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ");
  if (named) return named;
  return vehicle.vin ? `VIN ${vehicle.vin}` : "No vehicle on file";
}

function trimmed(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

export function buildPastSales(
  sold: SoldVehicleRow[],
  deals: PastDealRow[],
  /** Auth user id to the name a person would recognise. */
  names: ReadonlyMap<string, string>,
): PastSale[] {
  // The newest deal per car, so a car re-sold twice takes the latest packet
  // rather than whichever row the query happened to return first. The reader
  // asks for deals newest first, so the first one seen is the newest.
  const dealByVehicle = new Map<string, PastDealRow>();
  for (const deal of deals) {
    if (!deal.vehicle_id) continue;
    if (!dealByVehicle.has(deal.vehicle_id)) dealByVehicle.set(deal.vehicle_id, deal);
  }

  const rows: PastSale[] = sold.map((vehicle) => {
    const deal = dealByVehicle.get(vehicle.id);
    return {
      // Keyed on the car, because the car is the sale. Two rows for one car
      // would read as two sales, and it was sold once.
      id: `vehicle:${vehicle.id}`,
      customer:
        trimmed(deal?.customerName) ??
        trimmed(vehicle.buyer_name) ??
        "No name on file",
      vehicle: describeVehicle(vehicle),
      plate: trimmed(vehicle.license_plate),
      // The car's own sale date first; a deal's completion is the next best
      // thing, and it is still a date somebody recorded.
      closedAt: vehicle.date_sold ?? deal?.completed_at ?? null,
      handledBy: deal?.created_by ? (names.get(deal.created_by) ?? null) : null,
      href: deal ? `/admin/sales/${encodeURIComponent(deal.id)}/packet` : null,
    };
  });

  // A finished deal on a car nobody marked Sold is still a sale that happened.
  const soldIds = new Set(sold.map((vehicle) => vehicle.id));
  for (const deal of deals) {
    if (deal.vehicle_id && soldIds.has(deal.vehicle_id)) continue;
    rows.push({
      id: `deal:${deal.id}`,
      customer: trimmed(deal.customerName) ?? "No name on file",
      vehicle: describeVehicle(deal.vehicle),
      plate: trimmed(deal.plate),
      closedAt: deal.completed_at ?? deal.created_at,
      handledBy: deal.created_by ? (names.get(deal.created_by) ?? null) : null,
      href: `/admin/sales/${encodeURIComponent(deal.id)}/packet`,
    });
  }

  return rows;
}

export type PastSaleOrder = "recent" | "customer" | "vehicle";

/**
 * The list in the order somebody asked for.
 *
 * Pure, and exported, so the ordering can be checked without a browser. Recent
 * is the default because the sale somebody is looking for is nearly always the
 * one that just happened.
 */
export function orderPastSales(sales: PastSale[], order: PastSaleOrder): PastSale[] {
  const sorted = [...sales];
  if (order === "customer") {
    sorted.sort((a, b) => a.customer.localeCompare(b.customer, "en", { sensitivity: "base" }));
  } else if (order === "vehicle") {
    sorted.sort((a, b) => a.vehicle.localeCompare(b.vehicle, "en", { sensitivity: "base" }));
  } else {
    // Dated sales newest first, then the undated ones in the order the reader
    // gave them. Coalescing the absent date to "" would sort identically —
    // this is spelled out because "newest" over a column that is null on most
    // rows is a question a reader will ask, and the answer is here rather
    // than inferred from a coalesce.
    sorted.sort((a, b) => {
      if (a.closedAt && b.closedAt) return b.closedAt.localeCompare(a.closedAt);
      if (a.closedAt) return -1;
      if (b.closedAt) return 1;
      return 0;
    });
  }
  return sorted;
}

/**
 * Which sales a typed query should show.
 *
 * Matches on the start of any word, which is how a person searching a name
 * expects it to behave: typing "a" brings back Austin and Alvarez, not every
 * row with an A buried in it. A plain substring match on one letter returns
 * almost everything, which is the same as returning nothing.
 *
 * The fields searched are the three a person would say out loud: who bought
 * it, what they bought, and the plate.
 */
export function searchPastSales(sales: PastSale[], query: string): PastSale[] {
  /*
    The typed text is split the same way the row is.

    It was not, and a plate typed the way it is printed found nothing:
    "TJX-4410" was one needle containing a hyphen, and no word in a haystack
    split on non-alphanumerics can start with it. The box says "Name, car, or
    plate", so that was the placeholder promising something the search could
    not do — invisible until now, because plates used to come out of a retired
    pipeline's `step_data` and almost no row had one. They come off the vehicle
    record now, and most rows do.

    Every typed word has to match, so "mya elantra" narrows rather than widens.
  */
  const needles = query.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (needles.length === 0) return sales;

  return sales.filter((sale) => {
    const words = [sale.customer, sale.vehicle, sale.plate ?? "", sale.handledBy ?? ""]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return needles.every((needle) => words.some((word) => word.startsWith(needle)));
  });
}
