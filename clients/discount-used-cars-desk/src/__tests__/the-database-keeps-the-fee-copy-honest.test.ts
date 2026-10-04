import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { RULEBOOK_AS_OF } from "@/lib/legal/texas-dealer-fees";
import { feeFields, occcFiling } from "./helpers/fees";
import { scheduleToJson, type FeeScheduleFields } from "@/lib/sales/fee-schedule";

/**
 * Code review, 2026-10-03 (major and minors), on a real Postgres (PGlite)
 * running the migrations as the owner applies them, with Supabase's grants
 * and a signed-in session's role (`set role authenticated`):
 *
 * 1. A sales:manage session could rewrite a sale's fee copy straight from
 *    the browser (`merge_deal_step_data`, or an update the deals policy
 *    allows), skipping the app's guard: a doc fee of its choosing, or a copy
 *    pointed at an older saved version with a higher fee. The database now
 *    takes only a copy that IS the schedule as it stands (its version, its
 *    doc fee, its OCCC filing), whoever writes it.
 * 2. The first save's compare-and-set had no row to lock: two first saves
 *    could both log version 1. Saves now take one lock, and the change log
 *    holds one row per version.
 * 3. The OCCC filing's dates are refused as the desk refuses them.
 * 4. A role without sales:read saw no schedule row and fell back to the
 *    config seed: every active team member now reads the same row.
 */

const ROOT = "supabase/migrations/";
const OWNER = "00000000-0000-0000-0000-000000000001";
const SALES = "00000000-0000-0000-0000-000000000002";
const MECHANIC = "00000000-0000-0000-0000-000000000003";
const DEAL = "40000000-0000-0000-0000-000000000001";
const DEAL2 = "40000000-0000-0000-0000-000000000002";
let db: PGlite;

async function attempt(sql: string, params: unknown[] = []): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
  try {
    return { rows: (await db.query<Record<string, unknown>>(sql, params)).rows };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** The session of a signed-in person, as PostgREST runs it. */
async function as(uid: string) {
  await db.query("reset role");
  await db.query("select set_config('test.uid', $1, false)", [uid]);
  await db.query("set role authenticated");
}
async function asDatabase() {
  await db.query("reset role");
}

const save = (fields: FeeScheduleFields | Record<string, unknown>, expected: number) =>
  attempt("select save_dealer_fee_schedule($1, $2::jsonb, 'settings') as version", [
    expected,
    JSON.stringify({ ...(fields as Record<string, unknown>), rulebookAsOf: RULEBOOK_AS_OF }),
  ]);

/** A copy as Start A Sale writes it from a schedule version. */
const copy = (over: Record<string, unknown> = {}) => ({
  titleFee: 33,
  registrationFee: 75,
  docFee: 150,
  docFeeCapCents: 22500,
  occcFiling: null,
  scheduleVersion: 1,
  source: "owner",
  takenAt: "2026-10-03T15:00:00.000Z",
  rulebookAsOf: RULEBOOK_AS_OF,
  ...over,
});

const merge = (fees: Record<string, unknown> | null, deal = DEAL) =>
  attempt("select merge_deal_step_data($1, $2::jsonb) as v", [deal, JSON.stringify({ fees })]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid, bucket_id text);
    alter table storage.objects enable row level security;
  `);
  for (const file of [
    "20260926000000_discount_sale_desk.sql",
    "20261002000000_void_filed_documents.sql",
    "20261002000001_vehicle_empty_weight.sql",
    "20261003000000_dealer_fee_schedule.sql",
  ]) {
    await db.exec(readFileSync(`${ROOT}${file}`, "utf8"));
  }
  // Supabase's grants to the API roles; row level security does the rest.
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant usage on schema private to anon, authenticated;
    grant execute on all functions in schema private to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${OWNER}', 'owner@example.test'), ('${SALES}', 'sales@example.test'), ('${MECHANIC}', 'mechanic@example.test');
    insert into team_members (id, auth_user_id, full_name, email, role, status) values
      ('10000000-0000-0000-0000-000000000001', '${OWNER}', 'Maria Lopez', 'owner@example.test', 'owner', 'active'),
      ('10000000-0000-0000-0000-000000000002', '${SALES}', 'Sam Seller', 'sales@example.test', 'sales', 'active'),
      ('10000000-0000-0000-0000-000000000003', '${MECHANIC}', 'Max Mechanic', 'mechanic@example.test', 'mechanic', 'active');
    insert into customers (id, name, phone) values ('20000000-0000-0000-0000-000000000001', 'Andrea Salinas', '7135550188');
    insert into vehicles (id, vin, year, make, model, slug) values
      ('30000000-0000-0000-0000-000000000001', '1FM5K8D80HGA00001', 2017, 'Ford', 'Explorer', 'ford-explorer-1'),
      ('30000000-0000-0000-0000-000000000002', '1FM5K8D80HGA00002', 2018, 'Ford', 'Explorer', 'ford-explorer-2');
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("a sale's fee copy is the schedule's, whoever writes it", () => {
  it("before any owner save, takes only a version-0 copy from the config seed", async () => {
    await asDatabase();
    expect(
      (await attempt(
        `insert into deals (id, vehicle_id, customer_id, step_data) values ($1, '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', $2::jsonb)`,
        [DEAL, JSON.stringify({ fees: copy({ scheduleVersion: 1 }) })],
      )).error,
    ).toBe("fees_protected");
    expect(
      (await attempt(
        `insert into deals (id, vehicle_id, customer_id, step_data) values ($1, '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', $2::jsonb)`,
        [DEAL, JSON.stringify({ fees: copy({ scheduleVersion: 0, source: "config", docFee: 292 }) })],
      )).error,
    ).toBeUndefined();
  });

  it("refuses a copy with a doc fee or version the schedule does not have, through the merge or a plain update", async () => {
    await as(OWNER);
    expect((await save(scheduleToJson(feeFields()), 0)).rows).toEqual([{ version: 1 }]);

    await as(SALES);
    // The current schedule's copy (what Apply Today's Fees writes) goes in.
    expect((await merge(copy())).error).toBeUndefined();
    // A doc fee of the session's own choosing does not.
    expect((await merge(copy({ docFee: 99 }))).error).toBe("fees_protected");
    expect(
      (await attempt(`update deals set step_data = jsonb_set(step_data, '{fees,docFee}', '400') where id = $1`, [DEAL])).error,
    ).toBe("fees_protected");
    // Nor a version that does not exist, or another source.
    expect((await merge(copy({ scheduleVersion: 7 }))).error).toBe("fees_protected");
    expect((await merge(copy({ scheduleVersion: 0, source: "config" }))).error).toBe("fees_protected");
    // Nor an OCCC filing the schedule does not record.
    expect((await merge(copy({ docFee: 150, occcFiling: occcFiling(30000) }))).error).toBe("fees_protected");
    const held = (await attempt(`select step_data->'fees'->>'docFee' as fee from deals where id = $1`, [DEAL])).rows;
    expect(held).toEqual([{ fee: "150" }]);
  });

  it("refuses pointing a copy back at an older, higher version after the owner lowers the fee", async () => {
    await as(OWNER);
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 22500 })), 1)).rows).toEqual([{ version: 2 }]);
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 15000 })), 2)).rows).toEqual([{ version: 3 }]);
    await as(SALES);
    expect((await merge(copy({ docFee: 225, scheduleVersion: 2 }))).error).toBe("fees_protected");
    expect((await merge(copy({ docFee: 150, scheduleVersion: 3 }))).error).toBeUndefined();
  });

  it("refuses a deal inserted with a forged copy, and lets a copy be removed", async () => {
    await as(SALES);
    expect(
      (await attempt(
        `insert into deals (id, vehicle_id, customer_id, step_data) values ($1, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', $2::jsonb)`,
        [DEAL2, JSON.stringify({ fees: copy({ docFee: 999, scheduleVersion: 3 }) })],
      )).error,
    ).toBe("fees_protected");
    // No copy at all resolves to the current schedule, or to a filed bill of sale's printed fees.
    expect((await merge(null)).error).toBeUndefined();
  });

  it("leaves every other step_data write alone", async () => {
    await as(SALES);
    expect((await attempt(`select merge_deal_step_data($1, '{"money": {"amount": "9000"}}'::jsonb) as v`, [DEAL])).error).toBeUndefined();
  });
});

describe("one save at a time, one change row per version", () => {
  it("takes a lock before reading the version, so a second first save is 'stale'", () => {
    const sql = readFileSync(`${ROOT}20261003000000_dealer_fee_schedule.sql`, "utf8");
    const fn = sql.slice(sql.indexOf("create or replace function public.save_dealer_fee_schedule"));
    expect(fn.indexOf("pg_advisory_xact_lock(hashtext('public.dealer_fee_schedule'))")).toBeGreaterThan(-1);
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("select * into v_row from dealer_fee_schedule where id = 1 for update"));
  });

  it("refuses a second change row for a version already logged", async () => {
    await asDatabase();
    const duplicate = await attempt(
      `insert into dealer_fee_schedule_changes (changed_by_name, source, next, rulebook_as_of) values ('x', 'settings', '{"version": 3, "docFeeCents": 15000}', '2026-10-03')`,
    );
    expect(duplicate.error).toMatch(/idx_dealer_fee_schedule_changes_version|duplicate key/);
  });
});

describe("the OCCC filing's dates, in the database", () => {
  it("refuses a filing dated after today, one in effect before it was filed, and a fee above $225 before the effective date", async () => {
    await as(OWNER);
    const current = Number((await attempt("select version from dealer_fee_schedule")).rows?.[0]?.version);
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 39900, occcFiling: occcFiling(39900, { filedOn: "2027-06-01", effectiveOn: "2027-07-01" }) })), current)).error).toBe("occcFilingInFuture");
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 30000, occcFiling: occcFiling(30000, { filedOn: "2026-09-01", effectiveOn: "2020-01-01" }) })), current)).error).toBe("occcFilingDatesOutOfOrder");
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 30000, occcFiling: occcFiling(30000, { filedOn: "2026-10-01", effectiveOn: "2099-01-01" }) })), current)).error).toBe("occcFilingNotYetEffective");
    await asDatabase();
    expect(
      (await attempt(
        `update dealer_fee_schedule set occc_filed_max_cents = 30000, occc_filed_on = '2026-09-01', occc_effective_on = '2026-08-01', occc_license_or_nmls = 'X', occc_location = 'Y'`,
      )).error,
    ).toMatch(/dealer_fee_schedule_occc_dates/);
  });
});

describe("every active team member reads the same schedule", () => {
  it("lets a role without sales:read see the row, and nobody outside the team", async () => {
    await as(MECHANIC);
    expect((await attempt("select doc_fee_cents from dealer_fee_schedule")).rows).toEqual([{ doc_fee_cents: 15000 }]);
    await db.query("reset role");
    await db.query("select set_config('test.uid', '', false)");
    await db.query("set role anon");
    expect((await attempt("select doc_fee_cents from dealer_fee_schedule")).rows).toEqual([]);
    await asDatabase();
  });
});
