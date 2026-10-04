import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The state's fees are shown, never asked (rulebook texas-dealer-fees.md 5.1
 * and 5.2): the review screen lists the dealer's own county's 2026 government
 * lines read-only with their sources, the inspection fee on its own line,
 * emissions as webDEALER's figure (the two published amounts conflict), and
 * there is no box to type a title or registration fee into. It says plainly
 * what the desk charges today until it computes them by county.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import DealerFeesWizard from "@/components/admin/fees/DealerFeesWizard";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { configFeeSchedule } from "@/lib/sales/fee-schedule";
import { feeFields } from "./helpers/fees";

function review(lang: "en" | "es" = "en") {
  const schedule = { ...configFeeSchedule("2026-10-03"), ...feeFields(), source: "owner" as const, version: 3 };
  const wizard = createElement(DealerFeesWizard, {
    mode: "settings",
    initialSchedule: schedule,
    county: "Harris",
    today: "2026-10-03",
    startAt: "review",
    onSaved: () => {},
  });
  // The wizard goes in as the provider's child (the third argument); the
  // props object is typed without it.
  const provider = { bundles: getFunnelBundles(), initial: lang, userId: null } as ComponentProps<typeof FunnelLocaleProvider>;
  return renderToStaticMarkup(createElement(FunnelLocaleProvider, provider, wizard));
}

describe("the review screen", () => {
  const page = review();
  const state = page.slice(page.indexOf("data-state-fees"), page.indexOf("data-desk-default"));

  it("lists the county's 2026 state lines, read-only, with their sources", () => {
    expect(state).toContain("Title fee");
    expect(state).toContain("$33.00");
    expect(state).toContain("$51.75");
    expect(state).toContain("$11.50");
    expect(state).toContain("$4.75");
    expect(state).toContain("Inspection program fee (its own line)");
    expect(state).toContain("$7.50");
    expect(state).toContain("webDEALER computes it (the rule says $2.50; TxDMV publishes $2.75)");
    expect(state).toContain("$10.00");
    expect(state).toContain("Transp. Code §501.138(a)");
    expect(state).toContain("43 TAC §215.155(e)");
    expect(state).not.toContain("<input");
  });

  it("asks for no title or registration fee anywhere", () => {
    expect(page).not.toMatch(/name="(?:titleFee|registrationFee|otherFees)"/);
  });

  it("shows the dealer charges against what Texas allows, and that there is no combined cap", () => {
    expect(page).toContain("Dealer charges on top of the price: $150.00 of $225.00 allowed");
    expect(page).toContain("Texas has no single cap on dealer fees.");
  });

  it("says what the desk charges today, until it computes the state's lines", () => {
    expect(page).toContain("For now Handle A Sale charges $33.00 title and $75.00 registration on every sale: a desk default.");
  });

  it("speaks Spanish too", () => {
    const spanish = review("es");
    expect(spanish).toContain("Cargos del concesionario además del precio: $150.00 de $225.00 permitidos");
    expect(spanish).toContain("Fijados por el estado");
  });
});
