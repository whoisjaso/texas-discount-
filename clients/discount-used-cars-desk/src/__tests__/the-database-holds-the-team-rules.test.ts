import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

/**
 * The team screen's rules, held by the database too
 * (20261004000000_team_member_guards.sql), on a real Postgres (PGlite)
 * running the migrations as the owner applies them, with Supabase's grants
 * and a signed-in session's role (`set role authenticated`). The policy
 * "team members: self or team manager" lets a manager's session write any
 * column of any row straight through the API, and any member delete their own
 * row; the desk's actions refuse those changes, and so does the database:
 *
 * - only an owner makes an owner, or changes or deletes an owner's row;
 * - only an owner changes who is cleared to sign or the legal name;
 * - only team:manage deletes a row (a member deleting their own roster row
 *   would let the account's older metadata stand in for removed access);
 * - the last active owner is never removed or demoted, by anybody, the
 *   service role (the desk's own server) included;
 * - nor does a manager's session change what makes a row somebody's: the
 *   account it belongs to and its address, the stored signature printed on
 *   every dealer line, whether onboarding is finished (which reopens the
 *   name step), or a row's way back to a fresh request (which resets its
 *   clearance to the role's default at the next approval);
 * - and Team History (team_activity_events rows for a team member) is
 *   written by the desk's server alone
 *   (20261004000001_team_history_server_only.sql): the policy "activity:
 *   staff write" lets every role insert any activity line.
 */

const ROOT = "supabase/migrations/";
const OWNER = "00000000-0000-0000-0000-000000000001";
const MANAGER = "00000000-0000-0000-0000-000000000002";
const SALES = "00000000-0000-0000-0000-000000000003";
/** An account with no roster row: somebody else's, or a second one of the manager's. */
const ALT = "00000000-0000-0000-0000-000000000009";
const M_OWNER = "10000000-0000-0000-0000-000000000001";
const M_MANAGER = "10000000-0000-0000-0000-000000000002";
const M_SALES = "10000000-0000-0000-0000-000000000003";
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
/** The desk's own server (the service role) or the SQL editor. */
async function asDatabase() {
  await db.query("reset role");
  await db.query("select set_config('test.uid', '', false)");
}

const row = async (id: string) => {
  await asDatabase();
  return (await attempt("select role, status, can_sign_contracts, full_name, display_name from team_members where id = $1", [id])).rows?.[0];
};

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
    "20261004000000_team_member_guards.sql",
    "20261004000001_team_history_server_only.sql",
  ]) {
    await db.exec(readFileSync(`${ROOT}${file}`, "utf8"));
  }
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant usage on schema private to anon, authenticated;
    grant execute on all functions in schema private to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${OWNER}', 'owner@example.test'), ('${MANAGER}', 'manager@example.test'), ('${SALES}', 'sales@example.test'), ('${ALT}', 'alt@example.test');
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await asDatabase();
  await db.exec(`
    delete from team_activity_events;
    alter table team_members disable trigger trg_team_members_guard;
    delete from team_members;
    alter table team_members enable trigger trg_team_members_guard;
    insert into team_members (id, auth_user_id, full_name, display_name, email, role, status, can_sign_contracts) values
      ('${M_OWNER}', '${OWNER}', 'Maria Lopez', 'Maria', 'owner@example.test', 'owner', 'active', true),
      ('${M_MANAGER}', '${MANAGER}', 'Carlos Mendez', 'Carlos', 'manager@example.test', 'manager', 'active', true),
      ('${M_SALES}', '${SALES}', 'Jason Price', 'Jason', 'sales@example.test', 'sales', 'active', false);
  `);
});

describe("a manager's session, straight through the API", () => {
  it("cannot make an owner, by update or by insert", async () => {
    await as(MANAGER);
    expect((await attempt(`update team_members set role = 'owner' where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set role = 'owner' where id = $1`, [M_MANAGER])).error).toBe("owner_only");
    expect(
      (await attempt(`insert into team_members (full_name, email, role, status) values ('New Owner', 'new@example.test', 'owner', 'active')`)).error,
    ).toBe("owner_only");
    expect((await row(M_SALES))!.role).toBe("sales");
  });

  it("cannot change or delete an owner's row", async () => {
    await as(MANAGER);
    expect((await attempt(`update team_members set status = 'inactive' where id = $1`, [M_OWNER])).error).toBe("owner_only");
    expect((await attempt(`update team_members set phone = '7135550100' where id = $1`, [M_OWNER])).error).toBe("owner_only");
    expect((await attempt(`delete from team_members where id = $1`, [M_OWNER])).error).toBe("owner_only");
    expect((await row(M_OWNER))!.status).toBe("active");
  });

  it("cannot change who is cleared to sign, or a legal name", async () => {
    await as(MANAGER);
    expect((await attempt(`update team_members set can_sign_contracts = true where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set full_name = 'Jason Prize' where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set display_name = 'Jay' where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect(
      (await attempt(`insert into team_members (full_name, email, role, status, can_sign_contracts) values ('Pre Cleared', 'pc@example.test', 'sales', 'pending', true)`)).error,
    ).toBe("owner_only");
    expect(await row(M_SALES)).toMatchObject({ can_sign_contracts: false, full_name: "Jason Price", display_name: "Jason" });
  });

  it("cannot replace a stored signature, the one printed on every dealer line", async () => {
    await asDatabase();
    await db.query(`update team_members set signature_data_url = 'data:image/png;base64,REAL', signature_updated_at = now() where id = $1`, [M_SALES]);
    await as(MANAGER);
    expect((await attempt(`update team_members set signature_data_url = 'data:image/png;base64,FORGED' where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set signature_data_url = null where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set signature_updated_at = now() - interval '1 day' where id = $1`, [M_SALES])).error).toBe("owner_only");
    await asDatabase();
    expect((await attempt("select signature_data_url from team_members where id = $1", [M_SALES])).rows?.[0]).toEqual({
      signature_data_url: "data:image/png;base64,REAL",
    });
  });

  it("cannot point a row at another account or address", async () => {
    await as(MANAGER);
    expect((await attempt(`update team_members set auth_user_id = $1, email = 'alt@example.test' where id = $2`, [ALT, M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set auth_user_id = null where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await attempt(`update team_members set auth_user_id = null where id = $1`, [M_MANAGER])).error).toBe("owner_only");
    expect((await attempt(`update team_members set email = 'alt@example.test' where id = $1`, [M_SALES])).error).toBe("owner_only");
    await asDatabase();
    expect((await attempt("select auth_user_id, email from team_members where id = $1", [M_SALES])).rows?.[0]).toEqual({
      auth_user_id: SALES,
      email: "sales@example.test",
    });
  });

  it("cannot reopen onboarding, its own or anyone's (the name step would open again)", async () => {
    await asDatabase();
    await db.query(`update team_members set onboarding_completed_at = now()`);
    await as(MANAGER);
    expect((await attempt(`update team_members set onboarding_completed_at = null where id = $1`, [M_MANAGER])).error).toBe("owner_only");
    expect((await attempt(`update team_members set onboarding_completed_at = null where id = $1`, [M_SALES])).error).toBe("owner_only");
    await asDatabase();
    expect((await attempt("select count(*)::int as open from team_members where onboarding_completed_at is null")).rows?.[0]).toEqual({ open: 0 });
  });

  it("cannot turn a person with access back into a fresh request", async () => {
    await as(MANAGER);
    expect((await attempt(`update team_members set status = 'inactive' where id = $1`, [M_SALES])).error).toBeUndefined();
    expect((await attempt(`update team_members set status = 'pending' where id = $1`, [M_SALES])).error).toBe("owner_only");
    expect((await row(M_SALES))!.status).toBe("inactive");
  });

  it("cannot add a row that already carries a signature or a finished onboarding", async () => {
    await as(MANAGER);
    expect(
      (await attempt(`insert into team_members (full_name, email, role, status, signature_data_url) values ('Pre Signed', 'ps@example.test', 'sales', 'pending', 'data:image/png;base64,FORGED')`)).error,
    ).toBe("owner_only");
    expect(
      (await attempt(`insert into team_members (full_name, email, role, status, onboarding_completed_at) values ('Pre Done', 'pd@example.test', 'sales', 'pending', now())`)).error,
    ).toBe("owner_only");
  });

  it("still does a manager's work: a role below owner, access on or off", async () => {
    await as(MANAGER);
    expect((await attempt(`update team_members set role = 'registration' where id = $1`, [M_SALES])).error).toBeUndefined();
    expect((await attempt(`update team_members set status = 'inactive' where id = $1`, [M_SALES])).error).toBeUndefined();
    expect(await row(M_SALES)).toMatchObject({ role: "registration", status: "inactive" });
  });
});

describe("a member's own session", () => {
  it("cannot delete their own roster row", async () => {
    await as(SALES);
    expect((await attempt(`delete from team_members where id = $1`, [M_SALES])).error).toBe("forbidden");
    expect(await row(M_SALES)).toBeTruthy();
  });

  it("cannot clear themselves to sign or rename themselves", async () => {
    await as(SALES);
    // Row level security refuses the write (it needs team:manage), whatever the trigger says.
    expect((await attempt(`update team_members set can_sign_contracts = true where id = $1`, [M_SALES])).error).toBeTruthy();
    expect((await row(M_SALES))!.can_sign_contracts).toBe(false);
  });
});

describe("Team History", () => {
  const forged = `insert into team_activity_events (actor_id, event_type, entity_type, entity_id, body, metadata)
    values (null, 'team_member_signing_changed', 'team_member', $1, 'Maria Lopez turned signing on for Jason Price.', '{}') returning id`;

  it.each([
    ["Sales", SALES],
    ["a manager", MANAGER],
    ["an owner", OWNER],
  ])("is never written by %s's session, so nobody can post a line into it", async (_who, uid) => {
    await as(uid);
    expect((await attempt(forged, [M_SALES])).error).toBe("team_history_server_only");
    await asDatabase();
    expect((await attempt("select count(*)::int as lines from team_activity_events")).rows?.[0]).toEqual({ lines: 0 });
  });

  it("is written by the desk's server, and a staff session still records its other work", async () => {
    await asDatabase();
    expect((await attempt(forged, [M_SALES])).error).toBeUndefined();
    await as(SALES);
    expect(
      (await attempt(`insert into team_activity_events (event_type, entity_type, body) values ('deal_note', 'deal', 'A note on a deal.') returning id`)).error,
    ).toBeUndefined();
  });
});

describe("an owner's session", () => {
  it("changes clearance and names, and makes another owner", async () => {
    await as(OWNER);
    expect((await attempt(`update team_members set can_sign_contracts = true where id = $1`, [M_SALES])).error).toBeUndefined();
    expect((await attempt(`update team_members set full_name = 'Jason Price-Moreno' where id = $1`, [M_SALES])).error).toBeUndefined();
    expect((await attempt(`update team_members set role = 'owner' where id = $1`, [M_MANAGER])).error).toBeUndefined();
    expect(await row(M_SALES)).toMatchObject({ can_sign_contracts: true, full_name: "Jason Price-Moreno" });
    expect((await row(M_MANAGER))!.role).toBe("owner");
  });
});

describe("the last active owner", () => {
  it.each([
    ["removed", `update team_members set status = 'inactive' where id = '${M_OWNER}'`],
    ["demoted", `update team_members set role = 'manager' where id = '${M_OWNER}'`],
    ["deleted", `delete from team_members where id = '${M_OWNER}'`],
  ])("is never %s, by their own session or by the service role", async (_how, sql) => {
    await as(OWNER);
    expect((await attempt(sql)).error).toBe("last_owner");
    await asDatabase();
    expect((await attempt(sql)).error).toBe("last_owner");
    expect(await row(M_OWNER)).toMatchObject({ role: "owner", status: "active" });
  });

  it("can go once another owner is active, and the other is then the last", async () => {
    await as(OWNER);
    expect((await attempt(`update team_members set role = 'owner' where id = $1`, [M_MANAGER])).error).toBeUndefined();
    expect((await attempt(`update team_members set status = 'inactive' where id = $1`, [M_OWNER])).error).toBeUndefined();
    await asDatabase();
    expect((await attempt(`update team_members set status = 'inactive' where id = $1`, [M_MANAGER])).error).toBe("last_owner");
  });

  it("is never in the way of the first owner's bootstrap or a new request", async () => {
    await asDatabase();
    expect(
      (await attempt(`insert into team_members (email, full_name, role, status, can_sign_contracts) values ('second@example.test', '', 'owner', 'active', true)
        on conflict (email) do update set role = 'owner', status = 'active', can_sign_contracts = true`)).error,
    ).toBeUndefined();
    expect(
      (await attempt(`insert into team_members (email, full_name, role, status) values ('request@example.test', 'Diego Ramirez', 'sales', 'pending')`)).error,
    ).toBeUndefined();
  });
});
