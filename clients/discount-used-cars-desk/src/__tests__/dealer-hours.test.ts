import { describe, expect, it } from "vitest";
import { dealership, hoursLines } from "@/lib/dealership-config";

/**
 * The hours lines are built from `dealership.hours`, never typed. Source:
 * OWNER, the dealership's billboard artwork and the owner's texts,
 * 10/01/2026: open Tuesday to Saturday, closed Sunday and Monday (superseding
 * the Google listing's weekday hours). Two closed days that are not a
 * weekend is exactly what the reference's one-closed-day formatter could not
 * say: it printed only the first closed day.
 */
describe("the dealer's hours, as the desk prints them", () => {
  it("holds the hours the owner gave", () => {
    expect(dealership.hours).toEqual([
      { days: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "10:00", closes: "19:00" },
      { days: ["Sunday", "Monday"], opens: null, closes: null },
    ]);
  });

  it("prints the open rule and every closed day in English", () => {
    const lines = hoursLines("en");
    expect(lines.weekday).toBe("Tuesday to Saturday, 10:00 AM to 7:00 PM");
    expect(lines.sunday).toBe("Sunday And Monday: " + lines.closedWord);
    expect(lines.closedWord).toBe("Closed");
  });

  it("prints them in Spanish, capitalised only at the start of each line", () => {
    const lines = hoursLines("es");
    expect(lines.weekday).toBe("Martes a sábado, 10:00 AM a 7:00 PM");
    expect(lines.sunday).toBe("Domingo y lunes: " + lines.closedWord);
    expect(lines.closedWord).toBe("Cerrado");
  });
});
