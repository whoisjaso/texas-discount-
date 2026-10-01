/**
 * Every fact the site prints about Discount Used Cars and Trucks, with where
 * it came from. Nothing here is invented: a fact nobody has confirmed is
 * `null` and the site leaves it out.
 *
 * TXDMV  = Independent (GDN) Motor Vehicle Dealers List, current 10/01/2026.
 * PUBLIC = the dealer's own listings (Google Business listing at 8108 Gulf
 *          Fwy, the Facebook page, the lot sign), pending the owner's
 *          confirmation.
 */
export const business = {
  // TXDMV: DBA on GDN P145000. PUBLIC: the Google listing at 8108 Gulf Fwy.
  name: 'Discount Used Cars and Trucks',
  shortName: 'Discount',
  // TXDMV: BusinessName "DISCOUNT USED CARS AND TRUCKS, LLC" (Texas SOS file 0802832466).
  legalName: 'Discount Used Cars and Trucks, LLC',
  // TXDMV: Active, Motor Vehicle (independent), expires 09/30/2027.
  dealerLicense: 'P145000',
  // PUBLIC: the Google listing at 8108 Gulf Fwy and the dealer's "713 900 50/50" sign.
  // (713) 203-3890 is the number on the TxDMV licence record.
  phoneDisplay: '(713) 900-5050',
  phoneHref: 'tel:+17139005050',
  // No number customers can text has been published or confirmed: the Text
  // buttons stay hidden until the owner names one.
  smsHref: null as string | null,
  // TXDMV + Comptroller + Google listing: 8108 Gulf Fwy, Houston, TX 77017-3620, no suite.
  street: '8108 Gulf Fwy',
  cityLine: 'Houston, TX 77017',
  // OpenStreetMap / Nominatim place name for the address.
  neighborhood: 'Park Place',
  // OpenStreetMap (southbound I-45 frontage road) + Yahoo Local cross streets.
  crossStreets: 'On the southbound Gulf Freeway feeder, between Dixie Dr & Delwood St',
  mapsHref:
    'https://www.google.com/maps/dir/?api=1&destination=Discount%20Used%20Cars%20and%20Trucks%2C%208108%20Gulf%20Fwy%2C%20Houston%2C%20TX%2077017',
  // PUBLIC: facebook.com/Discountusedcars (page id 494130167427998).
  facebookHref: 'https://www.facebook.com/Discountusedcars/',
  // PUBLIC: the Google listing at 8108 Gulf Fwy, read 10/01/2026, pending the owner's confirmation.
  hours: [
    { days: 'Monday – Friday', time: '10:00 AM – 5:00 PM' },
    { days: 'Saturday – Sunday', time: 'Closed' },
  ],
  hoursShort: 'Mon – Fri, 10 AM – 5 PM',
  opensLabel: 'Opens 10 AM',
  // Mon=1 ... Fri=5 open 10–17; Sat and Sun closed.
  openDays: [1, 2, 3, 4, 5],
  openHour: 10,
  closeHour: 17,
  // Not confirmed: the only list online sits on a directory entry shared with
  // another dealer, so none is shown until the owner supplies it.
  payments: [] as string[],
  // PUBLIC: "Se Habla Español" on the dealer's lot sign (Facebook cover photo).
  spanish: true,
  // PUBLIC: Google, 4.8 from 24 reviews on the dealer's listing before the
  // move to 8108 Gulf Fwy (same business and licence). The new listing has 1.
  rating: { score: 4.8, count: 24, note: 'Google reviews from our listing before the move to Gulf Freeway.' },
  // PUBLIC: verbatim Google reviews (author names shortened).
  reviews: [
    {
      quote:
        'Service was professional and honest. Buying a used car can be scary. These folks know how to set your mind at ease and help you make the best decision for your family.',
      author: 'Stan D.',
      source: 'Google',
    },
    {
      quote: 'I have bought 3 cars from here the easiest place to buy from no pressure and very nice and helpful',
      author: 'Brian G.',
      source: 'Google',
    },
    {
      quote: 'The buying process was smooth. Ron and the rest of the staff were professional and kind.',
      author: 'Gabyy C.',
      source: 'Google',
    },
  ] as { quote: string; author: string; source: string; translation?: string }[],
} as const;

export function isOpenNow(date = new Date()): boolean {
  // Store hours are Central Time.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  if (!(business.openDays as readonly number[]).includes(day)) return false;
  return hour >= business.openHour && hour < business.closeHour;
}
