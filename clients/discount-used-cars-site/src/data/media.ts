/**
 * Real photography.
 *
 * Every large image on the site is a named slot. Until a photograph exists,
 * the slot renders a lit studio scene instead, so nothing is ever broken or
 * borrowed. To use a photo: put the file in `public/photos/` and map the slot
 * to it here, e.g. `hero: '/photos/hero.webp'`.
 *
 * Generated images are brand and mood only (no badges, no plates, never a
 * vehicle presented as for sale). Vehicles for sale, the lot and the people
 * are Discount Used Cars and Trucks' own photos.
 */
export type PhotoSlot =
  /** The opening picture: one fixed image, landscape, subject right of centre. */
  | 'hero'
  /** Optional portrait crop of the same picture for phones. */
  | 'hero-mobile'
  /** Inner page headers: wide, subject on the right, calm left side for the title. */
  | 'inventory'
  | 'sell'
  | 'financing'
  | 'visit'
  /** Body-type cards on the home page (square). A real vehicle's photo wins when one exists. */
  | 'body-suv'
  | 'body-sedan'
  | 'body-truck'
  | 'body-coupe'
  /** The We Buy Cars band: one wide picture beside the copy, then three tiles (4:3). */
  | 'sell-band'
  | 'sell-cars'
  | 'sell-trucks'
  | 'sell-suvs'
  /** Vehicles on white beside the inventory search (transparent PNG). */
  | 'finder'
  /** The 404 page. */
  | 'not-found';

export const photos: Partial<Record<PhotoSlot, string>> = {
  // Brand images generated from the image brief (not vehicles in stock).
  hero: '/photos/hero.webp',
  'hero-mobile': '/photos/hero-mobile.webp',
  inventory: '/photos/inventory.webp',
  sell: '/photos/sell.webp',
  financing: '/photos/financing.webp',
  'not-found': '/photos/not-found.webp',
  'body-suv': '/photos/body-suv.webp',
  'body-sedan': '/photos/body-sedan.webp',
  'body-truck': '/photos/body-truck.webp',
  'body-coupe': '/photos/body-coupe.webp',
  'sell-band': '/photos/sell-band.webp',
};

/** Where each banner's subject sits, so narrow screens crop to it. */
export const photoFocus: Partial<Record<PhotoSlot, string>> = {
  inventory: '70% 62%',
  sell: '68% 50%',
  financing: '70% 58%',
  'not-found': '50% 55%',
  'body-suv': '50% 62%',
  'body-sedan': '50% 62%',
  'body-truck': '50% 62%',
  'body-coupe': '50% 62%',
  'sell-band': '45% 40%',
};

/** Where the hero photo's subject sits, so phones crop to it. */
export const heroFocus = '70% 55%';
