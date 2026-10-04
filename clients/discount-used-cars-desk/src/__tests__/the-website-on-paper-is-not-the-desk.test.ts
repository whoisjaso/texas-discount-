import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Two addresses, never one.
 *
 * The dealer's public website is a dealer fact that prints on documents
 * (OWNER: the billboard artwork and the owner's texts, 10/01/2026). The
 * desk's own origin is where signing links and capture QR codes point. The
 * SOP section "The website on paper versus the desk's own address" says they
 * are two values: never print the desk origin as the website, and never
 * build links from the public website.
 *
 * Until this change the desk had one value for both jobs, so setting the
 * desk's address would have printed "desk.<domain>" on every letterhead.
 */

const WEBSITE = "www.discountusedcarsandtrucks.com";
const DESK = "https://desk.discountusedcarsandtrucks.com";

async function fresh() {
  vi.resetModules();
  const config = await import("@/lib/dealership-config");
  const shared = await import("@/lib/documents/shared");
  return { config, shared };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the website printed on paper", () => {
  it("is the owner's website, everywhere it prints", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    const { config, shared } = await fresh();
    expect(config.dealership.website).toBe(WEBSITE);
    expect(shared.DEALER_WEBSITE).toBe(WEBSITE);
    expect(config.brand.host).toBe(WEBSITE);
    expect(config.missingDealerFacts()).not.toContain("Website domain");
  });

  it("strips a scheme and a trailing slash from an override", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEALER_WEBSITE", "https://www.example.com/");
    const { config, shared } = await fresh();
    expect(config.dealership.website).toBe("www.example.com");
    expect(shared.DEALER_WEBSITE).toBe("www.example.com");
  });
});

describe("with the desk served from its own address", () => {
  it("links go to the desk and paper names the website", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", DESK);
    const { config, shared } = await fresh();
    expect(config.SITE_URL).toBe(DESK);
    expect(shared.DEALER_WEBSITE).toBe(WEBSITE);

    const { default: DocumentLetterhead } = await import("@/components/documents/DocumentLetterhead");
    const html = renderToStaticMarkup(createElement(DocumentLetterhead, { title: "Bill Of Sale" }));
    expect(html).toContain(WEBSITE);
    expect(html).not.toContain("desk.");

    const { signingUrl } = await import("@/lib/sales/signing-token");
    const { captureUrl } = await import("@/lib/sales/capture-token");
    expect(signingUrl(config.SITE_URL, "t")).toMatch(new RegExp(`^${DESK}/`));
    expect(captureUrl(config.SITE_URL, "t")).toMatch(new RegExp(`^${DESK}/`));
  });

  it("emails sign off with the website, never the desk host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", DESK);
    await fresh();
    const { lenderHandoffEmail, offerAcceptanceEmail } = await import("@/lib/email/templates");
    const lender = { name: "Example Credit", site: "https://lender.example", tagline: "A lender." };
    const texts = [
      lenderHandoffEmail("en", { name: "Ana Ruiz", lender, url: "https://lender.example/apply", vehicle: null }).text,
      lenderHandoffEmail("es", { name: "Ana Ruiz", lender, url: "https://lender.example/apply", vehicle: null }).text,
      offerAcceptanceEmail({
        fullName: "Ana Ruiz",
        greetAs: "Ana",
        role: "Sales",
        employmentType: "W-2 employee",
        startDate: "Monday, 5 October 2026",
        compensation: "$15 per hour",
        schedule: "Weekdays",
        firstSteps: ["Bring your ID."],
        signedBy: { name: "A Manager", title: "Manager" },
      }).text,
    ];
    for (const text of texts) {
      expect(text).toContain(WEBSITE);
      expect(text).not.toContain("desk.discountusedcarsandtrucks.com");
    }
  });

  it("never sends from the desk's host, and never from a mailbox nobody supplied", async () => {
    // No sender is built from either domain: a mailbox made up from the
    // website would be an address nobody confirmed (never invent a dealer
    // fact), and the desk host must never reach a customer's inbox. Null
    // until the owner names the mailboxes; Resend mail stays unsent.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", DESK);
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    vi.stubEnv("SUPPORT_FROM_EMAIL", "");
    const { config } = await fresh();
    expect(config.brand.mailFrom).toBeNull();
    expect(config.brand.supportFrom).toBeNull();
  });

  it("sends from exactly the mailboxes the owner supplies", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", DESK);
    vi.stubEnv("RESEND_FROM_EMAIL", "documents@example.com");
    vi.stubEnv("SUPPORT_FROM_EMAIL", "support@example.com");
    const { config } = await fresh();
    expect(config.brand.mailFrom).toBe("documents@example.com");
    expect(config.brand.supportFrom).toBe("support@example.com");
  });
});

describe("the filing refusal is not loosened", () => {
  it("names the desk address while it is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    const { config } = await fresh();
    expect(config.missingDealerFacts()).toContain("Desk address");
    expect(config.filingBlockedReason()).toMatch(/Desk address/);
  });

  it("is lifted for demos exactly as before", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
    const { config } = await fresh();
    expect(config.missingDealerFacts()).toContain("Desk address");
    expect(config.filingBlockedReason()).toBeNull();
  });

  it("stops naming the desk address once it is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", DESK);
    const { config } = await fresh();
    expect(config.missingDealerFacts()).not.toContain("Desk address");
  });

  it.each([
    ["the desk address set to the public website", "https://www.discountusedcarsandtrucks.com", ""],
    ["the website set to the desk address", DESK, "desk.discountusedcarsandtrucks.com"],
    ["the two differing only by www", "https://discountusedcarsandtrucks.com/", "www.discountusedcarsandtrucks.com"],
  ])("refuses filing with %s", async (_case, siteUrl, website) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
    vi.stubEnv("NEXT_PUBLIC_DEALER_WEBSITE", website);
    vi.stubEnv("NEXT_PUBLIC_DEALER_DOC_FEE", "150");
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    const { config } = await fresh();
    expect(config.missingDealerFacts().join(" ")).toMatch(/Website domain \(must be the public site, not the desk address\)/);
    expect(config.filingBlockedReason()).toMatch(/not the desk address/);
  });

  it("files with the desk and the website on their own hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", DESK);
    vi.stubEnv("NEXT_PUBLIC_DEALER_WEBSITE", "");
    const { config } = await fresh();
    expect(config.missingDealerFacts().join(" ")).not.toMatch(/Website domain/);
  });
});

describe("the Buyer's Guide", () => {
  it("prints the email marker in its email box while the dealer email is unset, never the website", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEALER_EMAIL", "");
    await fresh();
    const { generateBuyersGuidePdf } = await import("@/lib/documents/buyersGuide");
    const bytes = await generateBuyersGuidePdf({
      vehicle: { year: "2016", make: "Honda", model: "Civic", vin: "2HGFC2F59GH123456" },
      dealer: { contact: "Sales Desk" },
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const page = await doc.getPage(3);
    const text = (await page.getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
    // The FTC form's Email box: an email address or its visible marker. The
    // website is a real-looking value in the wrong field of a federal form.
    expect(text).toContain("[Not set: dealer email]");
    expect(text).not.toContain(WEBSITE);
    expect(text).not.toContain("discountusedcarsandtrucks.com");
    expect(text).not.toContain("desk.");
  }, 30_000);
});
