import type { Vehicle, VehicleStatus } from "@/types/database";

// Fields safe to expose on the public marketing site.
// Anything NOT in this list must stay server-side - this includes Jason's
// sourcing data (auction seller, location), cost math (purchase price, buy
// fees, transport cost, mechanical/cosmetic rehab), margin fields (target
// list price, floor price, net profit), buyer PII, and internal IDs.
const PUBLIC_VEHICLE_KEYS = [
  "make",
  "model",
  "year",
  "price",
  "mileage",
  "vin",
  "status",
  "description",
  "imageUrl",
  "gallery",
  "slug",
  "bodyStyle",
  "exteriorColor",
  "interiorColor",
  "transmission",
  "drivetrain",
  "engine",
  "fuelType",
  "trim",
  "titleType",
  "carfaxUrl",
  "dateAdded",
  "dateListed",
  "createdAt",
  "updatedAt",
] as const satisfies ReadonlyArray<keyof Vehicle>;

export type PublicVehicle = Pick<Vehicle, (typeof PUBLIC_VEHICLE_KEYS)[number]>;

export const PUBLIC_VEHICLE_DB_COLUMNS = [
  "make",
  "model",
  "year",
  "price",
  "mileage",
  "vin",
  "status",
  "description",
  "image_url",
  "gallery",
  "slug",
  "body_style",
  "exterior_color",
  "interior_color",
  "transmission",
  "drivetrain",
  "engine",
  "fuel_type",
  "trim",
  "title_type",
  "carfax_url",
  "date_added",
  "date_listed",
  "created_at",
  "updated_at",
] as const;

export const PUBLIC_VEHICLE_SELECT = PUBLIC_VEHICLE_DB_COLUMNS.join(",");

export type PublicVehicleRow = {
  make: string;
  model: string;
  year: number;
  price: number | string;
  mileage: number;
  vin: string;
  status: VehicleStatus;
  description: string | null;
  image_url: string | null;
  gallery: string[] | null;
  slug: string;
  body_style: string | null;
  exterior_color: string | null;
  interior_color: string | null;
  transmission: string | null;
  drivetrain: string | null;
  engine: string | null;
  fuel_type: string | null;
  trim: string | null;
  title_type: string | null;
  carfax_url?: string | null;
  date_added: string;
  date_listed?: string | null;
  created_at: string;
  updated_at: string;
};

export function mapPublicVehicleRow(row: PublicVehicleRow): PublicVehicle {
  return {
    make: row.make,
    model: row.model,
    year: row.year,
    price: Number(row.price),
    mileage: row.mileage,
    vin: row.vin,
    status: row.status,
    description: row.description,
    imageUrl: row.image_url,
    gallery: row.gallery ?? [],
    slug: row.slug,
    bodyStyle: row.body_style,
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    transmission: row.transmission,
    drivetrain: row.drivetrain,
    engine: row.engine,
    fuelType: row.fuel_type,
    trim: row.trim,
    titleType: row.title_type,
    carfaxUrl: row.carfax_url ?? null,
    dateAdded: row.date_added,
    dateListed: row.date_listed ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicVehicle(vehicle: Vehicle): PublicVehicle {
  const out = {} as PublicVehicle;
  for (const key of PUBLIC_VEHICLE_KEYS) {
    // Cast is safe - we statically constrain keys to `keyof Vehicle`.
    (out as Record<string, unknown>)[key] = vehicle[key];
  }
  return out;
}

export function toPublicVehicles(vehicles: Vehicle[]): PublicVehicle[] {
  return vehicles.map(toPublicVehicle);
}
