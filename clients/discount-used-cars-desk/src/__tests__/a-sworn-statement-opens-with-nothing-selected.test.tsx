// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Walked on 5190, 2026-10-04: "Is That The Real Mileage?" opened with "Yes,
 * That Is The Real Mileage" already selected (data-active, aria-pressed) on a
 * sale nobody had answered, and the screen never showed the reading being
 * sworn to; on the seeded pickup it asked about a reading that did not exist.
 * The odometer disclosure is the seller's sworn statement and must be made,
 * not defaulted (SOP fact registry: mustAnswer is "never defaulted").
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/actions/paperwork", () => ({ savePaperworkAnswer: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/actions/admin-language", () => ({ setAdminLanguage: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/haptics", () => ({ tapHaptic: vi.fn() }));

import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import AnswerStep from "@/components/admin/paperwork/AnswerStep";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { DEAL_FACTS, factById } from "@/lib/sales/deal-facts";
import { asked, paperworkDefault, type PaperworkContext } from "@/lib/sales/paperwork";

afterEach(() => cleanup());

const context = (answers: Record<string, string> = {}): PaperworkContext => ({
  funding: "cash", bodyStyle: "sedan", licenceState: "TX", paidToday: null, buyerCity: "Houston", buyerCounty: "Harris",
  vehicleMileage: 84512, answers,
});

const READING_HREF = "/admin/sales/deal-1/paperwork/billOfSale/odometerReading?change=odometerReading";

function statementScreen(lang: "en" | "es", miles: number | null, current = "") {
  const question = asked(factById("billOfSale.odometerStatus")!);
  return render(
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId="member-1">
      <AnswerStep
        dealId="deal-1"
        documentType="billOfSale"
        question={question}
        current={current}
        nextHref="/next"
        odometer={{ miles, href: READING_HREF }}
      />
    </FunnelLocaleProvider>,
  );
}

describe("a sworn statement opens with nothing selected", () => {
  it("registers no starting value, known value or suggestion for any sworn fact", () => {
    const sworn = DEAL_FACTS.filter((fact) => fact.mustAnswer);
    expect(sworn.map((fact) => fact.id).sort()).toEqual([
      "billOfSale.odometerStatus",
      "financing.firstPaymentDate",
      "salvageBillOfSale.howLeaving",
      "salvageBillOfSale.odometerStatus",
    ]);
    for (const fact of sworn) {
      expect(fact.start, `${fact.id} start`).toBeUndefined();
      expect(fact.known, `${fact.id} known`).toBeUndefined();
      expect(fact.suggest, `${fact.id} suggest`).toBeUndefined();
    }
  });

  it("gives the mileage statement no starting answer on either bill of sale", () => {
    expect(paperworkDefault("billOfSale", "odometerStatus", context())).toBeUndefined();
    expect(paperworkDefault("salvageBillOfSale", "odometerStatus", context())).toBeUndefined();
    // The 130-U borrows it while the bill of sale has not answered: no start there either.
    expect(paperworkDefault("form130U", "odometerStatus", { ...context(), allAnswers: { billOfSale: {} } })).toBeUndefined();
  });

  it("shows the reading that will print, with separators, and no statement pressed", () => {
    statementScreen("en", 84512);
    expect(screen.getByText(/The odometer reads 84,512 miles\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change The Reading" }).getAttribute("href")).toBe(READING_HREF);
    const taps = screen.getAllByRole("button");
    expect(taps.map((tap) => tap.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Yes, That Is The Real Mileage")]),
    );
    for (const tap of taps) {
      expect(tap.getAttribute("aria-pressed"), tap.textContent ?? "").toBe("false");
      expect(tap.getAttribute("data-active")).toBeNull();
      expect((tap as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("says the reading in Spanish too, as the paper prints it", () => {
    statementScreen("es", 84512);
    expect(screen.getByText(/El odómetro marca 84,512 millas\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cambiar la lectura" })).toBeTruthy();
  });

  it("offers no statement to tap on a car with no reading, only the way to enter it", () => {
    statementScreen("en", null);
    expect(screen.getByRole("link", { name: "Enter The Reading" }).getAttribute("href")).toBe(READING_HREF);
    for (const tap of screen.getAllByRole("button")) expect((tap as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    statementScreen("es", null);
    expect(screen.getByRole("link", { name: "Escribir la lectura" })).toBeTruthy();
  });
});
