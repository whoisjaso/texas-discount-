import { describe, expect, it } from "vitest";
import {
  generateCompletedPortalLink,
  generatePortalLink,
} from "@/lib/documents/customerPortal";

describe("portal link language", () => {
  it("appends lang=es for Spanish customers", () => {
    expect(generatePortalLink("https://x.com", "abc", "tok", "es")).toBe(
      "https://x.com/documents/portal?id=abc&token=tok&lang=es",
    );
    expect(generateCompletedPortalLink("https://x.com", "abc", "tok", "es")).toBe(
      "https://x.com/documents/portal?id=abc&view=completed&token=tok&lang=es",
    );
  });

  it("omits lang for English and unknown values", () => {
    expect(generatePortalLink("https://x.com", "abc", "tok")).toBe(
      "https://x.com/documents/portal?id=abc&token=tok",
    );
    expect(generatePortalLink("https://x.com", "abc", "tok", "en")).toBe(
      "https://x.com/documents/portal?id=abc&token=tok",
    );
    expect(generatePortalLink("https://x.com", "abc", "tok", null)).toBe(
      "https://x.com/documents/portal?id=abc&token=tok",
    );
  });
});
