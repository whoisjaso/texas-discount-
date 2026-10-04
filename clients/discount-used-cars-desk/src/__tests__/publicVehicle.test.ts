import { describe, expect, it } from "vitest";
import {
  PUBLIC_VEHICLE_DB_COLUMNS,
  PUBLIC_VEHICLE_SELECT,
  toPublicVehicle,
  toPublicVehicles,
} from "@/lib/vehicles/public";
import type { Vehicle } from "@/types/database";

// Build a fixture with every internal field populated so a regression that
// forgets to strip any one of them is caught immediately.
function makeVehicle(): Vehicle {
  return {
    id: "v1",
    make: "Honda",
    model: "Accord",
    year: 2016,
    price: 8500,
    mileage: 92000,
    vin: "1HGCR2F52GA012345",
    status: "Available",
    description: "Clean sport trim.",
    imageUrl: "/x.jpg",
    gallery: ["/g1.jpg"],
    slug: "2016-honda-accord-sport",
    bodyStyle: "Sedan",
    exteriorColor: "Silver",
    interiorColor: "Black",
    transmission: "Automatic",
    drivetrain: "FWD",
    engine: "2.4L I4",
    fuelType: "Gasoline",
    dateAdded: "2026-01-01",
    createdAt: "2026-01-01",
    updatedAt: "2026-04-01",
    // Internal — MUST NOT leak to public payload
    trim: "Sport",
    purchasePrice: 4200,
    buyFee: 280,
    totalCost: 5390,
    sellerName: "TOYOTA FINANCIAL SERVICES",
    auctionLocation: "Manheim Dallas",
    workOrderNumber: "WO-1001",
    stockNumber: "S-1001",
    guaranteeExpiresAt: "2026-02-01",
    guaranteePrice: 150,
    transportCarrier: "ACME Transport",
    transportLoadId: "L-7",
    transportCost: 450,
    transportPickupEta: "2026-01-10",
    transportDeliveryEta: "2026-01-14",
    sourceEmailId: "email-xyz",
    conditionNotes: "Clean",
    titleType: "Clean",
    mechanicalCost: 320,
    cosmeticCost: 180,
    otherCosts: 40,
    dateListed: "2026-02-01",
    dateSold: null,
    salePrice: null,
    sellingFees: null,
    netProfit: null,
    weightLbs: 3200,
    licensePlate: null,
    buyerName: null,
    buyerPhone: null,
  buyerCustomerId: null,
  buyerIdNumber: null,
    leadSourceName: null,
    daysInStock: 60,
    targetListPrice: 8500,
    floorPrice: 7200,
  };
}

const SENSITIVE_KEYS = [
  "purchasePrice",
  "buyFee",
  "totalCost",
  "sellerName",
  "auctionLocation",
  "workOrderNumber",
  "stockNumber",
  "guaranteeExpiresAt",
  "guaranteePrice",
  "transportCarrier",
  "transportLoadId",
  "transportCost",
  "transportPickupEta",
  "transportDeliveryEta",
  "sourceEmailId",
  "mechanicalCost",
  "cosmeticCost",
  "otherCosts",
  "dateSold",
  "salePrice",
  "sellingFees",
  "netProfit",
  "weightLbs",
  "licensePlate",
  "buyerName",
  "buyerPhone",
  "leadSourceName",
  "daysInStock",
  "targetListPrice",
  "floorPrice",
  "conditionNotes",
  "id",
] as const;

describe("toPublicVehicle", () => {
  it("strips every sensitive internal field", () => {
    const publicVehicle = toPublicVehicle(makeVehicle());
    for (const key of SENSITIVE_KEYS) {
      expect(
        (publicVehicle as Record<string, unknown>)[key],
        `Sensitive field '${key}' MUST NOT be in the public payload`,
      ).toBeUndefined();
    }
  });

  it("never serializes sensitive fields in JSON", () => {
    const publicVehicle = toPublicVehicle(makeVehicle());
    const serialized = JSON.stringify(publicVehicle);
    for (const key of SENSITIVE_KEYS) {
      expect(serialized, `JSON must not contain '${key}'`).not.toContain(
        `"${key}"`,
      );
    }
    expect(serialized).not.toContain("FINANCIAL SERVICES");
    expect(serialized).not.toContain("Manheim");
  });

  it("preserves every public field the UI needs", () => {
    const publicVehicle = toPublicVehicle(makeVehicle());
    expect(publicVehicle.make).toBe("Honda");
    expect(publicVehicle.model).toBe("Accord");
    expect(publicVehicle.year).toBe(2016);
    expect(publicVehicle.price).toBe(8500);
    expect(publicVehicle.mileage).toBe(92000);
    expect(publicVehicle.vin).toBe("1HGCR2F52GA012345");
    expect(publicVehicle.slug).toBe("2016-honda-accord-sport");
    expect(publicVehicle.trim).toBe("Sport");
    expect(publicVehicle.bodyStyle).toBe("Sedan");
    expect(publicVehicle.exteriorColor).toBe("Silver");
    expect(publicVehicle.interiorColor).toBe("Black");
    expect(publicVehicle.transmission).toBe("Automatic");
    expect(publicVehicle.drivetrain).toBe("FWD");
    expect(publicVehicle.engine).toBe("2.4L I4");
    expect(publicVehicle.fuelType).toBe("Gasoline");
    expect(publicVehicle.description).toBe("Clean sport trim.");
    expect(publicVehicle.imageUrl).toBe("/x.jpg");
    expect(publicVehicle.gallery).toEqual(["/g1.jpg"]);
    expect(publicVehicle.status).toBe("Available");
  });

  it("handles arrays via toPublicVehicles", () => {
    const out = toPublicVehicles([makeVehicle(), makeVehicle()]);
    expect(out).toHaveLength(2);
    expect((out[0] as Record<string, unknown>).purchasePrice).toBeUndefined();
  });

  it("uses explicit public database columns instead of select star", () => {
    expect(PUBLIC_VEHICLE_SELECT).not.toContain("*");
    expect(PUBLIC_VEHICLE_DB_COLUMNS).not.toContain("id");
    expect(PUBLIC_VEHICLE_DB_COLUMNS).not.toContain("purchase_price");
    expect(PUBLIC_VEHICLE_DB_COLUMNS).not.toContain("buyer_phone");
    expect(PUBLIC_VEHICLE_DB_COLUMNS).not.toContain("target_list_price");
    expect(PUBLIC_VEHICLE_DB_COLUMNS).toContain("slug");
    expect(PUBLIC_VEHICLE_DB_COLUMNS).toContain("image_url");
  });
});
