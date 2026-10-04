import type { SaleDetail } from "@/lib/admin/sale-desk";
import type { WeightEstimate } from "@/lib/vehicles/empty-weight/types";

/** An estimate as estimate.ts writes one: a 2019 Camry from EPA unless told otherwise. */
export function makeEstimate(
  over: Omit<Partial<WeightEstimate>, "vehicle"> & { vehicle?: Partial<WeightEstimate["vehicle"]> } = {},
): WeightEstimate {
  const { vehicle, ...rest } = over;
  return {
    v: 1,
    curbLbs: 3325,
    lowLbs: 3137,
    highLbs: 3388,
    source: "epa",
    confidence: "high",
    epa: {
      curbLbs: 3325,
      lowLbs: 3137,
      highLbs: 3388,
      etwMedian: 3625,
      etwMin: 3500,
      etwMax: 3625,
      yearUsed: 2019,
      level: "model+disp+hyb+drive",
      n: 6,
      models: ["CAMRY", "CAMRY LE/SE"],
      sourceUrls: ["https://www.epa.gov/sites/default/files/2020-10/19tstcar-2020-10-02.xlsx"],
    },
    canada: { curbLbs: 3351, lowLbs: 3296, highLbs: 3549, n: 5, models: ["CAMRY 4DR SEDAN SE/XSE/XLE"] },
    vpic: { curbLbs: 3572 },
    vehicle: {
      year: 2019,
      make: "Toyota",
      model: "Camry",
      displacementL: 2.5,
      vehicleType: "PASSENGER CAR",
      bodyClass: "Sedan/Saloon",
      gvwrClass: "1C",
      cls: "passenger",
      heavy: false,
      incomplete: false,
      from: "decode",
      ...vehicle,
    },
    table: { built: "2026-10-02", v: 1 },
    at: "2026-10-02T15:00:00.000Z",
    ...rest,
  };
}

/** A sale as getSaleDetail returns one, with the 130-U answers and vehicle facts given. */
export function makeSale(
  form130U: Record<string, string> = {},
  vehicle: Partial<NonNullable<SaleDetail["vehicle"]>> = {},
): SaleDetail {
  return {
    id: "deal-1",
    status: "in_progress",
    language: "en",
    createdAt: "2026-10-02T15:00:00.000Z",
    startedAt: null,
    completedAt: null,
    buyer: { id: "c1", name: "Maria Delgado", phone: null, email: null, idNumber: "12345678", idState: "TX", idKind: null, address: null },
    vehicle: {
      id: "v1",
      titleStatus: "clean",
      year: 2019,
      make: "Toyota",
      model: "Camry SE",
      vin: "4T1B11HK5KU812345",
      status: "Available",
      salePrice: 6995,
      bodyStyle: "Sedan",
      mileage: 89432,
      exteriorColor: "Silver",
      trim: null,
      weightLbs: null,
      ...vehicle,
    },
    documents: {},
    registration: null,
    funding: { type: "cash", lenderId: null, lenderOther: null },
    plate: null,
    plateAsked: false,
    stepData: { paperwork: { form130U } },
  } as unknown as SaleDetail;
}

/** The fields a title on the vehicle row carries. */
export const TITLE_ON_FILE = {
  weightLbs: 3300,
  weightSource: "texas_title",
  weightReadingLbs: 3252,
  weightRule: "roundUp",
  weightConfirmedByName: "Jo Smith",
  weightConfirmedAt: "2026-10-01T15:00:00.000Z",
} as const;
