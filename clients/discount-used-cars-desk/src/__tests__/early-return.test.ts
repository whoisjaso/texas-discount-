import { describe, expect, it } from "vitest";
import {
  calculateDailyRentalRate,
  calculateEarlyReturnBalance,
  calculateRemainingRentalDays,
} from "@/lib/rentals/early-return";

describe("early return rental balance", () => {
  it("calculates the daily rate from a weekly rental", () => {
    expect(calculateDailyRentalRate(250, "Weekly")).toBe(35.71);
  });

  it("charges only the remaining paid-through days", () => {
    expect(calculateRemainingRentalDays("2026-04-29", "2026-04-27")).toBe(2);
    expect(
      calculateEarlyReturnBalance({
        rentalRate: 250,
        rentalPeriod: "Weekly",
        paidThroughDate: "2026-04-29",
        returnDate: "2026-04-27",
      }),
    ).toEqual({
      dailyRate: 35.71,
      daysRemaining: 2,
      amountDue: 71.42,
    });
  });

  it("does not create a balance once the paid-through date has arrived", () => {
    expect(
      calculateEarlyReturnBalance({
        rentalRate: 250,
        rentalPeriod: "Weekly",
        paidThroughDate: "2026-04-29",
        returnDate: "2026-04-29",
      }).amountDue,
    ).toBe(0);
  });
});
