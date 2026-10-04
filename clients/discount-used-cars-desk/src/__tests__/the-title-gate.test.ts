import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gateTitleStatus,
  isTitleStatus,
  requiresRebuiltDisclosure,
} from "@/lib/vehicles/title-status";

/**
 * The title gate: an inventory fact, verified at acquisition, that a sale
 * cannot start without.
 *
 * Texas puts the rebuilt-vehicle disclosure at the offer (43 TAC §215.160),
 * which only works if the title status is known before the car is offered.
 * So 'unknown' fails closed and unsellable titles are refused by name. The
 * desk reads the fact with the vehicle, asks the question on every sale,
 * and writes its answer back to the vehicle with who said so and when.
 */
describe("what a title status can be", () => {
  it("recognizes the canonical statuses and nothing else", () => {
    for (const status of [
      "clean",
      "rebuilt_salvage",
      "bonded",
      "salvage_unrebuilt",
      "nonrepairable",
      "export_only",
      "unknown",
    ]) {
      expect(isTitleStatus(status)).toBe(true);
    }
    expect(isTitleStatus("Clean")).toBe(false);
    expect(isTitleStatus("")).toBe(false);
    expect(isTitleStatus(null)).toBe(false);
    expect(isTitleStatus(undefined)).toBe(false);
  });
});

describe("the gate itself", () => {
  it("lets a verified sellable title through", () => {
    for (const status of ["clean", "rebuilt_salvage", "bonded"] as const) {
      expect(gateTitleStatus(status)).toEqual({ ok: true, status });
    }
  });

  it("fails closed on unverified, including anything malformed", () => {
    for (const raw of ["unknown", null, undefined, "", "Clean", 42]) {
      const gate = gateTitleStatus(raw);
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toBe("unverified");
    }
  });

  it("refuses the titles a retail sale cannot proceed on, by name", () => {
    for (const status of [
      "salvage_unrebuilt",
      "nonrepairable",
      "export_only",
    ] as const) {
      const gate = gateTitleStatus(status);
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.reason).toBe("unsellable");
        expect(gate.status).toBe(status);
      }
    }
  });

  it("hangs the rebuilt disclosure duty on exactly the rebuilt title", () => {
    expect(requiresRebuiltDisclosure("rebuilt_salvage")).toBe(true);
    expect(requiresRebuiltDisclosure("clean")).toBe(false);
    expect(requiresRebuiltDisclosure("salvage_unrebuilt")).toBe(false);
  });
});

describe("the sale flow enforces it server-side", () => {
  const startSale = readFileSync(
    join(process.cwd(), "src/lib/actions/start-sale.ts"),
    "utf8",
  );

  it("gates the resolved vehicle before any record is written", () => {
    expect(startSale).toContain("gateTitleStatus(vehicle.titleStatus)");
    expect(startSale).toContain("titleBlock");
    // The vehicle is settled before the customer is touched, so a blocked
    // sale leaves nothing behind.
    expect(startSale.indexOf("resolveVehicle(supabase")).toBeLessThan(
      startSale.indexOf('.from("customers")'),
    );
  });

  it("reads the title fact with the vehicle rather than trusting the client", () => {
    expect(startSale).toContain('select("id, title_status")');
  });

  it("writes the desk's answer back only when it is a real status that differs", () => {
    expect(startSale).toMatch(
      /isTitleStatus\(input\.titleStatus\) && input\.titleStatus !== "unknown" \? input\.titleStatus : null/,
    );
    expect(startSale).toMatch(/answered && answered !== onRow/);
    expect(startSale).toContain('"Verified at the desk when the sale started"');
  });

  it("refuses to create a desk-typed vehicle without a verified title", () => {
    expect(startSale).toMatch(
      /!isTitleStatus\(input\.titleStatus\) \|\| input\.titleStatus === "unknown"/,
    );
    expect(startSale).toContain("title_status_verified_by");
  });
});

describe("the resolve action", () => {
  const action = readFileSync(
    join(process.cwd(), "src/lib/actions/title-status.ts"),
    "utf8",
  );

  it("is inventory authority, not sales authority", () => {
    expect(action).toContain('requireAdminActionPermission("inventory:manage")');
  });

  it("refuses 'unknown' as a target: unmarking is not verification", () => {
    expect(action).toMatch(/input\.status === "unknown"/);
  });

  it("records who verified and when", () => {
    expect(action).toContain("title_status_verified_at");
    expect(action).toContain("title_status_verified_by");
  });
});

describe("the resolve screen is reachable and guarded", () => {
  const routes = readFileSync(
    join(process.cwd(), "src/lib/admin/route-permissions.ts"),
    "utf8",
  );

  it("has a route rule requiring inventory:manage", () => {
    expect(routes).toMatch(
      /rule\(`\/admin\/inventory\/title-status`, \["inventory:manage"\]\)/,
    );
  });

  it("is where the blocked Start Sale screen points", () => {
    const startSaleUi = readFileSync(
      join(process.cwd(), "src/components/admin/StartSale.tsx"),
      "utf8",
    );
    expect(startSaleUi).toContain('"/admin/inventory/title-status"');
  });
});
