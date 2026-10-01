import { describe, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  passwordResetEmail,
  teamWelcomeEmail,
  customerWelcomeEmail,
  ownerAlertEmail,
  documentDeliveryEmail,
  signInCodeEmail,
  verifyEmailCodeEmail,
  lenderHandoffEmail,
} from "@/lib/email/templates";

/**
 * Not an assertion — a renderer. Writes every template to
 * verification/email-previews so the Playwright pass can photograph what
 * a recipient actually sees. Kept as a test because the templates are TS
 * and vitest is the resolver already wired to run them.
 */
const CA = { name: "Credit Acceptance", site: "https://www.creditacceptance.com", tagline: "Every credit situation considered." };
const BRIDGE = "https://www.thetriplejauto.com/api/credit-application/start?lender=creditAcceptance&invite=abcdefghijklmnopqrstuvwx";

describe("render email previews", () => {
  it("writes every template as html", () => {
    mkdirSync("verification/email-previews", { recursive: true });
    const out: Record<string, string> = {
      "reset-en": passwordResetEmail("en", "https://www.thetriplejauto.com/admin/recover#token=example").html,
      "reset-es": passwordResetEmail("es", "https://www.thetriplejauto.com/admin/recover#token=example").html,
      "team-welcome-en": teamWelcomeEmail("en", "Maria Garcia", "Sales", "https://www.thetriplejauto.com/admin/recover#token=example").html,
      "customer-welcome-en": customerWelcomeEmail("en", "Marcus Reed", "2014 Chevrolet Malibu").html,
      "customer-welcome-es": customerWelcomeEmail("es", "Maria Garcia", "2016 Buick LaCrosse").html,
      "owner-alert": ownerAlertEmail("Access request: Pat Doe", ["Pat Doe requested dashboard access.", "Requested role: Sales"], "https://www.thetriplejauto.com/admin/team").html,
      "document-en": documentDeliveryEmail("en", "Marcus Reed", "Bill Of Sale", "https://www.thetriplejauto.com/documents/portal?id=x").html,
      "sign-in-code-en": signInCodeEmail("en", "482913", 10).html,
      "sign-in-code-es": signInCodeEmail("es", "482913", 10).html,
      "verify-email-en": verifyEmailCodeEmail("en", "204771", 10).html,
      "lender-handoff-en": lenderHandoffEmail("en", { name: "Jason Reed", lender: CA, url: BRIDGE, vehicle: "2019 Toyota Camry" }).html,
      "lender-handoff-es": lenderHandoffEmail("es", { name: "Maria Garcia", lender: CA, url: BRIDGE, vehicle: null }).html,
    };
    for (const [name, html] of Object.entries(out)) {
      // The pictures travel inside a real message as inline parts; a file
      // on disk has no parts, so the preview points at the same PNGs.
      const preview = html
        .replaceAll("cid:tj-monogram", "../../public/brand/email-monogram.png")
        .replaceAll("cid:tj-wordmark", "../../public/brand/email-wordmark.png");
      writeFileSync(`verification/email-previews/${name}.html`, preview);
    }
  });
});
