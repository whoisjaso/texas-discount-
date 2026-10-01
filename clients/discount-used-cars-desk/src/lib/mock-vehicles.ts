import type { Vehicle, VehicleFilters } from "@/types/database";
import type { VehicleSortOption } from "@/lib/supabase/queries/vehicles";

const PIPELINE_DEFAULTS = {
  trim: null,
  purchasePrice: null,
  buyFee: null,
  totalCost: null,
  sellerName: null,
  auctionLocation: null,
  workOrderNumber: null,
  stockNumber: null,
  guaranteeExpiresAt: null,
  guaranteePrice: null,
  transportCarrier: null,
  transportLoadId: null,
  transportCost: null,
  transportPickupEta: null,
  transportDeliveryEta: null,
  sourceEmailId: null,
  conditionNotes: null,
  // Clean, so preview vehicles pass the title gate the way the real lot's
  // verified rows do; the gate itself is proven by tests, not by making the
  // demo undrivable.
  titleType: "Clean",
  mechanicalCost: null,
  cosmeticCost: null,
  otherCosts: null,
  dateListed: null,
  dateSold: null,
  salePrice: null,
  sellingFees: null,
  netProfit: null,
  weightLbs: null,
  licensePlate: null,
  buyerName: null,
  buyerPhone: null,
  buyerCustomerId: null,
  buyerIdNumber: null,
  leadSourceName: null,
  daysInStock: null,
  targetListPrice: null,
  floorPrice: null,
} as const;

const MOCK_VEHICLES: Vehicle[] = [
  {
    id: "mock-1",
    make: "Toyota",
    model: "Camry SE",
    year: 2019,
    price: 6995,
    mileage: 89432,
    vin: "4T1B11HK5KU812345",
    status: "Available",
    description:
      "Reliable and fuel-efficient sedan perfect for the daily commute. Well-maintained with clean title. Bluetooth, backup camera, and comfortable seating for the whole family.",
    imageUrl: null,
    gallery: [],
    slug: "2019-toyota-camry-se",
    bodyStyle: "Sedan",
    exteriorColor: "Silver",
    interiorColor: "Black",
    transmission: "Automatic",
    drivetrain: "FWD",
    engine: "2.5L 4-Cylinder",
    fuelType: "Gasoline",
    dateAdded: "2026-03-01T00:00:00Z",
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
    ...PIPELINE_DEFAULTS,
  },
  {
    id: "mock-2",
    make: "Honda",
    model: "CR-V EX",
    year: 2018,
    price: 7500,
    mileage: 102587,
    vin: "2HKRW2H53JH654321",
    status: "Available",
    description:
      "Spacious SUV with room for the whole familia. Sunroof, Apple CarPlay, and Honda reliability you can count on. Great condition inside and out.",
    imageUrl: null,
    gallery: [],
    slug: "2018-honda-cr-v-ex",
    bodyStyle: "SUV",
    exteriorColor: "White",
    interiorColor: "Gray",
    transmission: "CVT",
    drivetrain: "AWD",
    engine: "1.5L Turbo 4-Cylinder",
    fuelType: "Gasoline",
    dateAdded: "2026-03-02T00:00:00Z",
    createdAt: "2026-03-02T00:00:00Z",
    updatedAt: "2026-03-02T00:00:00Z",
    ...PIPELINE_DEFAULTS,
  },
  {
    id: "mock-3",
    make: "Nissan",
    model: "Altima S",
    year: 2020,
    price: 5800,
    mileage: 78915,
    vin: "1N4BL4BV1LC234567",
    status: "Available",
    description:
      "Low-mileage sedan with excellent gas mileage. Clean interior, cold A/C, and smooth ride. Perfect first car or family vehicle.",
    imageUrl: null,
    gallery: [],
    slug: "2020-nissan-altima-s",
    bodyStyle: "Sedan",
    exteriorColor: "Black",
    interiorColor: "Black",
    transmission: "CVT",
    drivetrain: "FWD",
    engine: "2.5L 4-Cylinder",
    fuelType: "Gasoline",
    dateAdded: "2026-03-03T00:00:00Z",
    createdAt: "2026-03-03T00:00:00Z",
    updatedAt: "2026-03-03T00:00:00Z",
    ...PIPELINE_DEFAULTS,
    // One unverified title on purpose, so preview mode exercises the title
    // gate: the Start Sale badge, the block, and the resolve screen's row.
    titleType: null,
  },
  {
    id: "mock-4",
    make: "Ford",
    model: "Explorer XLT",
    year: 2017,
    price: 6200,
    mileage: 118340,
    vin: "1FM5K8D82HGA98765",
    status: "Available",
    description:
      "Full-size SUV with three rows of seating, perfect for larger families. Powerful V6 engine, towing capability, and loaded with features.",
    imageUrl: null,
    gallery: [],
    slug: "2017-ford-explorer-xlt",
    bodyStyle: "SUV",
    exteriorColor: "Blue",
    interiorColor: "Tan",
    transmission: "Automatic",
    drivetrain: "4WD",
    engine: "3.5L V6",
    fuelType: "Gasoline",
    dateAdded: "2026-03-04T00:00:00Z",
    createdAt: "2026-03-04T00:00:00Z",
    updatedAt: "2026-03-04T00:00:00Z",
    ...PIPELINE_DEFAULTS,
  },
  {
    id: "mock-5",
    make: "Chevrolet",
    model: "Malibu LT",
    year: 2021,
    price: 7200,
    mileage: 64280,
    vin: "1G1ZD5ST8MF345678",
    status: "Available",
    description:
      "Nearly new sedan with low miles and a clean Carfax. Turbocharged engine, touchscreen infotainment, and advanced safety features.",
    imageUrl: null,
    gallery: [],
    slug: "2021-chevrolet-malibu-lt",
    bodyStyle: "Sedan",
    exteriorColor: "Red",
    interiorColor: "Black",
    transmission: "CVT",
    drivetrain: "FWD",
    engine: "1.5L Turbo 4-Cylinder",
    fuelType: "Gasoline",
    dateAdded: "2026-03-05T00:00:00Z",
    createdAt: "2026-03-05T00:00:00Z",
    updatedAt: "2026-03-05T00:00:00Z",
    ...PIPELINE_DEFAULTS,
  },
  {
    id: "mock-6",
    make: "Hyundai",
    model: "Tucson SEL",
    year: 2019,
    price: 5500,
    mileage: 95710,
    vin: "KM8J33A45KU567890",
    status: "Available",
    description:
      "Compact SUV with great fuel economy and a smooth ride. Heated seats, blind-spot monitoring, and plenty of cargo space.",
    imageUrl: null,
    gallery: [],
    slug: "2019-hyundai-tucson-sel",
    bodyStyle: "SUV",
    exteriorColor: "Gray",
    interiorColor: "Black",
    transmission: "Automatic",
    drivetrain: "FWD",
    engine: "2.4L 4-Cylinder",
    fuelType: "Gasoline",
    dateAdded: "2026-03-06T00:00:00Z",
    createdAt: "2026-03-06T00:00:00Z",
    updatedAt: "2026-03-06T00:00:00Z",
    ...PIPELINE_DEFAULTS,
  },
];

export function getMockVehicles(
  filters: VehicleFilters = {},
  sort: VehicleSortOption = "newest"
): Vehicle[] {
  let results = [...MOCK_VEHICLES];

  if (filters.make) {
    results = results.filter(
      (v) => v.make.toLowerCase() === filters.make!.toLowerCase()
    );
  }
  if (filters.minPrice !== undefined) {
    results = results.filter((v) => v.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    results = results.filter((v) => v.price <= filters.maxPrice!);
  }
  if (filters.minYear !== undefined) {
    results = results.filter((v) => v.year >= filters.minYear!);
  }
  if (filters.maxYear !== undefined) {
    results = results.filter((v) => v.year <= filters.maxYear!);
  }
  if (filters.bodyStyles && filters.bodyStyles.length > 0) {
    const wanted = filters.bodyStyles.map((style) => style.toLowerCase());
    results = results.filter(
      (v) => v.bodyStyle && wanted.includes(v.bodyStyle.toLowerCase()),
    );
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (v) =>
        v.make.toLowerCase().includes(term) ||
        v.model.toLowerCase().includes(term)
    );
  }

  switch (sort) {
    case "price_asc":
      results.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      results.sort((a, b) => b.price - a.price);
      break;
    case "year_desc":
      results.sort((a, b) => b.year - a.year);
      break;
    case "year_asc":
      results.sort((a, b) => a.year - b.year);
      break;
    case "mileage_asc":
      results.sort((a, b) => a.mileage - b.mileage);
      break;
    case "newest":
    default:
      results.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));
      break;
  }

  return results;
}

export function getMockVehicleBySlug(slug: string): Vehicle | null {
  return MOCK_VEHICLES.find((v) => v.slug === slug) ?? null;
}

export function getMockMakes(): string[] {
  return [...new Set(MOCK_VEHICLES.map((v) => v.make))].sort();
}

// ============================================================
// Admin mock queries (no default status filter)
// ============================================================

export function getMockAdminVehicles(
  filters: VehicleFilters = {}
): Vehicle[] {
  let results = [...MOCK_VEHICLES];

  if (filters.status) {
    results = results.filter((v) => v.status === filters.status);
  }

  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (v) =>
        v.make.toLowerCase().includes(term) ||
        v.model.toLowerCase().includes(term)
    );
  }

  // Newest first
  results.reverse();
  return results;
}

export function getMockVehicleById(id: string): Vehicle | null {
  return MOCK_VEHICLES.find((v) => v.id === id) ?? null;
}
