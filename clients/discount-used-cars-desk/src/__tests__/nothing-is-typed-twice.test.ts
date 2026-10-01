import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { blockedBecause, readBuyerId } from "@/lib/sales/buyer-id";
import { orderPastSales, searchPastSales, type PastSale } from "@/lib/admin/past-sales";
import { getPastSales } from "@/lib/admin/past-sales-data";

/**
 * Two screens, ninety seconds apart, asking for the same address.
 *
 * The intake screen takes a name, a licence number and a mailing address, and
 * wrote all three into `capturedProfile`, which is a customer record. The
 * licence step reads `buyerId`, which is a deal record. Nothing bridged them,
 * so the second screen asked for an address the first had already been given,
 * from an empty box. Typing a customer's address twice in ninety seconds is
 * the kind of friction that makes somebody stop using the flow and go back to
 * the paper form.
 *
 * The other half of this file is the screen that did not exist: what this lot
 * has sold and who at the desk handled it.
 */

const START = readFileSync("src/lib/actions/start-sale.ts", "utf8");
const SIDEBAR = readFileSync("src/components/admin/AdminSidebar.tsx", "utf8");
const LIST = readFileSync("src/components/admin/PastSalesList.tsx", "utf8");

describe("what intake collected reaches the licence step", () => {
  it("hands the address over as a real value", () => {
    const seeded = readBuyerId({
      buyerId: { mailing: { street: "8774 Almeda Genoa Rd", city: "Houston", state: "TX", postal: "77075" } },
    });
    expect(seeded.mailing.street).toBe("8774 Almeda Genoa Rd");
    expect(seeded.mailing.postal).toBe("77075");
  });

  it("is seeded at the moment the deal is written", () => {
    expect(START).toContain("seededBuyerId");
    expect(START).toContain("splitAddress(buyerAddress)");
    expect(START).toContain("seeded.mailing = mailing");
    expect(START).toContain("seeded.licenseNumber = { read: null, confirmed: buyerIdNumber }");
  });

  it("hands over a value and not a confirmation", () => {
    /*
      The record exists to tell a filled box apart from a checked one, and
      that distinction still holds. What changed: intake now ASKS. The title
      is mailed to this address, so the buyer screen reads it back and the
      operator confirms it out loud, and that confirmation is a real one.

      So the rule is no longer "never write this flag". It is "never write it
      unless a person gave it". Asserted by requiring the write to sit behind
      the caller's own explicit confirmation rather than behind an address
      merely being present, which is what a default would look like.
    */
    const write = START.indexOf("seeded.mailingConfirmed = true");
    expect(write).toBeGreaterThan(-1);
    const guard = START.lastIndexOf("if (input.mailingConfirmed", write);
    expect(guard).toBeGreaterThan(-1);
    // Nothing between the guard and the write but the line itself.
    expect(write - guard).toBeLessThan(120);
    // And it is never derived from the address alone.
    expect(START).not.toMatch(/mailingConfirmed\s*=\s*Boolean\(buyerAddress\)/);
    const seeded = readBuyerId({
      buyerId: { mailing: { street: "8774 Almeda Genoa Rd", city: "Houston", state: "TX", postal: "77075" } },
    });
    expect(blockedBecause(seeded)).toBe("No photograph of the licence yet.");
  });

  it("writes nothing when intake collected nothing", () => {
    // A deal with no address typed must not be born holding an empty address
    // object, which would read as "somebody answered this".
    expect(START).toContain("Object.keys(seeded).length > 0");
  });
});

describe("past sales", () => {
  const sales: PastSale[] = [
    { id: "1", customer: "Austin Alvarez", vehicle: "2019 BMW 530i", plate: "ABC1234", closedAt: "2026-05-02T10:00:00.000Z", handledBy: "Jonathan", href: "/admin/sales/1/packet" },
    { id: "2", customer: "Bianca Ruiz", vehicle: "2020 Audi A4", plate: null, closedAt: "2026-06-11T10:00:00.000Z", handledBy: "Jason", href: "/admin/sales/2/packet" },
    { id: "3", customer: "Carl Nguyen", vehicle: "2018 Toyota Camry", plate: null, closedAt: "2026-01-09T10:00:00.000Z", handledBy: null, href: null },
  ];

  it("is newest first by default, because that is the one being looked for", () => {
    expect(orderPastSales(sales, "recent").map((sale) => sale.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts by customer and by vehicle", () => {
    expect(orderPastSales(sales, "customer").map((sale) => sale.customer)).toEqual([
      "Austin Alvarez",
      "Bianca Ruiz",
      "Carl Nguyen",
    ]);
    expect(orderPastSales(sales, "vehicle").map((sale) => sale.vehicle)).toEqual([
      "2018 Toyota Camry",
      "2019 BMW 530i",
      "2020 Audi A4",
    ]);
  });

  it("searches from the start of a word, not from anywhere in the row", () => {
    /*
      Typing "a" should bring back Austin and Alvarez, not every row with an a
      buried in it. A substring match on one letter returns almost everything,
      which is the same as returning nothing.
    */
    expect(searchPastSales(sales, "a").map((sale) => sale.id)).toEqual(["1", "2"]);
    expect(searchPastSales(sales, "aus").map((sale) => sale.id)).toEqual(["1"]);
    expect(searchPastSales(sales, "alv").map((sale) => sale.id)).toEqual(["1"]);
  });

  it("searches the things a person says out loud", () => {
    // Who bought it, what they bought, the plate, and who sold it.
    expect(searchPastSales(sales, "camry").map((sale) => sale.id)).toEqual(["3"]);
    expect(searchPastSales(sales, "abc1234").map((sale) => sale.id)).toEqual(["1"]);
    expect(searchPastSales(sales, "jonathan").map((sale) => sale.id)).toEqual(["1"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchPastSales(sales, "   ")).toHaveLength(3);
  });

  it("names the person, and invents nobody when it cannot", () => {
    // A row used to read "Handled by the desk" when `created_by` resolved to
    // nothing, which is an attribution the software made up. A quiet gap is
    // honest; the line appears when there is a name for it.
    expect(LIST).toContain("{sale.handledBy}");
    expect(LIST).toContain("sale.handledBy ? (");
    expect(LIST).not.toContain("Handled by the desk");
  });

  it("is everyone's book, not the signed-in person's", () => {
    // A screen showing you only your own sales answers a question nobody at a
    // two-person lot is asking.
    const reader = readFileSync("src/lib/admin/past-sales-data.ts", "utf8");
    expect(reader).not.toContain("auth.getUser");
    expect(reader).toContain('.neq("status", "in_progress")');
  });

  it("keeps the server client out of the browser bundle", () => {
    /*
      Found by walking it, not by reading it. The list is a client component,
      and importing the reader from it pulled `createAdminDataClient` and then
      `next/headers` into the browser bundle: "This API is only available in
      Server Components". So the sorting and the searching live in a module
      that imports nothing, and the reader lives beside it.
    */
    const view = readFileSync("src/lib/admin/past-sales.ts", "utf8");
    // Anchored to an import statement rather than to the word. Three guards in
    // this codebase have now failed on their own explanatory comments; a
    // "this file must not contain X" check has to match syntax, not prose.
    expect(view).not.toMatch(/^import /m);
    expect(LIST).toContain('from "@/lib/admin/past-sales"');
    expect(LIST).not.toContain("past-sales-data");
  });

  it("opens the packet when there is one, and the car's record when there is not", () => {
    /*
      Still the packet, because a finished sale is a thing you go looking for
      in order to print something out of it. But the list is sourced from sold
      cars now, and on the live database only three of thirty-seven sold cars
      have a deal behind them. A row that linked to a packet that does not
      exist would be a door onto nothing, so the reader decides the target and
      the row renders it.
    */
    const merge = readFileSync("src/lib/admin/past-sales.ts", "utf8");
    expect(merge).toContain("/admin/sales/${encodeURIComponent(deal.id)}/packet");
    // A sold car with no deal on this desk is not a link (there is no inventory screen).
    expect(merge).toContain("href: deal ? `/admin/sales/${encodeURIComponent(deal.id)}/packet` : null");
    expect(LIST).toContain("href={sale.href}");
  });

  it("sits next to Sale in the navigation", () => {
    // The two halves of one question, asked in that order: what is open, then
    // what is done.
    const primary = SIDEBAR.slice(SIDEBAR.indexOf("const PRIMARY"), SIDEBAR.indexOf("const SECONDARY"));
    expect(primary).toContain('label: "Past Sales"');
    // The rail says "Handle A Sale" now. This compared against 'label: "Sale"',
    // which stopped existing when it was renamed — indexOf returned -1 and the
    // assertion passed wherever Past Sales happened to sit. Both indexes are
    // asserted present before they are compared.
    const sale = primary.indexOf('label: "Handle A Sale"');
    const past = primary.indexOf('label: "Past Sales"');
    expect(sale).toBeGreaterThan(-1);
    expect(past).toBeGreaterThan(-1);
    expect(past).toBeGreaterThan(sale);
  });

  it("states its job and does not explain itself", () => {
    /*
      DESIGN.md's rule for an operate screen is zero explanatory prose. This
      page carried "Every finished sale, and who handled it.", which is a
      sentence describing what the rows underneath already say. The count
      replaced it: a count is data and earns its place.
    */
    const page = readFileSync("src/app/admin/sales/past/page.tsx", "utf8");
    expect(page).not.toContain("Every finished sale");
    expect(page).toContain('{sales.length === 1 ? "sale" : "sales"}');
  });

  it("has a hierarchy rather than four fields of the same size", () => {
    // The first cut had the name, the car, the date and the handler at
    // nearly one size and colour, so the eye had nothing to run down.
    const css = readFileSync("src/app/globals.css", "utf8");
    const title = css.slice(css.indexOf(".ed-past-title {"), css.indexOf(".ed-past-count {"));
    expect(title).toMatch(/font-size: clamp\(34px/);
    const who = css.slice(css.indexOf(".ed-past-who {"), css.indexOf(".ed-past-what {"));
    expect(who).toMatch(/font-size: clamp\(19px/);
    // The date is ink and the handler under it is muted, so they stop
    // competing.
    const when = css.slice(css.indexOf(".ed-past-when {"), css.indexOf(".ed-past-by {"));
    expect(when).toContain("var(--tj-ink)");
  });

  it("moves, and stops moving when asked to", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("@keyframes ed-past-arrive");
    // Tailwind v4 writes the individual properties, and mixing them with a
    // combined `transform` silently drops one. CLAUDE.md records this.
    const lit = css.slice(css.indexOf(".ed-past-lit {"), css.indexOf(".ed-past-order {"));
    expect(lit).toMatch(/^\s*translate:/m);
    // Anchored to a declaration rather than the word. This is the fourth
    // guard in this codebase to fail on its own explanatory comment; a
    // "must not contain" check has to match syntax, not prose.
    expect(lit).not.toMatch(/^\s*transform:/m);
    // Reduced motion turns the entrance off without leaving the rows at
    // opacity zero, which would hide the list from the people who asked for
    // less movement.
    const quiet = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {", css.indexOf(".ed-past-go {")));
    expect(quiet.slice(0, 400)).toContain("animation: none");
    expect(quiet.slice(0, 400)).toContain("opacity: 1");
  });

  it("replays the entrance when the filter changes, and caps the stagger", () => {
    // Remounting on the query and the order is what makes a search read as
    // the list rearranging itself. Past a dozen rows a stagger stops being
    // rhythm and starts being a wait.
    expect(LIST).toContain("key={`${order}:${query}`}");
    expect(LIST).toContain("Math.min(index, STAGGER_ROWS)");
  });

  it("reads without a browser", async () => {
    // An instrument worth trusting has to run. This uses the preview client,
    // which is what the local walk uses.
    const rows = await getPastSales();
    expect(Array.isArray(rows)).toBe(true);
  });
});
