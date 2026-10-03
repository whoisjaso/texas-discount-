import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";
import { getPublicFeaturedVehicles, getPublicVehicleBySlug, getPublicVehicles } from "@/lib/supabase/queries/vehicles";
import { PUBLIC_VEHICLE_DB_COLUMNS } from "@/lib/vehicles/public";

const ID = "synthetic-public-view-vehicle";
const SLUG = "synthetic-current-inventory-fixture";
const client = createMockSupabaseClient();

describe("public inventory view in the isolated preview store", () => {
  beforeEach(async () => {
    resetMockWrites();
    await client.from("vehicles").insert({ id: ID, slug: SLUG, make: "Synthetic", model: "Fixture",
      status: "Available", is_rental_fleet: false, year: 2020, price: 10000, mileage: 20000,
      purchase_price: 6000, buyer_name: null, buyer_phone: null, buyer_id_number: null,
      buyer_customer_id: null, date_sold: null, sale_price: null });
  });
  afterEach(resetMockWrites);

  it("keeps public preview inventory populated with a safe projection", async () => {
    expect((await getPublicVehicles(client)).some(row => row.slug === SLUG)).toBe(true);
    expect((await getPublicFeaturedVehicles(client, 100)).some(row => row.slug === SLUG)).toBe(true);
    expect((await getPublicVehicleBySlug(client, SLUG))?.slug).toBe(SLUG);
    const { data } = await client.from("public_inventory_vehicles").select("*").eq("slug", SLUG).single();
    expect(Object.keys(data)).toEqual([...PUBLIC_VEHICLE_DB_COLUMNS]);
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("purchase_price");
  });

  it.each(["in_progress", "completed", "cancelled"])("immediately hides a %s deal without removing source rows", async status => {
    await client.from("deals").insert({ vehicle_id: ID, status });
    expect((await getPublicVehicles(client)).some(row => row.slug === SLUG)).toBe(false);
    expect(await getPublicVehicleBySlug(client, SLUG)).toBeNull();
    expect((await client.from("vehicles").select("*").eq("id", ID).single()).data?.id).toBe(ID);
    expect((await client.from("deals").select("*").eq("vehicle_id", ID)).data).toHaveLength(1);
  });

  it.each([
    { status: "Sold" }, { status: "Pending" }, { is_rental_fleet: true }, { date_sold: "2026-09-01" },
    { buyer_customer_id: "synthetic-buyer" }, { buyer_name: "Synthetic Buyer" }, { buyer_phone: "synthetic-phone" },
    { buyer_id_number: "synthetic-id" }, { sale_price: 1 },
  ])("hides fixture sale evidence or noncurrent inventory: %j", async update => {
    await client.from("vehicles").update(update).eq("id", ID);
    expect(await getPublicVehicleBySlug(client, SLUG)).toBeNull();
  });

  it("ignores blank buyer fields and zero sale price", async () => {
    await client.from("vehicles").update({ buyer_name: " \n", buyer_phone: "\t", buyer_id_number: "", sale_price: 0 }).eq("id", ID);
    expect((await getPublicVehicleBySlug(client, SLUG))?.slug).toBe(SLUG);
  });

  it("rejects writes through the public view", async () => {
    expect((await client.from("public_inventory_vehicles").update({ price: 1 }).eq("slug", SLUG)).error?.code).toBe("42501");
    expect((await client.from("public_inventory_vehicles").insert({ slug: "synthetic-forged-view-row" })).error?.code).toBe("42501");
    expect((await client.from("public_inventory_vehicles").upsert({ slug: SLUG, price: 1 })).error?.code).toBe("42501");
    expect((await client.from("public_inventory_vehicles").delete().eq("slug", SLUG)).error?.code).toBe("42501");
    expect((await client.from("vehicles").select("*").eq("id", ID).single()).data?.price).toBe(10000);
  });
});
