import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const guide = readFileSync(
  join(process.cwd(), "src/components/admin/OpsTaskGuide.tsx"),
  "utf8",
);

function sourceBlock(startNeedle: string, endNeedle: string): string {
  const start = guide.indexOf(startNeedle);
  expect(start).toBeGreaterThan(-1);
  const end = guide.indexOf(endNeedle, start);
  expect(end).toBeGreaterThan(start);
  return guide.slice(start, end);
}

describe("admin ops task guide luxury controls", () => {
  it("keeps the guided task panel Title Case and on shared controls", () => {
    const panelBlock = sourceBlock("data-ops-guide-panel", "<style jsx global>");

    expect(guide).toContain("toTitleCaseDisplay");
    expect(guide).toContain("AdminButton");
    expect(guide).toContain("AdminLinkButton");
    // The "Guided Task" eyebrow is gone: the panel's heading is the task, and a
    // copper label restating the category above it is decoration.
    expect(panelBlock).not.toContain("Guided Task");
    expect(panelBlock).toContain("Start Here");
    expect(panelBlock).toContain("Done Here");
    expect(panelBlock).toContain("data-ops-guide-refocus");
    expect(panelBlock).toContain("data-ops-guide-collapse");
    expect(panelBlock).toContain("data-ops-guide-close");
    expect(panelBlock).toContain("data-ops-guide-step");
    expect(panelBlock).toContain("data-ops-guide-ops-link");
    expect(panelBlock).toContain("data-ops-guide-done");
    expect(panelBlock).not.toContain("uppercase");
    expect(panelBlock).not.toContain("tracking-[");
    expect(panelBlock).not.toContain("Done here");
    expect(panelBlock).not.toContain("Start here");
  });

  it("normalizes dynamic task copy before display", () => {
    expect(guide).toContain("cleanSteps");
    expect(guide).toContain(".map(toTitleCaseDisplay)");
    expect(guide).toContain("const guideTitle = guide ? toTitleCaseDisplay(guide.title) :");
    expect(guide).toContain("const guideDescription = guide ? toTitleCaseDisplay(guide.description) :");
    expect(guide).toContain('const focusLabel = toTitleCaseDisplay(guide?.focusLabel || "Highlighted Area")');
    expect(guide).not.toContain("Follow the highlighted area");
    expect(guide).not.toContain("Ops task");
  });
});
