import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminUi = readFileSync(
  join(process.cwd(), "src/components/admin/ui.tsx"),
  "utf8",
);
const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function cssBlock(selector: string): string {
  const start = globalsCss.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = globalsCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return globalsCss.slice(start, end);
}

function sourceBlock(startNeedle: string, endNeedle: string): string {
  const start = adminUi.indexOf(startNeedle);
  expect(start).toBeGreaterThan(-1);
  const end = adminUi.indexOf(endNeedle, start);
  expect(end).toBeGreaterThan(start);
  return adminUi.slice(start, end);
}

describe("admin button luxury system", () => {
  it("keeps shared admin buttons premium without forcing all-caps copy", () => {
    const buttonBlock = sourceBlock("function buttonClasses", "export function AdminButton");
    expect(buttonBlock).toContain("tj-action-base");
    expect(buttonBlock).toContain("tj-action-${variant}");
    expect(buttonBlock).toContain("tj-action-${size}");
    expect(adminUi).toContain("function titleCaseAdminNode");
    expect(adminUi).toContain("toTitleCaseDisplay");
    expect(adminUi).toContain("data-admin-button");
    expect(adminUi).toContain("data-admin-button-size={size}");
    expect(adminUi).toContain("data-admin-button-variant={variant}");
    expect(buttonBlock).not.toContain("bg-[linear-gradient");
    expect(buttonBlock).not.toContain("font-bold uppercase leading-tight");
    expect(buttonBlock).not.toContain("hover:-translate-y-px");
    expect(buttonBlock).not.toContain("transition-all");

    const actionBase = cssBlock(".tj-action-base");
    expect(actionBase).toContain("letter-spacing: 0;");
    expect(actionBase).toContain("word-spacing: 0.05em;");
    expect(actionBase).toContain("border-radius: 0.5rem;");
    expect(actionBase).toContain("text-transform: capitalize;");
    expect(actionBase).toContain("touch-action: manipulation;");
    expect(actionBase).toContain("user-select: none;");
    expect(actionBase).toContain("cursor: pointer;");
    expect(actionBase).toContain("text-decoration: none;");
    expect(actionBase).toContain("-webkit-tap-highlight-color: transparent;");
    expect(actionBase).toContain("background-clip: padding-box;");
    expect(actionBase).toContain("box-shadow:");
    expect(actionBase).not.toContain("text-transform: uppercase;");
    expect(cssBlock(".tj-action-md")).toContain("min-height: 48px;");
    expect(cssBlock(".tj-action-sm")).toContain("min-height: 44px;");
    expect(globalsCss).toContain("@media (min-width: 768px)");
    expect(globalsCss).toContain("min-height: 38px;");

    const uiLabel = cssBlock(".tj-ui-label");
    expect(uiLabel).toContain("letter-spacing: 0;");
  });

  it("gives direct action buttons crisp active and icon states", () => {
    const activeBlock = cssBlock(".tj-action-base:active");
    expect(activeBlock).toContain("translate: 0 1px;");
    expect(activeBlock).toContain("box-shadow:");

    const hairlineBlock = cssBlock(".tj-action-base::after");
    expect(hairlineBlock).toContain("inset 0 0 0 1px");
    expect(hairlineBlock).toContain("pointer-events: none;");

    const disabledStart = globalsCss.indexOf(".tj-action-base:disabled,");
    expect(disabledStart).toBeGreaterThan(-1);
    const disabledBlock = globalsCss.slice(disabledStart, globalsCss.indexOf("\n}", disabledStart));
    expect(disabledBlock).toContain("pointer-events: none;");
    expect(disabledBlock).toContain("opacity: 0.42;");

    const iconStart = globalsCss.indexOf(".tj-action-base > svg,");
    expect(iconStart).toBeGreaterThan(-1);
    const iconBlock = globalsCss.slice(iconStart, globalsCss.indexOf("\n}", iconStart));
    expect(iconBlock).toContain("width: 1em;");
    expect(iconBlock).toContain("height: 1em;");
    expect(iconBlock).toContain("flex: 0 0 auto;");
  });

  it("keeps shared admin badges in Title Case instead of shouting", () => {
    const badgeStart = adminUi.indexOf("export function AdminBadge");
    expect(badgeStart).toBeGreaterThan(-1);
    const badgeBlock = adminUi.slice(badgeStart);

    expect(badgeBlock).toContain("font-semibold leading-tight tracking-normal");
    expect(badgeBlock).not.toContain("uppercase");
  });

  it("runs every action variant off the shared paper tokens", () => {
    // One accent system, no per-variant hex: primary is ink, secondary and
    // ghost are hairline outlines, and the focus ring is copper.
    expect(cssBlock(".tj-action-primary")).toContain("background: var(--tj-ink)");
    expect(cssBlock(".tj-action-primary")).toContain("color: var(--tj-white)");
    expect(cssBlock(".tj-action-secondary")).toContain("border-color: var(--tj-line)");
    // Was --tj-white, until that token was split. It had been carrying two
    // jobs: the raised plane a card sits on, and the foreground colour of
    // text on a dark band. A secondary button is the first of those, so it
    // reads --tj-plane now. The guard is against a per-variant hex, and a
    // shared token still satisfies it.
    expect(cssBlock(".tj-action-secondary")).toContain("background: var(--tj-plane)");
    expect(cssBlock(".tj-action-ghost")).toContain("background: transparent");
    expect(globalsCss).toContain("--tj-action-ring: var(--tj-copper)");
  });

  it("keeps danger red, because red is what danger means", () => {
    // The only variant that does not use a neutral — a destructive action
    // should not look like every other button.
    // Vega's danger red, lifted to clear AA on obsidian.
    expect(cssBlock(".tj-action-danger")).toContain("var(--tj-danger)");
  });

  it("marks the current page as the ink selection, matching the rail", () => {
    expect(globalsCss).toContain('.tj-action-base[aria-current="page"],');
    expect(globalsCss).toContain('.tj-action-base[data-state="active"]');
  });

  it("defines one shared action tile extension for dashboard quick links", () => {
    const tile = cssBlock(".tj-action-tile");
    expect(tile).toContain("display: grid;");
    expect(tile).toContain("text-align: left;");
    expect(tile).toContain("border-radius: 0.5rem;");
    expect(cssBlock(".tj-action-tile-mobile")).toContain("min-height: 64px;");
    expect(cssBlock(".tj-action-tile-desktop")).toContain("min-height: 148px;");
    expect(cssBlock(".tj-action-tile-hold")).toContain("oklch(0.32 0.055 86 / 0.62)");
  });
});
