import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { FILING_GATE_MESSAGES } from "@/lib/sales/refile-gates";
import { FEE_OVER_FILED_MAX_MESSAGE, feeProblemSentence } from "@/lib/sales/fee-schedule";
import { STATE_FEES_2026 } from "@/lib/legal/texas-dealer-fees";
import { legal } from "@/lib/dealership-config";

/**
 * Law review and verification, 2026-10-03 (minor): the words around the fees
 * said more, or other, than the law does.
 *
 *   - "A dealer that is not a deputy may not charge [a title fee]": the limit
 *     in 43 TAC §217.168(b)(2) is on the deputy's own convenience fee; the
 *     state's title fee (§501.138) is owed on every sale.
 *   - The emissions line gave the non-LIRAP rule figure ($2.50) for every
 *     emissions county; in the LIRAP counties of the Dallas-Fort Worth and
 *     Houston areas the rule says $8.50 for an OBD-tested vehicle (30 TAC
 *     §114.53(d)(2)(A), (3)(A)).
 *   - The ch. 345 limits were credited to Fin. Code §345.251 alone; the
 *     figures are 7 TAC §86.201(c)-(e)'s.
 *   - The over-limit refusal said "without an OCCC filing" even when the fee
 *     was above a filing's maximum.
 *   - "The same documentary fee rules apply to every sale" stated platform
 *     policy as law.
 *   - The public site said prices exclude "dealer fees": the only dealer
 *     charge allowed on top of the price is the documentary fee.
 *   - Verification: no way back to Your Fees once saved; a disabled Next
 *     looked like the live one; a blank gap under the review's sub-headings.
 */

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const es = JSON.parse(readFileSync("messages/es.json", "utf8"));
const fees = en.funnel.onboarding.fees;

describe("the dealer-deputy wording", () => {
  it("names the convenience fee, and keeps the state's title fee", () => {
    expect(fees.deputyNoNote).toBe(
      "No dealer-deputy title convenience fee on any sale. Only a county-deputized dealer may charge one (43 TAC §217.168(b)(2)); the state's title fee still applies.",
    );
    expect(es.funnel.onboarding.fees.deputyNoNote).toMatch(/cargo de título del estado sigue aplicando/);
    expect(fees.deputyLine).toBe("Title convenience fee (dealer deputy)");
    expect(fees.deputyFee).toBe("Title convenience fee the county approved");
    expect(en.funnel.onboarding.errors.deputyFeeWithoutDeputy).toMatch(/dealer-deputy title convenience fee \(43 TAC §217\.168\(b\)\(2\)\)\. The state's title fee still applies/);
    expect(feeProblemSentence({ code: "deputyFeeWithoutDeputy", field: "deputy.fee" })).toBe(en.funnel.onboarding.errors.deputyFeeWithoutDeputy);
  });
});

describe("the emissions line", () => {
  it("gives both rule figures, and the published one", () => {
    expect(fees.stateEmissionsValue).toContain("{rule}");
    expect(fees.stateEmissionsValue).toContain("{ruleLirap}");
    expect(fees.stateEmissionsValue).toContain("LIRAP");
    expect(STATE_FEES_2026.emissionsFeeAtRegistration.ruleCentsLirapObd).toBe(850);
    expect(es.funnel.onboarding.fees.stateEmissionsValue).toContain("{ruleLirap}");
  });
});

describe("the ch. 345 citation and the finance help", () => {
  it("credits the figures to the rule that sets them", () => {
    expect(fees.ch345Help).toContain("(7 TAC §86.201(c)-(e); Fin. Code §345.251)");
  });

  it("says the same-limit-for-every-sale rule is the desk's policy", () => {
    expect(fees.financeHelp).toMatch(/desk's policy/);
    expect(fees.financeHelp).not.toMatch(/The same documentary fee rules apply to every sale\./);
  });
});

describe("the over-limit refusal names the limit it is over", () => {
  it("has one sentence for no filing in force and one for a filed maximum", () => {
    expect(FILING_GATE_MESSAGES.feeOverLimit).toMatch(/without an OCCC filing in force \(\$225\.00, 7 TAC §84\.205\(b\)\(1\)\)/);
    expect(FEE_OVER_FILED_MAX_MESSAGE).toMatch(/above the maximum filed with the OCCC \(7 TAC §84\.205\(d\)\)/);
    expect(en.funnel.review.feeOverFiledMax).toBe(FEE_OVER_FILED_MAX_MESSAGE);
    expect(es.funnel.review.feeOverFiledMax).toMatch(/máximo presentado ante la OCCC/);
    expect(FILING_GATE_MESSAGES.feeAboveToday).toBe(en.funnel.review.feeAboveToday);
  });
});

describe("the advertised-price disclaimers", () => {
  it("name the documentary fee, never 'dealer fees'", () => {
    expect(legal.en.pricing).toContain("the documentary fee");
    expect(legal.en.pricing).not.toMatch(/dealer fees/i);
    expect(legal.es.pricing).toContain("el cargo documental");
    const site = join(process.cwd(), "..", "discount-used-cars-site", "src", "pages");
    expect(existsSync(site), "the public site sits beside the desk").toBe(true);
    for (const page of ["Home.tsx", "VehicleDetail.tsx"]) {
      const text = readFileSync(join(site, page), "utf8");
      expect(text, page).not.toMatch(/dealer fees/i);
      expect(text, page).toMatch(/the documentary fee/);
    }
  });
});

describe("the screens around the fees", () => {
  it("lists Your Fees in the sidebar, for the owner alone", () => {
    const sidebar = readFileSync("src/components/admin/AdminSidebar.tsx", "utf8");
    const secondary = sidebar.slice(sidebar.indexOf("const SECONDARY"), sidebar.indexOf("const ACCOUNT"));
    expect(secondary).toContain('{ label: "Your Fees", href: "/admin/dealership/fees", icon: Receipt }');
    expect(roleOpensAdminRoute("owner", "/admin/dealership/fees")).toBe(true);
    for (const role of ["manager", "sales", "finance", "registration", "viewer"] as const) {
      expect(roleOpensAdminRoute(role, "/admin/dealership/fees"), role).toBe(false);
    }
  });

  it("makes a button that cannot be pressed look it", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.ed-btn:disabled,\s*\.ed-btn\[aria-disabled="true"\] \{\s*opacity: 0\.42;\s*cursor: not-allowed;/);
  });

  it("closes the gap under the review's sub-headings", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.ed-fee-receipt \{\s*margin-top: 6px;\s*padding-top: 14px;/);
    const wizard = readFileSync("src/components/admin/fees/DealerFeesWizard.tsx", "utf8");
    expect(wizard.match(/<dl className="ed-money-receipt ed-fee-receipt"/g)).toHaveLength(2);
  });

  it("opens the government fees screen to the roles that file", () => {
    const path = "/admin/sales/3f2b8c1d-9a4e-4f6b-8c1d-2e5a7b9c0d1f/government-fees";
    for (const role of ["owner", "manager", "sales", "registration"] as const) expect(roleOpensAdminRoute(role, path), role).toBe(true);
    for (const role of ["finance", "viewer", "mechanic"] as const) expect(roleOpensAdminRoute(role, path), role).toBe(false);
  });
});
