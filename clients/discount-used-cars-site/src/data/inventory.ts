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

const photoSet = (slug: string, n: number) =>
  Array.from({ length: n }, (_, i) => `/photos/inventory/${slug}/${i + 1}.webp`);

/**
 * Vega's real vehicles, from the dealership's own Facebook posts.
 *
 * Only what the photos show is filled in: make, model, body, colour, the
 * badges (AWD, 5.6) and the interior. Year, price and miles were not in the
 * posts, so they are left out: the site hides the year and shows "Call for
 * price" until they are supplied. Never fill them in from a guess.
 */
export const inventory: Vehicle[] = [
  {
    slug: 'gmc-terrain-awd',
    make: 'GMC', model: 'Terrain', body: 'SUV',
    exterior: 'Gray', interior: 'Black leather', drivetrain: 'AWD', paint: '#4a4d52',
    highlights: ['AWD', 'Leather seats', 'Touchscreen infotainment', 'Chrome grille'],
    photos: photoSet('gmc-terrain-awd', 6),
    coverFocus: '30% 55%',
    featured: true,
  },
  {
    slug: 'acura-rdx-awd',
    make: 'Acura', model: 'RDX', body: 'SUV',
    exterior: 'Silver', interior: 'Gray leather', drivetrain: 'AWD', paint: '#b9bcc0',
    highlights: ['AWD', 'Leather seats', 'Sunroof', 'Rear spoiler'],
    photos: photoSet('acura-rdx-awd', 6),
    featured: true,
  },
  {
    slug: 'infiniti-q70-5-6',
    make: 'INFINITI', model: 'Q70', trim: '5.6', body: 'Sedan',
    exterior: 'Brown', interior: 'Beige leather', engine: '5.6L V8', paint: '#4a3a33',
    highlights: ['5.6L V8', 'Leather seats', 'Wood trim', 'Parking sensors'],
    photos: photoSet('infiniti-q70-5-6', 5),
    coverFocus: '28% 55%',
    featured: true,
  },
];

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
