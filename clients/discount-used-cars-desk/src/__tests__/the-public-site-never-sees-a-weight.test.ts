import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_VEHICLE_DB_COLUMNS, toPublicVehicle } from "@/lib/vehicles/public";
import { getMockVehicles } from "@/lib/mock-vehicles";
import { makeEstimate } from "./helpers/empty-weight";

/**
 * The empty-weight record is the desk's, never the public site's.
 *
 * Who confirmed a weight and what an estimate says are internal facts, like
 * the purchase price. None of the new columns is in the public allowlist,
 * the public view, or a public vehicle's payload.
 */

const WEIGHT_COLUMNS = [
  "weight_lbs",
  "weight_source",
  "weight_reading_lbs",
  "weight_rule",
  "weight_confirmed_by",
  "weight_confirmed_by_name",
  "weight_confirmed_at",
  "weight_note",
  "weight_estimate",
  "weight_estimated_at",
];

describe("the public site", () => {
  it("does not list a weight column", () => {
    for (const column of WEIGHT_COLUMNS) {
      expect(PUBLIC_VEHICLE_DB_COLUMNS as readonly string[]).not.toContain(column);
    }
  });

  it("does not read one in its view", () => {
    const sql = readFileSync("supabase/migrations/20260926000000_discount_sale_desk.sql", "utf8");
    const view = sql.slice(sql.indexOf("create or replace view public.public_inventory_vehicles"));
    const select = view.slice(0, view.indexOf("from public.vehicles"));
    expect(select).not.toMatch(/weight/);
    const migration = readFileSync("supabase/migrations/20261002000000_vehicle_empty_weight.sql", "utf8");
    expect(migration).not.toMatch(/public_inventory_vehicles|grant /i);
  });

  it("strips the weight record from a public vehicle", () => {
    const altima = getMockVehicles().find((v) => v.model === "Altima S")!;
    expect(altima.weightSource).toBe("texas_title");
    const shown = JSON.stringify(toPublicVehicle({ ...altima, weightEstimate: makeEstimate(), weightEstimatedAt: "2026-10-02" }));
    expect(shown).not.toMatch(/weight|texas_title|Preview Fixture|EPA|3252/i);
  });
});
