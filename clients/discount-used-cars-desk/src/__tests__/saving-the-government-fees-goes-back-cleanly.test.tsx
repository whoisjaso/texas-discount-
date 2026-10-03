// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Walked on 5190, 2026-10-03 (1440 wide): saving a sale's government fees
 * went back to the bill of sale's review and the review came up blank, with
 * "Failed to execute 'removeChild' on 'Node'" in the console. The save pushed
 * the review, then refreshed the router and switched the form's own state
 * (a "saved" line, the button out of Saving) while that navigation was
 * committing; React then removed a node the navigation had already taken
 * away. Reproduced with a probe twice; gone once the save only navigates.
 *
 * So a successful save does exactly one thing to the router (push the way
 * back) and nothing to the form after it. A refusal stays on the screen and
 * says why, the button live again.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
const confirm = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/sales/deal-1/government-fees" }));
vi.mock("@/lib/actions/government-fees", () => ({ confirmGovernmentFeesAction: confirm }));
vi.mock("@/lib/actions/admin-language", () => ({ setAdminLanguage: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/haptics", () => ({ tapHaptic: vi.fn() }));

import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import GovernmentFeesForm from "@/components/admin/fees/GovernmentFeesForm";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { governmentEstimate } from "@/lib/sales/government-fees";

const BACK = "/admin/sales/deal-1/paperwork/billOfSale/review";

function screenFor() {
  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial="en" userId="member-1">
      <GovernmentFeesForm
        dealId="deal-1"
        vehicle="2017 Ford Explorer XLT"
        buyerName="Andrea Salinas"
        initialCounty="Harris"
        recorded={null}
        estimate={governmentEstimate("Harris", 4500, "2026-10-03")}
        weightLbs={4500}
        today="2026-10-03"
        locked={null}
        backHref={BACK}
        saleHref="/admin/sales/deal-1"
      />
    </FunnelLocaleProvider>
  );
}

function fill() {
  fireEvent.click(screen.getByRole("button", { name: "$33.00" }));
  fireEvent.change(document.querySelector("input[name=registrationFee]")!, { target: { value: "70.75" } });
  fireEvent.click(screen.getByRole("button", { name: /\$7\.50/ }));
}
const save = () => document.querySelector<HTMLButtonElement>("[data-government-save]")!;

beforeEach(() => {
  for (const fn of Object.values(router)) fn.mockReset();
  confirm.mockReset();
});
afterEach(() => cleanup());

describe("saving the government fees", () => {
  it("pushes the way back once, and nothing else touches the router or the form", async () => {
    confirm.mockResolvedValue({ ok: true });
    render(screenFor());
    fill();
    await act(async () => {
      fireEvent.click(save());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(BACK);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    // The form is left as the navigation found it: still saving, no new line.
    expect(save().disabled).toBe(true);
    expect(document.querySelector("[role=status]")).toBeNull();
  });

  it("stays on a refusal, says why, and lets the person try again", async () => {
    confirm.mockResolvedValue({ ok: false, code: "voidFirst", error: "File again after the void." });
    render(screenFor());
    fill();
    await act(async () => {
      fireEvent.click(save());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelector("[data-government-refusal=voidFirst]")).not.toBeNull();
    expect(save().disabled).toBe(false);
  });

  it("stays when the save throws, and lets the person try again", async () => {
    confirm.mockRejectedValue(new Error("network"));
    render(screenFor());
    fill();
    await act(async () => {
      fireEvent.click(save());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelector("[data-government-refusal=couldNotSave]")).not.toBeNull();
    expect(save().disabled).toBe(false);
  });
});
