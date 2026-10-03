import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLocalAdminUser } from "@/lib/auth/local-admin";
import { createMockSupabaseClient } from "@/lib/supabase/mock";
import { RULEBOOK_AS_OF, RULEBOOK_PATH } from "@/lib/legal/texas-dealer-fees";
import { scheduleToJson, type FeeScheduleFields, type OcccDocFeeFiling } from "@/lib/sales/fee-schedule";
import type { TeamRole } from "@/lib/operations/team";

/** A schedule's fields, with a $150.00 documentary fee and nothing else on top. */
export function feeFields(over: Partial<FeeScheduleFields> = {}): FeeScheduleFields {
  return {
    docFeeCents: 15000,
    occcFiling: null,
    writesFinanceContracts: true,
    nmlsId: null,
    legacyLicense: null,
    deputy: { isDeputy: false, feeCents: 0 },
    vit: { year: 2026, inBusinessJan1: false, passesThrough: null, unitFactor: null },
    financesCh345: false,
    ...over,
  };
}

/** A complete OCCC filing (7 TAC §84.205(c)): every one of the five facts. */
export function occcFiling(maxCents = 30000, over: Partial<OcccDocFeeFiling> = {}): OcccDocFeeFiling {
  return { maxCents, filedOn: "2026-09-01", effectiveOn: "2026-09-02", licenseOrNmls: "NMLS 1234567", location: "Main lot", ...over };
}

/** The preview mock's client as the preview session (role from the cookie, roster row from DESK_PREVIEW_MEMBER). */
export function previewClient(role: TeamRole = "owner") {
  return createMockSupabaseClient(createLocalAdminUser("owner@example.dev", role));
}

/** The save the owner's screen makes, straight through the mock's database function. */
export function saveThroughMock(fields: FeeScheduleFields, expectedVersion: number, role: TeamRole = "owner", source = "settings") {
  return previewClient(role).rpc("save_dealer_fee_schedule", {
    p_expected_version: expectedVersion,
    p_next: { ...scheduleToJson(fields), rulebookAsOf: RULEBOOK_AS_OF },
    p_source: source,
  });
}

/**
 * The rulebook, found by walking up from the desk to the agency repository's
 * root. Never optional: a desk whose rulebook cannot be found cannot prove
 * its figures are the law's.
 */
export function readRulebook(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, RULEBOOK_PATH);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`The rulebook (${RULEBOOK_PATH}) was not found above ${process.cwd()}. Copy it in with the desk.`);
}

/** The rulebook's section 5.10 JSON block, parsed. */
export function rulebookLimits(): Record<string, unknown> {
  const text = readRulebook();
  const start = text.indexOf("### 5.10 Machine-readable limits");
  if (start < 0) throw new Error("The rulebook has no section 5.10.");
  const open = text.indexOf("```json", start);
  const close = text.indexOf("```", open + 7);
  return JSON.parse(text.slice(open + 7, close)) as Record<string, unknown>;
}
