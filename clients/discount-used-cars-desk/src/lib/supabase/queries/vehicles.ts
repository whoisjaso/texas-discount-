import { SupabaseClient } from "@supabase/supabase-js";
import {
  Vehicle,
  VehicleRow,
  VehicleInsert,
  VehicleFilters,
  mapVehicleRow,
} from "@/types/database";
import {
  mapPublicVehicleRow,
  PUBLIC_VEHICLE_SELECT,
  type PublicVehicle,
  type PublicVehicleRow,
} from "@/lib/vehicles/public";
import { applyAlphabeticalOrder } from "@/lib/vehicles/ordering";

export type VehicleSortOption =
  | "alphabetical"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "year_asc"
  | "mileage_asc";

function applyVehicleSort<Query extends {
  order: (column: string, options: { ascending: boolean }) => Query;
}>(
  query: Query,
  sort: VehicleSortOption,
): Query {
  // Every sort falls back to alphabetical, so a list never shuffles between
  // loads when two cars share a price, a year or a mileage.
  switch (sort) {
    case "price_asc":
      return applyAlphabeticalOrder(query.order("price", { ascending: true }));
    case "price_desc":
      return applyAlphabeticalOrder(query.order("price", { ascending: false }));
    case "year_desc":
      return applyAlphabeticalOrder(query.order("year", { ascending: false }));
    case "year_asc":
      return applyAlphabeticalOrder(query.order("year", { ascending: true }));
    case "mileage_asc":
      return applyAlphabeticalOrder(query.order("mileage", { ascending: true }));
    case "alphabetical":
    case "newest":
    default:
      return applyAlphabeticalOrder(query);
  }
}

export async function getPublicVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {},
  sort: VehicleSortOption = "alphabetical",
): Promise<PublicVehicle[]> {
  let query = client.from("public_inventory_vehicles").select(PUBLIC_VEHICLE_SELECT);
  query = applyVehicleSort(query, sort);

  const status = filters.status ?? "Available";
  query = query.eq("status", status);

  if (filters.make) {
    query = query.ilike("make", filters.make);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("price", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("price", filters.maxPrice);
  }

  if (filters.minYear !== undefined) {
    query = query.gte("year", filters.minYear);
  }

  if (filters.maxYear !== undefined) {
    query = query.lte("year", filters.maxYear);
  }

  if (filters.bodyStyles && filters.bodyStyles.length > 0) {
    // `or` with ilike keeps the match case-insensitive, so a link built from a
    // display label still finds rows however the value was cased on entry.
    query = query.or(
      filters.bodyStyles
        .map((style) => `body_style.ilike.${style.replace(/[,()]/g, "")}`)
        .join(","),
    );
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as PublicVehicleRow[]).map(mapPublicVehicleRow);
}

export async function getPublicVehicleBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<PublicVehicle | null> {
  const { data, error } = await client
    .from("public_inventory_vehicles")
    .select(PUBLIC_VEHICLE_SELECT)
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return mapPublicVehicleRow(data as unknown as PublicVehicleRow);
}

export async function getPublicFeaturedVehicles(
  client: SupabaseClient,
  limit: number = 6,
): Promise<PublicVehicle[]> {
  const { data, error } = await client
    .from("public_inventory_vehicles")
    .select(PUBLIC_VEHICLE_SELECT)
    .eq("status", "Available")
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data as unknown as PublicVehicleRow[]).map(mapPublicVehicleRow);
}

export async function getVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {},
  sort: VehicleSortOption = "alphabetical"
): Promise<Vehicle[]> {
  let query = client.from("vehicles").select("*");
  query = applyVehicleSort(query, sort);

  // Default to available vehicles
  const status = filters.status ?? "Available";
  query = query.eq("status", status);

  if (filters.make) {
    query = query.ilike("make", filters.make);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("price", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("price", filters.maxPrice);
  }

  if (filters.minYear !== undefined) {
    query = query.gte("year", filters.minYear);
  }

  if (filters.maxYear !== undefined) {
    query = query.lte("year", filters.maxYear);
  }

  if (filters.bodyStyles && filters.bodyStyles.length > 0) {
    // `or` with ilike keeps the match case-insensitive, so a link built from a
    // display label still finds rows however the value was cased on entry.
    query = query.or(
      filters.bodyStyles
        .map((style) => `body_style.ilike.${style.replace(/[,()]/g, "")}`)
        .join(","),
    );
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term}`);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data as VehicleRow[]).map(mapVehicleRow);
}

export async function getVehicleBySlug(
  client: SupabaseClient,
  slug: string
): Promise<Vehicle | null> {
  const { data, error } = await client
    .from("vehicles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // no rows
    throw error;
  }

  return mapVehicleRow(data as VehicleRow);
}

export async function getFeaturedVehicles(
  client: SupabaseClient,
  limit: number = 6
): Promise<Vehicle[]> {
  const { data, error } = await client
    .from("vehicles")
    .select("*")
    .eq("status", "Available")
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data as VehicleRow[]).map(mapVehicleRow);
}

// ============================================================
// Admin queries (no default status filter)
// ============================================================

export async function getAdminVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {}
): Promise<Vehicle[]> {
  let query = client
    .from("vehicles")
    .select("*")
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .order("year", { ascending: true });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.bodyStyles && filters.bodyStyles.length > 0) {
    // `or` with ilike keeps the match case-insensitive, so a link built from a
    // display label still finds rows however the value was cased on entry.
    query = query.or(
      filters.bodyStyles
        .map((style) => `body_style.ilike.${style.replace(/[,()]/g, "")}`)
        .join(","),
    );
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as VehicleRow[]).map(mapVehicleRow);
}

export async function getDealershipVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {}
): Promise<Vehicle[]> {
  let query = client
    .from("vehicles")
    .select("*")
    .or("is_rental_fleet.is.null,is_rental_fleet.eq.false")
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .order("year", { ascending: true });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term},vin.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as VehicleRow[]).map(mapVehicleRow);
}

export async function getRentalFleetVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {}
): Promise<Vehicle[]> {
  let query = client
    .from("vehicles")
    .select("*")
    .eq("is_rental_fleet", true)
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .order("year", { ascending: true });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term},vin.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as VehicleRow[]).map(mapVehicleRow);
}

export async function getVehicleById(
  client: SupabaseClient,
  id: string
): Promise<Vehicle | null> {
  const { data, error } = await client
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return mapVehicleRow(data as VehicleRow);
}

export async function adminCreateVehicle(
  client: SupabaseClient,
  data: VehicleInsert
): Promise<Vehicle> {
  const { data: row, error } = await client
    .from("vehicles")
    .insert(data)
    .select()
    .single();

  if (error) throw error;

  return mapVehicleRow(row as VehicleRow);
}

export async function adminUpdateVehicle(
  client: SupabaseClient,
  id: string,
  data: Partial<VehicleInsert>
): Promise<Vehicle> {
  const { data: row, error } = await client
    .from("vehicles")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return mapVehicleRow(row as VehicleRow);
}

export async function adminDeleteVehicle(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await client.from("vehicles").delete().eq("id", id);

  if (error) throw error;
}
