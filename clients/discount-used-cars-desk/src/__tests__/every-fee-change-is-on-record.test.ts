import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { feeFields, occcFiling, saveThroughMock } from "./helpers/fees";
import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { getDealerFeeChanges, getDealerFeeSchedule } from "@/lib/dealership-fees";
import { RULEBOOK_AS_OF } from "@/lib/legal/texas-dealer-fees";
import { scheduleToJson, validateFeeSchedule, type FeeScheduleFields } from "@/lib/sales/fee-schedule";

/**
 * Every fee change is on record (rulebook texas-dealer-fees.md 5.2): who
 * saved it, when, what it was and what it became, in a log that is never
 * updated or deleted, plus an activity event. A stale screen is refused
 * (compare and set), never allowed to overwrite a save it did not see. Run
 * here against the preview mock and against a real Postgres (PGlite) on the
 * migrations as the owner applies them, so the two refuse the same things.
 */

describe("in the preview mock", () => {
  beforeEach(() => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    resetMockWrites();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetMockWrites();
  });

  it("writes who, when, the old and the new, and an activity event, on every save", async () => {
    expect(await saveThroughMock(feeFields(), 0, "owner", "onboarding")).toMatchObject({ data: 1, error: null });
    expect(await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1)).toMatchObject({ data: 2, error: null });

    const log = await getDealerFeeChanges();
    expect(log.ok).toBe(true);
    if (!log.ok) return;
    expect(log.changes).toHaveLength(2);
    const [latest, first] = log.changes;
    expect(first).toMatchObject({ source: "onboarding", previous: null, next: { version: 1, docFeeCents: 15000 } });
    expect(latest).toMatchObject({ source: "settings", previous: { version: 1, docFeeCents: 15000 }, next: { version: 2, docFeeCents: 17500 } });
    expect(latest.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(latest.rulebookAsOf).toBe(RULEBOOK_AS_OF);

    const events = mockInserted("team_activity_events").filter((event) => event.event_type === "dealer_fees_saved");
    expect(events.map((event) => event.body)).toEqual([
      expect.stringMatching(/set the documentary fee to \$150\.00 \(was not set\)\.$/),
      expect.stringMatching(/set the documentary fee to \$175\.00 \(was \$150\.00\)\.$/),
    ]);
    const read = await getDealerFeeSchedule();
    expect(read.ok && read.schedule).toMatchObject({ version: 2, docFeeCents: 17500, source: "owner" });
  });

  it("refuses a stale screen: the version it read must still be current", async () => {
    await saveThroughMock(feeFields(), 0);
    expect((await saveThroughMock(feeFields({ docFeeCents: 9900 }), 0)).error).toMatchObject({ message: "stale" });
    const read = await getDealerFeeSchedule();
    expect(read.ok && read.schedule.docFeeCents).toBe(15000);
    const log = await getDealerFeeChanges();
    expect(log.ok && log.changes).toHaveLength(1);
  });
});

describe("in the database", () => {
  const ROOT = "supabase/migrations/";
  const OWNER = "00000000-0000-0000-0000-000000000001";
  const SALES = "00000000-0000-0000-0000-000000000002";
  const MANAGER = "00000000-0000-0000-0000-000000000003";
  let db: PGlite;

  async function attempt(sql: string, params: unknown[] = []): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
    try {
      return { rows: (await db.query<Record<string, unknown>>(sql, params)).rows };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const as = (uid: string) => db.query(`select set_config('test.uid', $1, false)`, [uid]);
  const save = (fields: FeeScheduleFields | Record<string, unknown>, expected: number, source = "settings") =>
    attempt(`select save_dealer_fee_schedule($1, $2::jsonb, $3) as version`, [
      expected,
      JSON.stringify({ ...(fields as Record<string, unknown>), rulebookAsOf: RULEBOOK_AS_OF }),
      source,
    ]);

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
    await db.exec(`
      insert into auth.users values ('${OWNER}', 'owner@example.test'), ('${SALES}', 'sales@example.test'), ('${MANAGER}', 'manager@example.test');
      insert into team_members (id, auth_user_id, full_name, email, role, status) values
        ('10000000-0000-0000-0000-000000000001', '${OWNER}', 'Maria Lopez', 'owner@example.test', 'owner', 'active'),
        ('10000000-0000-0000-0000-000000000002', '${SALES}', 'Sam Seller', 'sales@example.test', 'sales', 'active'),
        ('10000000-0000-0000-0000-000000000003', '${MANAGER}', 'Mo Manager', 'manager@example.test', 'manager', 'active');
    `);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("is saved by the owner alone", async () => {
    await as("");
    expect((await save(scheduleToJson(feeFields()), 0)).error).toBe("forbidden");
    await as(SALES);
    expect((await save(scheduleToJson(feeFields()), 0)).error).toBe("forbidden");
    await as(MANAGER);
    expect((await save(scheduleToJson(feeFields()), 0)).error).toBe("forbidden");
    await as(OWNER);
    expect((await save(scheduleToJson(feeFields()), 0, "onboarding")).rows).toEqual([{ version: 1 }]);
  });

  it("refuses a stale version, and logs who changed what from what to what", async () => {
    await as(OWNER);
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 9900 })), 0)).error).toBe("stale");
    expect((await save(scheduleToJson(feeFields({ docFeeCents: 17500 })), 1)).rows).toEqual([{ version: 2 }]);
    const log = (await attempt(
      `select changed_by_name, source, previous->>'docFeeCents' as was, next->>'docFeeCents' as now, (next->>'version')::int as version
         from dealer_fee_schedule_changes order by changed_at, (next->>'version')::int`,
    )).rows;
    expect(log).toEqual([
      { changed_by_name: "Maria Lopez", source: "onboarding", was: null, now: "15000", version: 1 },
      { changed_by_name: "Maria Lopez", source: "settings", was: "15000", now: "17500", version: 2 },
    ]);
    const events = (await attempt(`select body from team_activity_events where event_type = 'dealer_fees_saved' order by created_at`)).rows;
    expect(events?.map((row) => row.body)).toEqual([
      "Maria Lopez set the documentary fee to $150.00 (was not set).",
      "Maria Lopez set the documentary fee to $175.00 (was $150.00).",
    ]);
  });

  it("keeps the log final and the schedule undeletable", async () => {
    await as(OWNER);
    expect((await attempt(`update dealer_fee_schedule_changes set source = 'settings'`)).error).toBe("fee_change_is_final");
    expect((await attempt(`delete from dealer_fee_schedule_changes`)).error).toBe("fee_change_is_final");
    expect((await attempt(`delete from dealer_fee_schedule`)).error).toBe("fee_schedule_is_kept");
  });

  it("has no write policy: a signed-in session writes only through the function", async () => {
    const policies = (await attempt(
      `select tablename, cmd from pg_policies where tablename in ('dealer_fee_schedule', 'dealer_fee_schedule_changes') order by tablename`,
    )).rows;
    expect(policies).toEqual([
      { tablename: "dealer_fee_schedule", cmd: "SELECT" },
      { tablename: "dealer_fee_schedule_changes", cmd: "SELECT" },
    ]);
  });

  it("enforces the caps in its own constraints, whoever writes", async () => {
    expect((await attempt(`update dealer_fee_schedule set doc_fee_cents = 22501`)).error).toMatch(/dealer_fee_schedule_doc_fee_limit/);
    expect((await attempt(`update dealer_fee_schedule set deputy_fee_cents = 500`)).error).toMatch(/dealer_fee_schedule_deputy_only/);
    expect((await attempt(`update dealer_fee_schedule set occc_filed_max_cents = 30000`)).error).toMatch(/dealer_fee_schedule_occc_whole/);
  });

  it("refuses exactly what the desk's validator refuses, by the same code", async () => {
    await as(OWNER);
    const current = Number((await attempt(`select version from dealer_fee_schedule`)).rows?.[0]?.version);
    const cases: Array<Record<string, unknown>> = [
      scheduleToJson(feeFields({ docFeeCents: 22501 })),
      scheduleToJson(feeFields({ docFeeCents: 30001, occcFiling: occcFiling(30000) })),
      scheduleToJson(feeFields({ occcFiling: occcFiling(22500) })),
      scheduleToJson(feeFields({ docFeeCents: 30000, occcFiling: occcFiling(30000, { location: "" }) })),
      scheduleToJson(feeFields({ deputy: { isDeputy: false, feeCents: 500 } })),
      scheduleToJson(feeFields({ deputy: { isDeputy: true, feeCents: 1001 } })),
      scheduleToJson(feeFields({ vit: { year: 2026, inBusinessJan1: false, passesThrough: null, unitFactor: 0.0019 } })),
      scheduleToJson(feeFields({ vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: null } })),
      scheduleToJson(feeFields({ docFeeCents: 150.5 })),
      { ...scheduleToJson(feeFields()), adminFee: 3000 },
    ];
    for (const fields of cases) {
      const [expected] = validateFeeSchedule(fields).map((problem) => problem.code);
      expect(expected, JSON.stringify(fields)).toBeTruthy();
      expect((await save(fields, current)).error, JSON.stringify(fields)).toBe(expected);
    }
    // And accepts what it accepts: a complete filing raises the limit to the filed maximum.
    const filed = scheduleToJson(feeFields({ docFeeCents: 30000, occcFiling: occcFiling(30000) }));
    expect(validateFeeSchedule(filed)).toEqual([]);
    expect((await save(filed, current)).rows).toEqual([{ version: current + 1 }]);
    const row = (await attempt(`select occc_filed_max_cents, to_char(occc_filed_on, 'YYYY-MM-DD') as filed_on from dealer_fee_schedule`)).rows;
    expect(row).toEqual([{ occc_filed_max_cents: 30000, filed_on: "2026-09-01" }]);
  });

  it("tells the roles that file what a version saved, and no more", async () => {
    await as(SALES);
    expect((await attempt(`select dealer_fee_record(1) as record`)).rows?.[0]?.record).toEqual({ version: 1, docFeeCents: 15000, occcFiling: null });
    expect((await attempt(`select dealer_fee_record(99) as record`)).rows?.[0]?.record).toBeNull();
    await as("");
    expect((await attempt(`select dealer_fee_record(1)`)).error).toBe("forbidden");
  });
});
