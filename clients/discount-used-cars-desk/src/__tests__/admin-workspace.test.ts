import { describe, expect, it } from "vitest";
import {
  DEALERSHIP_HOME,
  getCanonicalWorkspaceRoute,
  getWorkspaceFromPath,
  isAdminWorkspace,
  resolveAdminLandingWorkspace,
  type AdminWorkspace,
} from "@/lib/admin/workspace";

/**
 * Triple J no longer rents vehicles, so there is one workspace. These cover
 * what still has to hold: dealership paths resolve, the short admin aliases
 * still land somewhere real, and signing in never presents a choice.
 */
describe("admin workspace routing", () => {
  it("keeps auction intake inside the dealership workspace", () => {
    expect(getWorkspaceFromPath("/admin/auction-intake")).toBe("dealership");
    expect(getWorkspaceFromPath("/admin/auction-intake?verify=1")).toBe(
      "dealership",
    );
  });

  it("resolves the desk routes the sidebar links to", () => {
    for (const path of [
      "/admin/sales",
      "/admin/templates",
      "/admin/dealership/inventory",
      "/admin/paperwork",
      "/admin/documents",
    ]) {
      expect(getWorkspaceFromPath(path)).toBe("dealership");
    }
  });

  it("treats the admin root as workspace-free", () => {
    expect(getWorkspaceFromPath("/admin")).toBeNull();
  });

  it("never asks the operator to pick a lane", () => {
    const allowed: AdminWorkspace[] = ["dealership"];

    // Whatever is stored — a stale "rental" cookie included — landing resolves.
    expect(resolveAdminLandingWorkspace(allowed, "dealership")).toBe("dealership");
    expect(resolveAdminLandingWorkspace(allowed, "rental")).toBe("dealership");
    expect(resolveAdminLandingWorkspace(allowed, "unknown")).toBe("dealership");
  });

  it("returns nothing when the account has no workspace at all", () => {
    expect(resolveAdminLandingWorkspace([], "dealership")).toBeNull();
  });

  it("no longer recognises rental as a workspace", () => {
    expect(isAdminWorkspace("rental")).toBe(false);
    expect(isAdminWorkspace("dealership")).toBe(true);
  });

  it("keeps root paths compatibility-only by resolving canonical routes", () => {
    expect(getCanonicalWorkspaceRoute("/admin/payments", "dealership")).toBe(
      "/admin/dealership/payments",
    );
    expect(getCanonicalWorkspaceRoute("/admin/documents", "dealership")).toBe(
      "/admin/dealership/documents",
    );
    expect(getCanonicalWorkspaceRoute("/admin/team", "dealership")).toBe(
      "/admin/dealership/team",
    );
  });

  it("leaves unknown paths alone", () => {
    expect(getCanonicalWorkspaceRoute("/admin/sales", "dealership")).toBeNull();
  });

  it("points the desk at the dealership dashboard", () => {
    // Vega's admin is the sale desk: signing in lands on Handle A Sale.
    expect(DEALERSHIP_HOME).toBe("/admin/sales");
  });
});
