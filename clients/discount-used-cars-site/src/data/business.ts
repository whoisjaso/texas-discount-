// Verified public business details (Facebook page, Google/Birdeye, MapQuest, Waze).
export const business = {
  name: "Vega's Auto Sales & Glass Co.",
  shortName: "Vega's",
  // TxDMV Independent (GDN) Motor Vehicle Dealers List, current 09/26/2026.
  legalName: "Constantino Vega DBA Vega's Auto Sales",
  dealerLicense: 'P113248',
  phoneDisplay: '(713) 941-1622',
  phoneHref: 'tel:+17139411622',
  smsHref: 'sms:+17139411622',
  street: '7722 Galveston Rd',
  cityLine: 'Houston, TX 77034',
  neighborhood: 'Edgebrook',
  crossStreets: 'Between Metz St & Coronation Dr',
  mapsHref:
    'https://www.google.com/maps/dir/?api=1&destination=Vega%27s%20Auto%20Sales%20%26%20Glass%20Co%207722%20Galveston%20Rd%2C%20Houston%2C%20TX%2077034',
  facebookHref: 'https://www.facebook.com/profile.php?id=100064755109997',
  hours: [
    { days: 'Monday – Saturday', time: '9:00 AM – 6:00 PM' },
    { days: 'Sunday', time: 'Closed' },
  ],
  // Mon=1 ... Sat=6 open 9–18; Sun=0 closed.
  openHour: 9,
  closeHour: 18,
  payments: ['Cash', 'Visa', 'Discover', 'American Express'],
  rating: { score: 4.1, count: 40, fiveStar: 23 },
  reviews: [
    {
      quote: 'Good vehicles, reasonable payments, and easy credit!',
      author: 'Steve S.',
      source: 'Facebook',
    },
    {
      quote: 'Muy buen servicio, tienen mucha variedad de autos y precios.',
      translation: 'Great service, with a wide variety of cars and prices.',
      author: 'Danays G.',
      source: 'Google',
    },
  ],
} as const;

export function isOpenNow(date = new Date()): boolean {
  // Store hours are Central Time.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  if (weekday === 'Sun') return false;
  return hour >= business.openHour && hour < business.closeHour;
}
