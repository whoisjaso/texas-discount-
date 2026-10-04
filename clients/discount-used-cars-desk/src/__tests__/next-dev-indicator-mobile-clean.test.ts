import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

describe("Next development indicator", () => {
  it("keeps local dev chrome out of mobile admin screenshots", () => {
    expect(nextConfig).toContain("devIndicators: false");
    expect(nextConfig).not.toContain("devIndicators: {");
    expect(nextConfig).not.toContain('position: "bottom-left"');
  });
});
