import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

/**
 * The void, run against a real Postgres (PGlite, in process), on both
 * migrations as the owner applies them. The preview mock mirrors these rules;
 * this is where the database's own refusals are proved: a voided row is final
 * (no update, no delete, no deal delete), voiding changes only the void
 * columns, a role without documents:manage cannot void even by writing the
 * column, and the function voids everything it fed in one transaction,
 * switching off the signing text and revoking a texted copy.
 *
 * Supabase's own schemas (auth, storage) are stubbed to the columns the
 * migrations touch; auth.uid() reads a setting the test sets per caller.
 */

const ROOT = "supabase/migrations/";
const OWNER = "00000000-0000-0000-0000-000000000001";
const SALES = "00000000-0000-0000-0000-000000000002";
const DEAL = "40000000-0000-0000-0000-000000000001";
const CLOSED = "40000000-0000-0000-0000-000000000002";
const BOS = "50000000-0000-0000-0000-000000000001";
const T130 = "50000000-0000-0000-0000-000000000002";
const FIN = "50000000-0000-0000-0000-000000000003";
const POA = "50000000-0000-0000-0000-000000000004";
const DRAFT = "50000000-0000-0000-0000-000000000005";
const TYPES = "{billOfSale,salvageBillOfSale,financing,form130U,vehicleResponsibility,insuranceAcknowledgment,rebuiltDisclosure,towAwayAcknowledgment,buyerResponsibilityStatement}";
const REASON = "A typo in the down payment";

let db: PGlite;

async function attempt(sql: string, params: unknown[] = []): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
  try {
    const result = await db.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function as(uid: string) {
  await db.query(`select set_config('test.uid', $1, false)`, [uid]);
}

const voidCall = (root = BOS, at = "now()", types = TYPES, deal = DEAL) =>
  attempt(
    `select id, document_type, voided_by_name, void_reason, voided_with_id from void_filed_documents('${deal}', '${root}', '${types}', $1, ${at}, '{"titleApplication":"notYet"}')`,
    [REASON],
  );

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
  await db.exec(readFileSync(`${ROOT}20260926000000_discount_sale_desk.sql`, "utf8"));
  await db.exec(readFileSync(`${ROOT}20261002000000_void_filed_documents.sql`, "utf8"));
  await db.exec(`
    insert into auth.users values ('${OWNER}', 'owner@example.test'), ('${SALES}', 'sales@example.test');
    insert into team_members (id, auth_user_id, full_name, email, role, status) values
      ('10000000-0000-0000-0000-000000000001', '${OWNER}', 'Maria Lopez', 'owner@example.test', 'owner', 'active'),
      ('10000000-0000-0000-0000-000000000002', '${SALES}', 'Sam Seller', 'sales@example.test', 'sales', 'active');
    insert into customers (id, name, phone) values ('20000000-0000-0000-0000-000000000001', 'Andrea Salinas', '7135550188');
    insert into vehicles (id, make, model, year, vin, slug) values ('30000000-0000-0000-0000-000000000001', 'Ford', 'Explorer', 2017, '1FM5K8D80HGA00001', 'ford-explorer');
    insert into deals (id, vehicle_id, customer_id, step_data) values ('${DEAL}', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '{}');
    insert into document_agreements (id, deal_id, document_type, status, finalized_at, completed_at, has_buyer_signature, signed_at, form_data, completed_link) values
      ('${BOS}', '${DEAL}', 'billOfSale', 'finalized', now() - interval '1 hour', now() - interval '1 hour', true, now(), '{"a":1}', 'link-bos'),
      ('${T130}', '${DEAL}', 'form130U', 'finalized', now() - interval '50 minutes', now(), true, now(), '{"b":1}', 'link-130u'),
      ('${FIN}', '${DEAL}', 'financing', 'finalized', now() - interval '40 minutes', now(), false, null, '{}', 'link-fin'),
      ('${POA}', '${DEAL}', 'powerOfAttorney', 'finalized', now() - interval '40 minutes', now(), false, null, '{}', null),
      ('${DRAFT}', '${DEAL}', 'billOfSale', 'pending', null, null, false, null, '{}', 'draft');
    insert into packet_signing_texts (deal_id, customer_id, recipient_phone, token_hash, consent_wording_hash, issued_by, expires_at)
      values ('${DEAL}', '20000000-0000-0000-0000-000000000001', '+17135550188', 'h', 'c', '${OWNER}', now() + interval '1 hour');
    insert into paperwork_invites (id, deal_id, customer_id, recipient_phone, manifest, manifest_hash, issued_by, expires_at)
      values ('60000000-0000-0000-0000-000000000001', '${DEAL}', '20000000-0000-0000-0000-000000000001', '+17135550188', '[]', 'm', '${OWNER}', now() + interval '1 day');
    insert into deals (id, vehicle_id, customer_id, status) values ('${CLOSED}', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'completed');
    insert into document_agreements (id, deal_id, document_type, status, finalized_at) values ('50000000-0000-0000-0000-000000000009', '${CLOSED}', 'billOfSale', 'finalized', now());
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("who may void, and with what", () => {
  it("refuses a caller with no session, and a role without documents:manage", async () => {
    await as("");
    expect((await voidCall()).error).toBe("forbidden");
    await as(SALES);
    expect((await voidCall()).error).toBe("forbidden");
  });

  it("refuses the power of attorney, a short reason, a clock five minutes off, a closed sale and a copy that is not current", async () => {
    await as(OWNER);
    expect((await voidCall(BOS, "now()", "{billOfSale,powerOfAttorney}")).error).toBe("not_voidable");
    expect((await attempt(`select * from void_filed_documents('${DEAL}', '${BOS}', '${TYPES}', 'short', now(), '{}')`)).error).toBe("reason_required");
    expect((await voidCall(BOS, "now() + interval '10 minutes'")).error).toBe("bad_time");
    expect((await voidCall("50000000-0000-0000-0000-000000000009", "now()", TYPES, CLOSED)).error).toBe("sale_closed");
    expect((await voidCall(T130)).error).toBe("not_current");
    expect((await voidCall(DRAFT)).error).toBe("not_current");
  });

  it("refuses when a plate was recorded with no time, or after the bill of sale was filed", async () => {
    await as(OWNER);
    await db.exec(`update deals set step_data = '{"plate":"ABC1234"}' where id = '${DEAL}'`);
    expect((await voidCall()).error).toBe("title_filed");
    await db.exec(`update deals set step_data = jsonb_build_object('plate', 'ABC1234', 'plateRecordedAt', now()::text) where id = '${DEAL}'`);
    expect((await voidCall()).error).toBe("title_filed");
    await db.exec(`update deals set step_data = jsonb_build_object('plate', 'ABC1234', 'plateRecordedAt', 'not a time') where id = '${DEAL}'`);
    expect((await voidCall()).error).toBe("title_filed");
    // A plate from stock typed before filing is not evidence.
    await db.exec(`update deals set step_data = jsonb_build_object('plate', 'ABC1234', 'plateRecordedAt', (now() - interval '2 hours')::text) where id = '${DEAL}'`);
  });
});

describe("the void", () => {
  it("voids every current copy it fed in one group, names who from the session, and keeps the records", async () => {
    await as(OWNER);
    const result = await voidCall();
    expect(result.error).toBeUndefined();
    const voided = result.rows ?? [];
    expect(voided.map((row) => row.document_type).sort()).toEqual(["billOfSale", "financing", "form130U"]);
    for (const row of voided) {
      expect(row.voided_by_name).toBe("Maria Lopez");
      expect(row.void_reason).toBe(REASON);
      expect(row.voided_with_id).toBe(row.id === BOS ? null : BOS);
    }
    const rows = (await attempt(`select id, voided_at is not null as voided, void_group_id, form_data, completed_link, expires_at from document_agreements where deal_id = '${DEAL}' order by id`)).rows ?? [];
    expect(rows).toHaveLength(5);
    expect(new Set(rows.filter((row) => row.voided).map((row) => row.void_group_id)).size).toBe(1);
    expect(rows.find((row) => row.id === POA)?.voided).toBe(false);
    expect(rows.find((row) => row.id === DRAFT)?.voided).toBe(false);
    expect(rows.find((row) => row.id === BOS)).toMatchObject({ form_data: { a: 1 }, completed_link: "link-bos" });
  });

  it("switches off the signing text, revokes the texted copy with the reason, and writes one audit event", async () => {
    expect((await attempt(`select active from packet_signing_texts`)).rows).toEqual([{ active: false }]);
    expect((await attempt(`select active, revoked_at is not null as revoked from paperwork_invites`)).rows).toEqual([{ active: false, revoked: true }]);
    const events = (await attempt(`select event, detail->>'reason' as reason from paperwork_invite_events`)).rows;
    expect(events).toEqual([{ event: "revoked", reason: "documents_voided" }]);
    const audit = (await attempt(`select actor_id, event_type, entity_type, metadata->>'titleApplication' as attested, (metadata->>'signed_count')::int as signed from team_activity_events`)).rows;
    expect(audit).toEqual([
      { actor_id: "10000000-0000-0000-0000-000000000001", event_type: "sale_documents_voided", entity_type: "deal", attested: "notYet", signed: 2 },
    ]);
  });

  it("is refused a second time", async () => {
    expect((await voidCall()).error).toBe("not_current");
  });
});

describe("a voided row is final", () => {
  it("is never updated, un-voided or deleted, and its deal cannot be deleted", async () => {
    expect((await attempt(`update document_agreements set form_data = '{}' where id = '${BOS}'`)).error).toBe("voided_document_is_final");
    expect((await attempt(`update document_agreements set voided_at = null where id = '${FIN}'`)).error).toBe("voided_document_is_final");
    expect((await attempt(`delete from document_agreements where id = '${T130}'`)).error).toBe("voided_document_is_final");
    expect((await attempt(`delete from deals where id = '${DEAL}'`)).error).toBe("voided_document_is_final");
  });

  it("can only be voided by documents:manage, and voiding changes nothing but the void", async () => {
    await as(SALES);
    expect((await attempt(`update document_agreements set voided_at = now(), void_reason = 'because it is wrong', void_group_id = gen_random_uuid() where id = '${DRAFT}'`)).error).toBe("forbidden");
    await as(OWNER);
    expect((await attempt(`update document_agreements set voided_at = now(), void_reason = 'because it is wrong', void_group_id = gen_random_uuid(), form_data = '{"x":1}' where id = '${POA}'`)).error).toBe("voiding_changes_only_the_void");
    expect((await attempt(`update document_agreements set voided_at = now(), void_reason = 'short', void_group_id = gen_random_uuid() where id = '${DRAFT}'`)).error).toMatch(/document_agreements_void_complete/);
  });

  it("leaves every other row as writable as it was", async () => {
    await as(OWNER);
    expect((await attempt(`update document_agreements set form_data = '{"still":"open"}' where id = '${DRAFT}'`)).error).toBeUndefined();
  });
});
