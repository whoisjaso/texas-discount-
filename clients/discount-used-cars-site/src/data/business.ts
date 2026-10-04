/**
 * Every fact the site prints about Discount Used Cars and Trucks, with where
 * it came from. Nothing here is invented: a fact nobody has confirmed is
 * `null` and the site leaves it out.
 *
 * OWNER  = supplied by the dealership (its billboard artwork and texts,
 *          10/01/2026). Outranks every other source.
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
  // OWNER: confirmed by text and on the billboard artwork. Also the Google
  // listing and the "713 900 50/50" sign. (713) 203-3890 is the number on the
  // TxDMV licence record.
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
  // OWNER: the billboard artwork prints www.Discountusedcarsandtrucks.com.
  siteUrl: 'https://www.discountusedcarsandtrucks.com',
  // PUBLIC: facebook.com/Discountusedcars (page id 494130167427998).
  facebookHref: 'https://www.facebook.com/Discountusedcars/',
  // OWNER: billboard artwork, "TUES-SAT 10AM-7PM, SUN/MON CLOSED" (supersedes
  // the Google listing's Mon–Fri 10–5).
  hours: [
    { days: 'Tuesday – Saturday', time: '10:00 AM – 7:00 PM' },
    { days: 'Sunday & Monday', time: 'Closed' },
  ],
  hoursShort: 'Tue – Sat, 10 AM – 7 PM',
  opensLabel: 'Opens 10 AM',
  // Tue=2 ... Sat=6 open 10–19; Sun and Mon closed.
  openDays: [2, 3, 4, 5, 6],
  openHour: 10,
  closeHour: 19,
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
