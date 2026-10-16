/**
 * The odometer reading as Start A Sale takes it, for the desk's other way in
 * (the bill of sale's "What Does The Odometer Read?", actions/odometer-reading.ts).
 *
 * The same check Start A Sale makes before it writes `vehicles.mileage`: a
 * reading is a number of miles, not negative, recorded to the whole mile.
 * Separators a person types ("84,512") are read as the number they write;
 * anything else is not a reading. Pure, so the screen, the action and the
 * tests share one rule.
 */
export function readOdometerReading(typed: string | number | null | undefined): number | null {
  const raw = typeof typed === "number" ? String(typed) : (typed ?? "");
  const reading = raw.replace(/[,\s]/g, "");
  if (reading === "") return null;
  const parsed = Number(reading);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/** The reading as the paper prints it: whole miles with thousands separators. */
export function printedOdometerReading(miles: number): string {
  return miles.toLocaleString("en-US");
}

export const ODOMETER_READING_MESSAGES = {
  odometerReadingInvalid: "Enter the odometer reading in miles.",
  odometerReadingNotAllowed:
    "Recording the odometer reading changes the car's record, which this role cannot do. Ask someone in sales or a manager to enter it.",
  odometerReadingMissing: "Enter the odometer reading first. The mileage statement swears to it.",
} as const;
