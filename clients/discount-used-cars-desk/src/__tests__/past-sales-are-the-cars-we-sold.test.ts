import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPastSales,
  orderPastSales,
  searchPastSales,
  type PastDealRow,
  type SoldVehicleRow,
} from "@/lib/admin/past-sales";

/**
 * Past Sales was reading the wrong table.
 *
 * On the live database: 37 vehicles marked Sold, 30 of them carrying the
 * buyer's name — and 5 finished deals, only 3 of which are on a sold car. The
 * screen read `deals` alone, so a page headed "Past Sales" said "5 sales" and
 * omitted 34 cars this lot had actually sold. The answer to "who bought that
 * car" was still in somebody's memory, which is the one thing the screen
 * exists to fix.
 */

const reader = readFileSync(
  join(process.cwd(), "src/lib/admin/past-sales-data.ts"),
  "utf8",
);
const list = readFileSync(
  join(process.cwd(), "src/components/admin/PastSalesList.tsx"),
  "utf8",
);

function car(over: Partial<SoldVehicleRow> = {}): SoldVehicleRow {
  return {
    id: "v1",
    year: 2019,
    make: "Nissan",
    model: "Altima",
    vin: "1N4BL4BV0KC000000",
    license_plate: "TJX-1001",
    buyer_name: "Israel Garza Jr",
    date_sold: null,
    ...over,
  };
}

function deal(over: Partial<PastDealRow> = {}): PastDealRow {
  return {
    id: "d1",
    created_at: "2026-05-01T00:00:00Z",
    completed_at: "2026-05-04T00:00:00Z",
    created_by: "auth-1",
    vehicle_id: "v1",
    plate: null,
    customerName: "Israel Garza Jr",
    vehicle: { year: 2019, make: "Nissan", model: "Altima", vin: null },
    ...over,
  };
}

const names = new Map([["auth-1", "Jason"]]);

describe("a sold car is a past sale, deal or no deal", () => {
  it("lists the cars the deal flow never touched", () => {
    // The shape that was on the live database when this was written.
    const sold = Array.from({ length: 37 }, (_, n) =>
      car({ id: `v${n}`, license_plate: `TJX-${1000 + n}` }),
    );
    const deals = [
      deal({ id: "d1", vehicle_id: "v0" }),
      deal({ id: "d2", vehicle_id: "v1" }),
      deal({ id: "d3", vehicle_id: "v2" }),
      // Two finished deals on cars nobody marked Sold.
      deal({ id: "d4", vehicle_id: "vX" }),
      deal({ id: "d5", vehicle_id: null }),
    ];

    const rows = buildPastSales(sold, deals, names);

    // 37 cars + the 2 sales whose car was never marked Sold. Not 5.
    expect(rows).toHaveLength(39);
  });

  it("never lists one car twice", () => {
    const rows = buildPastSales([car({ id: "v1" })], [deal({ vehicle_id: "v1" })], names);

    expect(rows).toHaveLength(1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
  });

  it("keeps a finished sale whose car was never marked Sold", () => {
    const rows = buildPastSales([], [deal({ id: "d9", vehicle_id: "vGone" })], names);

    expect(rows).toHaveLength(1);
    expect(rows[0].href).toBe("/admin/sales/d9/packet");
  });
});

describe("where a row goes", () => {
  it("opens the packet when a deal was run", () => {
    const rows = buildPastSales([car({ id: "v1" })], [deal({ id: "d7", vehicle_id: "v1" })], names);
    expect(rows[0].href).toBe("/admin/sales/d7/packet");
  });

  it("opens the car's record when one was not", () => {
    // Most sales on this lot. A link to a packet that does not exist would be
    // a door onto nothing.
    const rows = buildPastSales([car({ id: "v5" })], [], names);
    expect(rows[0].href).toBeNull();
  });
});

describe("what a row says, and what it refuses to say", () => {
  it("takes the buyer from the car when there is no deal", () => {
    const rows = buildPastSales([car({ buyer_name: "Mya Hassan" })], [], names);
    expect(rows[0].customer).toBe("Mya Hassan");
  });

  it("prefers the deal's customer, which is the record that was signed", () => {
    const rows = buildPastSales(
      [car({ id: "v1", buyer_name: "typo in the lot sheet" })],
      [deal({ vehicle_id: "v1", customerName: "Fernando Galeano" })],
      names,
    );
    expect(rows[0].customer).toBe("Fernando Galeano");
  });

  it("says no name rather than an empty cell", () => {
    const rows = buildPastSales([car({ buyer_name: "   " })], [], names);
    expect(rows[0].customer).toBe("No name on file");
  });

  it("leaves the date null rather than inventing one", () => {
    // 33 of the 37 sold cars carry no date_sold. `updated_at` is when somebody
    // last touched the row, and printing it as the day the car sold would be a
    // wrong answer given confidently.
    const rows = buildPastSales([car({ date_sold: null })], [], names);
    expect(rows[0].closedAt).toBeNull();
    // And the row renders nothing rather than an empty date.
    expect(list).toContain("{sale.closedAt ? (");
  });

  it("falls back to the deal's completion, which is a date somebody recorded", () => {
    const rows = buildPastSales(
      [car({ id: "v1", date_sold: null })],
      [deal({ vehicle_id: "v1", completed_at: "2026-05-04T00:00:00Z" })],
      names,
    );
    expect(rows[0].closedAt).toBe("2026-05-04T00:00:00Z");
  });

  it("names who handled it only when a deal says so", () => {
    expect(buildPastSales([car({ id: "v1" })], [deal({ vehicle_id: "v1" })], names)[0].handledBy)
      .toBe("Jason");
    expect(buildPastSales([car({ id: "v2" })], [], names)[0].handledBy).toBeNull();
    // An unresolvable author is a gap, not a UUID printed at somebody.
    expect(
      buildPastSales([car({ id: "v3" })], [deal({ vehicle_id: "v3", created_by: "ghost" })], names)[0]
        .handledBy,
    ).toBeNull();
  });
});

describe("an undated sale still sorts somewhere sensible", () => {
  it("puts dated sales first and leaves the rest in the reader's order", () => {
    const rows = buildPastSales(
      [
        car({ id: "v1", date_sold: null, buyer_name: "First undated" }),
        car({ id: "v2", date_sold: "2026-06-01", buyer_name: "Dated" }),
        car({ id: "v3", date_sold: null, buyer_name: "Second undated" }),
      ],
      [],
      names,
    );

    const ordered = orderPastSales(rows, "recent");

    expect(ordered.map((r) => r.customer)).toEqual([
      "Dated",
      "First undated",
      "Second undated",
    ]);
  });
});

describe("search still finds a car with no deal behind it", () => {
  it("matches on the plate the vehicle record carries", () => {
    const rows = buildPastSales([car({ license_plate: "TJX-1001" })], [], names);
    expect(searchPastSales(rows, "TJX")).toHaveLength(1);
  });

  it("finds a plate typed the way it is printed, hyphen and all", () => {
    // The box says "Name, car, or plate". Typing the plate off the car
    // returned nothing: the needle held a hyphen, and no word in a haystack
    // split on non-alphanumerics can start with one.
    const rows = buildPastSales([car({ license_plate: "TJX-4410" })], [], names);
    expect(searchPastSales(rows, "TJX-4410")).toHaveLength(1);
    expect(searchPastSales(rows, "tjx-4410")).toHaveLength(1);
  });

  it("narrows on a second word rather than widening", () => {
    const rows = buildPastSales(
      [
        car({ id: "v1", buyer_name: "Mya Hassan", make: "Hyundai", model: "Elantra" }),
        car({ id: "v2", buyer_name: "Mya Torres", make: "Nissan", model: "Altima" }),
      ],
      [],
      names,
    );

    expect(searchPastSales(rows, "mya")).toHaveLength(2);
    expect(searchPastSales(rows, "mya elantra")).toHaveLength(1);
  });

  it("treats whitespace and punctuation alone as no query at all", () => {
    const rows = buildPastSales([car(), car({ id: "v2" })], [], names);
    expect(searchPastSales(rows, "   ")).toHaveLength(2);
    expect(searchPastSales(rows, " - ")).toHaveLength(2);
  });
});

describe("the reader asks for both, and nothing more", () => {
  it("queries sold vehicles alongside finished deals", () => {
    expect(reader).toContain('.eq("status", "Sold")');
    expect(reader).toContain('.neq("status", "in_progress")');
    expect(reader).toContain("buildPastSales(sold, deals, names)");
  });

  it("keeps the merge out of the reader, so it can be checked without a database", () => {
    // The merge is pure and lives in the browser-safe module. The reader does
    // the asking and nothing else.
    expect(reader).not.toMatch(/^\s*const rows: PastSale\[\] = sold\.map/m);
  });
});
