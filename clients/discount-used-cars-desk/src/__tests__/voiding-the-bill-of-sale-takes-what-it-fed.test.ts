import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Voiding the bill of sale takes what it fed (owner's decision 10/02/2026;
 * SOP "The documents", Voiding and filing again).
 *
 * An Owner or a Manager voids the filed bill of sale with a reason, after
 * answering that the title application has not gone to the county. Every
 * current filed document its figures or its buyer reached is voided with it,
 * never the power of attorney (ink on the county's form). Nothing is deleted:
 * the rows are marked, one audit event is written, and the old signing link
 * stops working.
 */

const state = vi.hoisted(() => ({
  role: "owner" as string,
  member: { id: "member-1", full_name: "Maria Lopez", display_name: "Maria" } as Record<string, unknown> | null,
  adminDataFails: false,
}));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async (permission: string) => {
    const { hasTeamPermission } = await import("@/lib/operations/team");
    if (!hasTeamPermission(state.role as never, permission as never)) {
      return { ok: false, error: "This role is not allowed to do that.", code: "role" };
    }
    return { ok: true, role: state.role, user: { id: "local-admin-preview", email: "owner@example.dev" }, member: state.member };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "tj-local-admin-preview" ? { value: "owner@example.dev" } : undefined),
    set: () => {},
    getAll: () => [],
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/supabase/admin-data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/admin-data")>();
  return {
    ...original,
    createAdminDataClient: async () => {
      if (state.adminDataFails) throw new Error("database unavailable");
      return original.createAdminDataClient();
    },
  };
});

import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import {
  NEVER_VOIDED_AT_DESK,
  PRINTS_BILL_OF_SALE_FIGURES,
  VOIDED_WITH_BILL_OF_SALE,
  VOID_MESSAGES,
  canVoidDocuments,
  cleanVoidReason,
  titleEvidenceAfterFiling,
  voidPlan,
} from "@/lib/sales/void-bill-of-sale";
import { TEAM_ROLES } from "@/lib/operations/team";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { voidBillOfSaleAction } from "@/lib/actions/void-bill-of-sale";

const REASON = "The down payment was typed as 1500, it is 2000";

describe("what a void takes", () => {
  it("covers every packet document exactly once, and never the power of attorney", () => {
    const types = SALE_DOCUMENTS.map((entry) => entry.documentType).filter(Boolean) as string[];
    for (const type of types) {
      const inVoided = (VOIDED_WITH_BILL_OF_SALE as readonly string[]).includes(type);
      const inNever = (NEVER_VOIDED_AT_DESK as readonly string[]).includes(type);
      expect(inVoided !== inNever, type).toBe(true);
    }
    expect([...VOIDED_WITH_BILL_OF_SALE, ...NEVER_VOIDED_AT_DESK].sort()).toEqual([...types].sort());
    expect(VOIDED_WITH_BILL_OF_SALE).not.toContain("powerOfAttorney");
  });

  it("knows which documents print the bill of sale's figures, as the renderers do", () => {
    expect(PRINTS_BILL_OF_SALE_FIGURES.billOfSale).toEqual(["financing", "form130U", "vehicleResponsibility"]);
    expect(PRINTS_BILL_OF_SALE_FIGURES.salvageBillOfSale).toEqual(["financing", "towAwayAcknowledgment"]);
    const link = readFileSync("src/lib/sales/corridor-link.ts", "utf8");
    // The contract carries the bill of sale's trade-in and money; the 130-U
    // names its trade-in (box 36) from the bill of sale's answers; vehicle
    // responsibility quotes the registration figure from the same money.
    expect(link).toMatch(/documentType === "financing"[\s\S]*?tradeInAllowance: num\(formData\.tradeInAllowance\)/);
    expect(link).toMatch(/function tradeInDescriptionFor[\s\S]*?readPaperwork\(sale\.stepData, "billOfSale"\)/);
    expect(link).toMatch(/quotedRegistrationAmount: num\(formData\.quotedRegistrationAmount\)/);
    // On a tow-away sale the acknowledgment prints how the car leaves, an
    // answer given on the salvage bill of sale; only the salvage bill prints money.
    const salvage = readFileSync("src/components/documents/SalvageSaleDocument.tsx", "utf8");
    expect(salvage).toMatch(/sheet === "towAwayAcknowledgment" \? \([\s\S]*?howLeavingLabel/);
    expect(salvage).toMatch(/sheet === "salvageBillOfSale" \? \([\s\S]*?moneyHeading/);
    expect(link).toMatch(/howLeaving: text\(formData\.howLeaving\) \|\| text\(bill\.howLeaving\)/);
  });

  it("is open to an owner and a manager only", () => {
    const allowed = TEAM_ROLES.filter((role) => canVoidDocuments(role));
    expect([...allowed].sort()).toEqual(["manager", "owner"]);
    expect(canVoidDocuments(null)).toBe(false);
  });

  it("keeps a reason of 10 to 500 characters, cleaned", () => {
    expect(cleanVoidReason("too short")).toEqual({ ok: false, code: "voidReasonRequired" });
    expect(cleanVoidReason("  exactly 10  ")).toEqual({ ok: true, reason: "exactly 10" });
    expect(cleanVoidReason("a\u0000b\tc\n\nd   e f g h")).toEqual({ ok: true, reason: "a b c d e f g h" });
    expect(cleanVoidReason("x".repeat(500))).toMatchObject({ ok: true });
    expect(cleanVoidReason("x".repeat(501))).toEqual({ ok: false, code: "voidReasonTooLong" });
    expect(cleanVoidReason(undefined)).toEqual({ ok: false, code: "voidReasonRequired" });
  });

  it("reads a plate recorded at or after filing as the title application at the county", () => {
    const filed = "2026-10-02T15:00:00.000Z";
    expect(titleEvidenceAfterFiling({}, filed)).toBe(false);
    expect(titleEvidenceAfterFiling({ plate: "ABC1234", plateRecordedAt: "2026-10-02T14:00:00.000Z" }, filed)).toBe(false);
    expect(titleEvidenceAfterFiling({ plate: "ABC1234", plateRecordedAt: filed }, filed)).toBe(true);
    expect(titleEvidenceAfterFiling({ plate: "ABC1234", plateRecordedAt: "2026-10-02T16:00:00.000Z" }, filed)).toBe(true);
    // No recorded time is evidence (fail safe), and so is a time nobody can read.
    expect(titleEvidenceAfterFiling({ plate: "ABC1234" }, filed)).toBe(true);
    expect(titleEvidenceAfterFiling({ plate: "ABC1234", plateRecordedAt: "soon" }, filed)).toBe(true);
  });

  it("plans the root, every current copy it takes, and what stays", () => {
    const rows = [
      { id: "b1", document_type: "billOfSale", finalized_at: "2026-10-02T14:00:00Z" },
      { id: "b2", document_type: "billOfSale", finalized_at: "2026-10-02T14:30:00Z" },
      { id: "p1", document_type: "powerOfAttorney", finalized_at: "2026-10-02T14:20:00Z" },
      { id: "d1", document_type: "form130U", status: "pending" },
    ];
    const planned = voidPlan(rows);
    expect(planned).toMatchObject({ ok: true });
    if (!planned.ok) return;
    expect(planned.plan.root.id).toBe("b2");
    expect(planned.plan.voids.map((row) => row.id)).toEqual(["b1", "b2"]);
    expect(planned.plan.stays.map((row) => row.id)).toEqual(["p1"]);
    expect(voidPlan(rows, "b1")).toMatchObject({ ok: true });
    expect(voidPlan(rows, "p1")).toEqual({ ok: false, code: "voidNotCurrent" });
    expect(voidPlan([rows[2]])).toEqual({ ok: false, code: "voidNothingFiled" });
  });
});

/* -------------------------------------------------------------------- */
/* The action, against the preview store                                */
/* -------------------------------------------------------------------- */

const DEAL = "void-action-deal";
const FILED = "2026-10-02T14:00:00.000Z";

async function seed(extra: { status?: string; stepData?: Record<string, unknown>; documents?: Array<Record<string, unknown>> } = {}) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: extra.status ?? "in_progress",
    language: "en",
    step_data: {
      funding: { type: "inHouse", lenderId: null, lenderOther: null },
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "1500" },
      salePlan: { registrationBy: "dealer", titleSignedBy: "dealer", insuranceShown: false, inspectionBy: "done" },
      ...(extra.stepData ?? {}),
    },
    customers: { id: "void-action-buyer", name: "Andrea Salinas", phone: "7135550188" },
    vehicles: { id: "void-action-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean", sale_price: 9000 },
  });
  const row = (id: string, type: string, signed: boolean, at = FILED) => ({
    id,
    deal_id: DEAL,
    document_type: type,
    status: "finalized",
    finalized_at: at,
    completed_at: at,
    has_buyer_signature: signed,
    signed_at: signed ? at : null,
    form_data: { kept: id },
    completed_link: `link-${id}`,
    language: "en",
  });
  await client.from("document_agreements").insert(
    extra.documents ?? [
      row("bos-old", "billOfSale", true, "2026-10-02T13:00:00.000Z"),
      row("bos", "billOfSale", true),
      row("t130", "form130U", true),
      row("fin", "financing", false),
      row("ins", "insuranceAcknowledgment", true),
      row("poa", "powerOfAttorney", false),
    ],
  );
}

function rowsOf() {
  return mockInserted("document_agreements").filter((row) => row.deal_id === DEAL);
}

const voidIt = (overrides: Partial<Parameters<typeof voidBillOfSaleAction>[1]> = {}) =>
  voidBillOfSaleAction(DEAL, { rootId: "bos", reason: REASON, titleApplication: "notYet", ...overrides });

beforeEach(() => {
  resetMockWrites();
  state.role = "owner";
  state.member = { id: "member-1", full_name: "Maria Lopez", display_name: "Maria" };
  state.adminDataFails = false;
});

describe("an owner voids the bill of sale on a buy here pay here deal", () => {
  it("voids every current copy it fed with one group, never the power of attorney, and deletes nothing", async () => {
    await seed();
    const before = rowsOf().length;
    const result = await voidIt();
    expect(result).toMatchObject({ ok: true, next: `/admin/sales/${DEAL}/summary?voided=1` });
    if (!result.ok) return;
    expect(result.voided.map((entry) => entry.id).sort()).toEqual(["bos", "bos-old", "fin", "ins", "t130"]);
    expect(result.voided.find((entry) => entry.id === "fin")?.wasSigned).toBe(false);
    expect(result.voided.find((entry) => entry.id === "bos")?.wasSigned).toBe(true);

    const rows = rowsOf();
    expect(rows).toHaveLength(before);
    const voided = rows.filter((row) => row.voided_at);
    expect(voided.map((row) => row.id).sort()).toEqual(["bos", "bos-old", "fin", "ins", "t130"]);
    const groups = new Set(voided.map((row) => row.void_group_id));
    expect(groups.size).toBe(1);
    for (const row of voided) {
      expect(row.void_reason).toBe(REASON);
      expect(row.voided_by_name).toBe("Maria Lopez");
      expect(row.voided_by_member_id).toBe("member-1");
      expect(row.voided_at).toBe(voided[0].voided_at);
      expect(row.voided_with_id).toBe(row.id === "bos" ? null : "bos");
      // The record of what was filed is untouched.
      expect(row.form_data).toEqual({ kept: row.id });
      expect(row.completed_link).toBe(`link-${row.id}`);
    }
    expect(rows.find((row) => row.id === "poa")?.voided_at).toBeUndefined();

    const events = mockInserted("team_activity_events").filter((event) => event.entity_id === DEAL);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "sale_documents_voided", entity_type: "deal", actor_id: "member-1" });
    expect(events[0].metadata).toMatchObject({ titleApplication: "notYet", reason: REASON, root_type: "billOfSale", signed_count: 4 });
  });

  it("lands back on the step the void was asked from, and never on a made-up one", async () => {
    await seed();
    expect(await voidIt({ returnTo: "price" })).toMatchObject({ ok: true, next: `/admin/sales/${DEAL}/guide/price?from=summary` });
    resetMockWrites();
    await seed();
    expect(await voidIt({ returnTo: "https://evil.example/x" })).toMatchObject({ ok: true, next: `/admin/sales/${DEAL}/summary?voided=1` });
  });

  it("refuses a second void of the same copy", async () => {
    await seed();
    expect((await voidIt()).ok).toBe(true);
    expect(await voidIt()).toMatchObject({ ok: false, code: "voidNothingFiled" });
    expect(await voidIt({ rootId: "bos-old" })).toMatchObject({ ok: false });
  });

  it("is mirrored by the preview store: a voided row is never written again", async () => {
    await seed();
    await voidIt();
    const refused = await createMockSupabaseClient().from("document_agreements").update({ form_data: {} }).eq("id", "bos");
    expect(refused.error).toMatchObject({ code: "42501", message: "voided_document_is_final" });
    expect(rowsOf().find((row) => row.id === "bos")?.form_data).toEqual({ kept: "bos" });
  });
});

describe("refusals write nothing", () => {
  async function refused(code: string, run: () => Promise<unknown>) {
    const result = (await run()) as { ok: boolean; code?: string; error?: string };
    expect(result).toMatchObject({ ok: false, code });
    expect(rowsOf().filter((row) => row.voided_at)).toEqual([]);
    expect(mockInserted("team_activity_events").filter((event) => event.entity_id === DEAL)).toEqual([]);
    return result;
  }

  it.each(["sales", "registration", "finance"])("for the %s role", async (role) => {
    await seed();
    state.role = role;
    const result = await refused("voidNotAllowed", () => voidIt());
    expect(result.error).toBe(VOID_MESSAGES.voidNotAllowed);
  });

  it("for an owner with no roster row: the record must name who voided", async () => {
    await seed();
    state.member = null;
    await refused("voidNeedsTeamRow", () => voidIt());
  });

  it("for a reason of 9 or 501 characters", async () => {
    await seed();
    await refused("voidReasonRequired", () => voidIt({ reason: "123456789" }));
    await refused("voidReasonTooLong", () => voidIt({ reason: "x".repeat(501) }));
  });

  it("until the title question is answered Not Yet", async () => {
    await seed();
    await refused("voidTitleQuestion", () => voidIt({ titleApplication: null }));
    await refused("voidTitleSubmitted", () => voidIt({ titleApplication: "submitted" }));
  });

  it("when a plate was recorded after the bill of sale was filed", async () => {
    await seed({ stepData: { plate: "ABC1234", plateRecordedAt: "2026-10-02T16:00:00.000Z" } });
    await refused("voidTitleFiled", () => voidIt());
  });

  it.each(["completed", "abandoned"])("on a %s sale", async (status) => {
    await seed({ status });
    await refused("voidSaleClosed", () => voidIt());
  });

  it("with nothing filed, or a copy that is not the current one", async () => {
    await seed({ documents: [{ id: "draft", deal_id: DEAL, document_type: "billOfSale", status: "pending" }] });
    await refused("voidNothingFiled", () => voidIt({ rootId: "draft" }));
    resetMockWrites();
    await seed();
    await refused("voidNotCurrent", () => voidIt({ rootId: "t130" }));
  });

  it("when the paperwork cannot be read (fail closed)", async () => {
    await seed();
    state.adminDataFails = true;
    await refused("voidCouldNotCheck", () => voidIt());
  });
});

describe("the database migration", () => {
  const sql = readFileSync("supabase/migrations/20261002000000_void_filed_documents.sql", "utf8");
  const code = sql.replace(/--.*$/gm, "");

  it("adds the seven void columns with no foreign key", () => {
    for (const column of ["voided_at timestamptz", "voided_by uuid", "voided_by_member_id uuid", "voided_by_name text", "void_reason text", "void_group_id uuid", "voided_with_id uuid"]) {
      expect(code).toContain(`add column if not exists ${column};`);
    }
    expect(code).not.toMatch(/void[a-z_]* [a-z]+ references/);
  });

  it("holds the void complete, and finds current rows by index", () => {
    expect(code).toMatch(/add constraint document_agreements_void_complete check/);
    expect(code).toMatch(/char_length\(btrim\(void_reason\)\) between 10 and 500/);
    expect(code).toMatch(/exception when duplicate_object then null/);
    expect(code).toMatch(/idx_document_agreements_deal_current[\s\S]*?where voided_at is null/);
  });

  it("makes a voided row final, in a trigger that fires after the null-expiry one", () => {
    expect(code).toMatch(/create trigger trg_document_agreements_void_is_final before update or delete on public\.document_agreements/);
    expect("trg_document_agreements_null_expiry_on_complete" < "trg_document_agreements_void_is_final").toBe(true);
    expect(code).toMatch(/if old\.voided_at is not null then\s+raise exception 'voided_document_is_final'/);
    expect(code).toMatch(/private\.team_has_permission\('documents:manage'\)/);
    expect(code).toMatch(/to_jsonb\(new\) - v_cols\) is distinct from \(to_jsonb\(old\) - v_cols\)/);
  });

  it("voids in one transaction with every refusal, the signing link and the texted copy", () => {
    const fn = code.slice(code.indexOf("create or replace function public.void_filed_documents"));
    for (const refusal of ["forbidden", "not_voidable", "reason_required", "bad_time", "sale_closed", "not_current", "title_filed"]) {
      expect(fn).toContain(`'${refusal}'`);
    }
    expect(fn).toMatch(/'powerOfAttorney' = any\(p_types\)/);
    expect(fn).toMatch(/security definer set search_path = public/);
    expect(fn).toMatch(/from deals where id = p_deal_id for update/);
    expect(fn).toMatch(/update packet_signing_texts set active = false/);
    expect(fn).toMatch(/insert into paperwork_invite_events[\s\S]*?'revoked'/);
    expect(fn).toMatch(/update paperwork_invites set active = false, revoked_at = now\(\)/);
    expect(fn).toMatch(/insert into team_activity_events[\s\S]*?'sale_documents_voided'/);
    expect(code).toMatch(/revoke all on function public\.void_filed_documents\(uuid, uuid, text\[\], text, timestamptz, jsonb\) from public, anon;/);
    expect(code).toMatch(/grant execute on function public\.void_filed_documents\(uuid, uuid, text\[\], text, timestamptz, jsonb\) to authenticated;/);
  });
});
