import { describe, expect, it } from "vitest";
import { dealership, hoursLines } from "@/lib/dealership-config";

/**
 * The hours lines are built from `dealership.hours`, never typed. This dealer
 * opens on weekdays and closes on both weekend days (Google listing at 8108
 * Gulf Fwy, read 10/01/2026), which the reference's one-closed-day formatter
 * could not say: it printed only the first closed day.
 */
describe("the dealer's hours, as the desk prints them", () => {
  it("holds the hours on the listing", () => {
    expect(dealership.hours).toEqual([
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "10:00", closes: "17:00" },
      { days: ["Saturday", "Sunday"], opens: null, closes: null },
    ]);
  });

  it("prints the open rule and every closed day in English", () => {
    const lines = hoursLines("en");
    expect(lines.weekday).toBe("Monday to Friday, 10:00 AM to 5:00 PM");
    expect(lines.sunday).toBe("Saturday And Sunday: " + lines.closedWord);
    expect(lines.closedWord).toBe("Closed");
  });

  it("prints them in Spanish, capitalised only at the start of each line", () => {
    const lines = hoursLines("es");
    expect(lines.weekday).toBe("Lunes a viernes, 10:00 AM a 5:00 PM");
    expect(lines.sunday).toBe("Sábado y domingo: " + lines.closedWord);
    expect(lines.closedWord).toBe("Cerrado");
  });
});
