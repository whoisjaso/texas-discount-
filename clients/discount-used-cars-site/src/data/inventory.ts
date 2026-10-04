export type BodyStyle = 'Coupe' | 'Sedan' | 'SUV' | 'Truck';

/**
 * One vehicle on the lot. Only year, make, model and body are required, so a
 * listing can be entered straight from a Facebook post: anything the post
 * doesn't say is left out and the site simply doesn't show it.
 */
export interface Vehicle {
  slug: string;
  /** Leave out when the listing does not say; the site then omits it. */
  year?: number;
  make: string;
  model: string;
  trim?: string;
  /** Leave out to show "Call for price". */
  price?: number;
  mileage?: number;
  body: BodyStyle;
  exterior?: string;
  /** Hex used to tint the studio silhouette when there is no photo. */
  paint?: string;
  interior?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  stock?: string;
  highlights?: string[];
  /** Real photos, first one is the cover. Files live in public/photos/inventory/. */
  photos?: string[];
  /** CSS object-position for the cover when cropped (e.g. "30% 55%" keeps a left-facing nose). */
  coverFocus?: string;
  featured?: boolean;
}

/** Photo paths for a vehicle whose files live in public/photos/inventory/<slug>/1.webp … n.webp. */
export const photoSet = (slug: string, n: number) =>
  Array.from({ length: n }, (_, i) => `/photos/inventory/${slug}/${i + 1}.webp`);

/**
 * Discount Used Cars and Trucks' vehicles, from the dealership's own photos
 * and posts only.
 *
 * Empty until the owner sends the current lot (Facebook collages, phone
 * photos or a DMS export): as of 10/01/2026 no current inventory is listed
 * anywhere online. Fill in only what the photos or the post show; leave out
 * year, price and miles unless stated (the site then hides the year and shows
 * "Call for price"). Never fill them in from a guess.
 */
export const inventory: Vehicle[] = [];

export function vehicleTitle(v: Vehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
}

export const currency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const miles = (n: number) => `${n.toLocaleString('en-US')} mi`;

/** The price as shown, or "Call for price" when none is posted. */
export const priceLabel = (v: Vehicle) => (v.price ? currency(v.price) : 'Call for price');

/** Mileage · drivetrain · colour, skipping whatever isn't known. */
export const metaLine = (v: Vehicle) =>
  [v.mileage ? miles(v.mileage) : null, v.drivetrain, v.exterior].filter(Boolean).join(' · ');

/** Rough monthly payment for display only. */
export function estimatePayment(price: number, down = 0.15, apr = 0.129, months = 48): number {
  const principal = price * (1 - down);
  const r = apr / 12;
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
}
