import { describe, expect, it } from "vitest";
import {
  BODY_STYLES,
  MODEL_YEAR_FLOOR,
  VEHICLE_MAKES,
  modelYears,
  rankSuggestions,
} from "@/lib/forms/vehicle-catalog";

/**
 * What the type-ahead offers, and in what order.
 *
 * Order is the whole feature. A list that contains the right answer in
 * eleventh place has not saved anybody anything.
 */

describe("typing a make", () => {
  it("puts the makes that start with the letter first", () => {
    // The owner's example: press F and see the F makes, not Alfa Romeo.
    const f = rankSuggestions(VEHICLE_MAKES, "f");
    expect(f.slice(0, 3)).toEqual(["Ferrari", "FIAT", "Ford"]);
    expect(f).not.toContain("Alfa Romeo");
  });

  it("narrows as the second letter arrives", () => {
    expect(rankSuggestions(VEHICLE_MAKES, "fo")).toEqual(["Ford"]);
  });

  it("ignores case, so nobody has to hold shift", () => {
    expect(rankSuggestions(VEHICLE_MAKES, "FORD")).toEqual(["Ford"]);
    expect(rankSuggestions(VEHICLE_MAKES, "ford")).toEqual(["Ford"]);
  });

  it("finds a make by a later word", () => {
    // Somebody thinking of it as a Rover should not have to remember Land.
    expect(rankSuggestions(VEHICLE_MAKES, "rover")).toContain("Land Rover");
  });

  it("does not make anybody guess where the hyphen goes", () => {
    expect(rankSuggestions(VEHICLE_MAKES, "mercedes benz")).toContain(
      "Mercedes-Benz",
    );
    expect(rankSuggestions(VEHICLE_MAKES, "mercedesbenz")).toContain(
      "Mercedes-Benz",
    );
  });

  it("offers the head of the list before anything is typed", () => {
    const empty = rankSuggestions(VEHICLE_MAKES, "");
    expect(empty.length).toBeGreaterThan(0);
    expect(empty[0]).toBe("Acura");
  });

  it("returns nothing rather than everything for a miss", () => {
    // A field that shows the full list when the text matches nothing is a
    // field that has stopped answering the question.
    expect(rankSuggestions(VEHICLE_MAKES, "zzzz")).toEqual([]);
  });

  it("never floods the field", () => {
    expect(rankSuggestions(VEHICLE_MAKES, "a", 8).length).toBeLessThanOrEqual(8);
  });
});

describe("the year list", () => {
  it("runs newest first, starting one year ahead", () => {
    // Lots take in next-model-year cars before the calendar catches up.
    const years = modelYears(2026);
    expect(years[0]).toBe("2027");
    expect(years[1]).toBe("2026");
  });

  it("stops at the floor rather than running to the 1980s", () => {
    const years = modelYears(2026);
    expect(years[years.length - 1]).toBe(String(MODEL_YEAR_FLOOR));
  });

  it("narrows as digits are typed", () => {
    const years = modelYears(2026);
    expect(rankSuggestions(years, "201", 20)).toContain("2019");
    expect(rankSuggestions(years, "201", 20)).not.toContain("2026");
    expect(rankSuggestions(years, "2019", 20)).toEqual(["2019"]);
  });
});

describe("the lists themselves", () => {
  it("keeps makes alphabetical, which is how a list is scanned", () => {
    const sorted = [...VEHICLE_MAKES].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    expect([...VEHICLE_MAKES]).toEqual(sorted);
  });

  it("has no duplicates", () => {
    expect(new Set(VEHICLE_MAKES).size).toBe(VEHICLE_MAKES.length);
    expect(new Set(BODY_STYLES).size).toBe(BODY_STYLES.length);
  });

  it("writes the marques that are initials as initials", () => {
    // A list that offers "Bmw" teaches the wrong spelling to every operator.
    expect(VEHICLE_MAKES).toContain("BMW");
    expect(VEHICLE_MAKES).toContain("GMC");
    expect(VEHICLE_MAKES).toContain("RAM");
    expect(VEHICLE_MAKES).not.toContain("Bmw");
  });
});
