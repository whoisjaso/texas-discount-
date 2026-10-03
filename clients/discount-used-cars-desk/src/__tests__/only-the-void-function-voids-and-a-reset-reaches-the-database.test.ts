import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

/**
 * The review's database findings on the void and the reset, each proved
 * against a real Postgres (PGlite) running both migrations:
 *
 *   - a row is never inserted already voided (a forged copy dated 2099 would
 *     have killed every signing link of the deal for good);
 *   - a signed-in session cannot void by writing voided_at through the API:
 *     only the void function voids, so the cascade, the audit event and the
 *     switched-off links cannot be skipped and who voided cannot be typed;
 *   - the function voids its own fixed set, not the caller's list, never
 *     takes a memberName from the caller, and needs the title attestation;
 *   - a blank-looking reason (zero-width characters) is refused, and bidi
 *     overrides are dropped from the kept reason;
 *   - the void is dated no earlier than the moment it happened;
 *   - a document printing the bill of sale's figures cannot be filed while
 *     no bill of sale is current (the race with a void);
 *   - a password reset reaches the database: a session that first signed in
 *     before it holds no team role, and the reset ends older auth sessions.
 *
 * Supabase's own schemas are stubbed to the columns used; auth.uid() reads a
 * setting the test sets per caller, and the JWT claims are PostgREST's own
 * setting (request.jwt.claims).
 */

const ROOT = "supabase/migrations/";
const OWNER = "00000000-0000-0000-0000-000000000001";
const SALES = "00000000-0000-0000-0000-000000000002";
const DEAL = "40000000-0000-0000-0000-000000000001";
const BOS = "50000000-0000-0000-0000-000000000001";
const FIN = "50000000-0000-0000-0000-000000000003";
const POA = "50000000-0000-0000-0000-000000000004";
const TYPES = "{billOfSale,salvageBillOfSale,financing,form130U,vehicleResponsibility,insuranceAcknowledgment,rebuiltDisclosure,towAwayAcknowledgment,buyerResponsibilityStatement}";

let db: PGlite;

async function attempt(sql: string, params: unknown[] = []): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
  try {
    const result = await db.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function as(uid: string, claims: Record<string, unknown> | null = null) {
  await db.query(`select set_config('test.uid', $1, false)`, [uid]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ""]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid, bucket_id text);
    alter table storage.objects enable row level security;
  `);
  await db.exec(readFileSync(`${ROOT}20260926000000_discount_sale_desk.sql`, "utf8"));
  await db.exec(readFileSync(`${ROOT}20261002000000_void_filed_documents.sql`, "utf8"));
  await db.exec(`
    grant usage on schema public, private, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public, private, auth to authenticated;
    insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${SALES}', 'sales@example.test');
    insert into team_members (id, auth_user_id, full_name, email, role, status) values
      ('10000000-0000-0000-0000-000000000001', '${OWNER}', 'Maria Lopez', 'owner@example.test', 'owner', 'active'),
      ('10000000-0000-0000-0000-000000000002', '${SALES}', 'Sam Seller', 'sales@example.test', 'sales', 'active');
    insert into customers (id, name, phone) values ('20000000-0000-0000-0000-000000000001', 'Andrea Salinas', '7135550188');
    insert into vehicles (id, make, model, year, vin, slug) values ('30000000-0000-0000-0000-000000000001', 'Ford', 'Explorer', 2017, '1FM5K8D80HGA00001', 'ford-explorer');
    insert into deals (id, vehicle_id, customer_id, step_data) values
      ('${DEAL}', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '{}');
    insert into document_agreements (id, deal_id, document_type, status, finalized_at, completed_at, has_buyer_signature) values
      ('${BOS}', '${DEAL}', 'billOfSale', 'finalized', now() - interval '1 hour', now() - interval '1 hour', true),
      ('${FIN}', '${DEAL}', 'financing', 'finalized', now() - interval '40 minutes', now(), false),
      ('${POA}', '${DEAL}', 'powerOfAttorney', 'finalized', now() - interval '40 minutes', now(), false);
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("nothing is born voided, and only the void function voids", () => {
  it("refuses a row inserted with any void column, whoever inserts it", async () => {
    await as(SALES);
    const forged = await attempt(
      `insert into document_agreements (deal_id, document_type, status, finalized_at, voided_at, voided_by_name, void_reason, void_group_id)
       values ('${DEAL}', 'billOfSale', 'finalized', now(), '2099-01-01', 'Maria Lopez', 'Owner voided this one', gen_random_uuid())`,
    );
    expect(forged.error).toBe("voided_on_insert");
    expect((await attempt(`insert into document_agreements (deal_id, document_type, status, void_reason) values ('${DEAL}', 'billOfSale', 'pending', 'just a reason here')`)).error).toBe("voided_on_insert");
    expect((await attempt(`select count(*)::int as n from document_agreements where voided_at is not null`)).rows).toEqual([{ n: 0 }]);
  });

  it("refuses an owner's session writing voided_at straight through the API", async () => {
    await as(OWNER);
    await db.exec(`set role authenticated`);
    try {
      const direct = await attempt(
        `update document_agreements set voided_at = now(), voided_by_name = 'Sam Seller', void_reason = 'forged by a direct update', void_group_id = gen_random_uuid() where id = '${FIN}'`,
      );
      expect(direct.error).toBe("void_through_the_function_only");
      // The role is otherwise allowed to write the row: the refusal is the void, not the policy.
      expect((await attempt(`update document_agreements set buyer_name = 'Andrea Salinas' where id = '${FIN}' returning id`)).rows).toHaveLength(1);
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("never voids the power of attorney, even from inside the database", async () => {
    await as(OWNER);
    expect((await attempt(`update document_agreements set voided_at = now(), void_reason = 'not at the desk, ever', void_group_id = gen_random_uuid() where id = '${POA}'`)).error).toBe("not_voidable");
  });
});

describe("the function voids its own set, names who from the session, and needs the attestation", () => {
  const call = (types: string, reason: string, detail: string) =>
    attempt(`select id, document_type, void_reason, voided_at from void_filed_documents('${DEAL}', '${BOS}', '${types}', $1, now(), '${detail}')`, [reason]);

  it("refuses a caller's shorter or longer list", async () => {
    await as(OWNER);
    expect((await call("{billOfSale}", "Only the root voided here", `{"titleApplication":"notYet"}`)).error).toBe("not_voidable");
    expect((await call("{billOfSale,financing,form130U}", "Only the root voided here", `{"titleApplication":"notYet"}`)).error).toBe("not_voidable");
    expect((await call(TYPES.replace("}", ",powerOfAttorney}"), "Only the root voided here", `{"titleApplication":"notYet"}`)).error).toBe("not_voidable");
  });

  it("refuses without the 'Not Yet' attestation", async () => {
    expect((await call(TYPES, "The figures changed on the deal", `{}`)).error).toBe("title_question");
    expect((await call(TYPES, "The figures changed on the deal", `{"titleApplication":"submitted"}`)).error).toBe("title_question");
  });

  it("refuses a reason that is blank-looking", async () => {
    const zeroWidth = "​".repeat(12);
    expect((await call(TYPES, zeroWidth, `{"titleApplication":"notYet"}`)).error).toBe("reason_required");
    expect((await call(TYPES, `ab${"​".repeat(10)}`, `{"titleApplication":"notYet"}`)).error).toBe("reason_required");
  });

  it("voids every current copy it fed, drops bidi overrides, dates it no earlier than now, and writes the session's own name", async () => {
    const before = Date.now();
    const result = await call(TYPES, "Price ‮wrong‬ on the deal", `{"titleApplication":"notYet","memberName":"Somebody Else","memberId":"forged"}`);
    expect(result.error).toBeUndefined();
    expect((result.rows ?? []).map((row) => row.document_type).sort()).toEqual(["billOfSale", "financing"]);
    for (const row of result.rows ?? []) {
      expect(row.void_reason).toBe("Price wrong on the deal");
      expect(new Date(row.voided_at as string).getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
    const audit = (await attempt(`select metadata->>'memberName' as name, metadata->>'memberId' as member, metadata->>'titleApplication' as attested from team_activity_events where event_type = 'sale_documents_voided'`)).rows;
    expect(audit).toEqual([{ name: "Maria Lopez", member: "10000000-0000-0000-0000-000000000001", attested: "notYet" }]);
    expect((await attempt(`select voided_at is null as current from document_agreements where id = '${POA}'`)).rows).toEqual([{ current: true }]);
  });
});

describe("a document printing the bill of sale's figures waits for a current bill of sale", () => {
  it("refuses a filed contract, 130-U or vehicle responsibility with no current bill of sale", async () => {
    await as(OWNER);
    for (const type of ["financing", "form130U", "vehicleResponsibility", "towAwayAcknowledgment"]) {
      expect((await attempt(`insert into document_agreements (deal_id, document_type, status, finalized_at) values ('${DEAL}', '${type}', 'finalized', now())`)).error).toBe("bill_of_sale_first");
    }
    // A draft is not a filing, and the rebuilt disclosure comes before the bill of sale.
    expect((await attempt(`insert into document_agreements (deal_id, document_type, status) values ('${DEAL}', 'financing', 'pending')`)).error).toBeUndefined();
    expect((await attempt(`insert into document_agreements (deal_id, document_type, status, finalized_at) values ('${DEAL}', 'rebuiltDisclosure', 'finalized', now())`)).error).toBeUndefined();
  });

  it("files it once a bill of sale is current again", async () => {
    expect((await attempt(`insert into document_agreements (deal_id, document_type, status, finalized_at) values ('${DEAL}', 'billOfSale', 'finalized', now())`)).error).toBeUndefined();
    expect((await attempt(`insert into document_agreements (deal_id, document_type, status, finalized_at) values ('${DEAL}', 'financing', 'finalized', now())`)).error).toBeUndefined();
  });
});

describe("a password reset reaches the database", () => {
  const amrAt = (secondsAgo: number) => ({ sub: SALES, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - secondsAgo }] });

  it("gives no team role to a session that first signed in before the reset", async () => {
    await db.exec(`update auth.users set raw_app_meta_data = jsonb_build_object('password_reset_at', (now() - interval '10 minutes')::text) where id = '${SALES}'`);
    await as(SALES, amrAt(3600));
    expect((await attempt(`select private.current_team_role() as role, private.team_has_permission('sales:read') as can`)).rows).toEqual([{ role: null, can: false }]);
    await as(SALES, amrAt(60));
    expect((await attempt(`select private.current_team_role() as role, private.team_has_permission('sales:read') as can`)).rows).toEqual([{ role: "sales", can: true }]);
  });

  it("changes nothing with no reset, no amr time, or a reset nobody can read", async () => {
    await as(SALES, { sub: SALES, amr: ["password"] });
    expect((await attempt(`select private.current_team_role() as role`)).rows).toEqual([{ role: "sales" }]);
    await db.exec(`update auth.users set raw_app_meta_data = '{"password_reset_at":"not a time"}' where id = '${SALES}'`);
    await as(SALES, amrAt(3600));
    expect((await attempt(`select private.current_team_role() as role`)).rows).toEqual([{ role: "sales" }]);
    await db.exec(`update auth.users set raw_app_meta_data = '{}' where id = '${SALES}'`);
    expect((await attempt(`select private.current_team_role() as role`)).rows).toEqual([{ role: "sales" }]);
    await as(OWNER, null);
    expect((await attempt(`select private.current_team_role() as role`)).rows).toEqual([{ role: "owner" }]);
  });

  it("ends the account's auth sessions started before the reset, and is not callable by a signed-in session", async () => {
    await as("", null);
    await db.exec(`
      insert into auth.sessions (user_id, created_at) values
        ('${SALES}', now() - interval '2 days'), ('${SALES}', now() + interval '1 minute'), ('${OWNER}', now() - interval '2 days');
    `);
    expect((await attempt(`select end_sessions_before('${SALES}', now()) as ended`)).rows).toEqual([{ ended: 1 }]);
    expect((await attempt(`select user_id::text as who, count(*)::int as n from auth.sessions group by user_id order by who`)).rows).toEqual([
      { who: OWNER, n: 1 },
      { who: SALES, n: 1 },
    ]);
    const migration = readFileSync(`${ROOT}20261002000000_void_filed_documents.sql`, "utf8");
    expect(migration).toMatch(/revoke all on function public\.end_sessions_before\(uuid, timestamptz\) from anon, authenticated/);
  });
});
