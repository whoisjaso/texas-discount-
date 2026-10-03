-- Void and file again (owner's decision 10/02/2026).
--
-- Additive. Apply after 20260926000000_discount_sale_desk.sql. NOT run by the
-- build: the owner applies it (supabase db push) after reviewing it. Nothing
-- here drops, deletes or rewrites a document; no dealer fact lives here.
--
-- A filed bill of sale can be voided at the desk by an Owner or a Manager,
-- with a reason. Voiding keeps every row: the voided copies stay readable,
-- marked with who voided them, when and why, and they stop counting toward
-- the packet. Every other current document the bill of sale's figures or
-- buyer details reached is voided with it (never the power of attorney, ink
-- on the county's form). The sale's money and plan can then change, and the
-- documents are filed and signed again.

-- ---------------------------------------------------------------------------
-- The void columns. No foreign keys: a voided row is final, and no foreign
-- key action (a team member or a deal deleted) may ever be forced to write it.
-- ---------------------------------------------------------------------------
alter table public.document_agreements add column if not exists voided_at timestamptz;
alter table public.document_agreements add column if not exists voided_by uuid;            -- the auth user id
alter table public.document_agreements add column if not exists voided_by_member_id uuid;  -- team_members.id
alter table public.document_agreements add column if not exists voided_by_name text;       -- a snapshot of the name
alter table public.document_agreements add column if not exists void_reason text;
alter table public.document_agreements add column if not exists void_group_id uuid;        -- one per void
alter table public.document_agreements add column if not exists voided_with_id uuid;      -- the bill of sale; null on it

do $$ begin
  alter table public.document_agreements add constraint document_agreements_void_complete check (
    (voided_at is null and voided_by is null and voided_by_member_id is null and voided_by_name is null
       and void_reason is null and void_group_id is null and voided_with_id is null)
    or (voided_at is not null and void_reason is not null and void_group_id is not null
       and char_length(btrim(void_reason)) between 10 and 500)
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_document_agreements_deal_current
  on public.document_agreements (deal_id, document_type) where voided_at is null;

-- ---------------------------------------------------------------------------
-- A voided row is final, and only the void function voids.
--
-- 1. No row is ever inserted already voided (a forged "voided" copy would be
--    final at once, and a future void time would kill every signing link).
-- 2. A voided row is never updated or deleted (this also refuses deleting a
--    deal that holds one: its foreign key would set deal_id to null).
-- 3. Voiding needs documents:manage when a signed-in user does it, and is
--    done only through void_filed_documents below: a signed-in session
--    writing voided_at straight through the API (current_user authenticated
--    or anon) is refused, so the cascade, the deal lock, the title evidence,
--    the audit event and the switched-off links can never be skipped, and
--    who voided can never be typed in. The function runs as its owner.
-- 4. The power of attorney is never voided at the desk.
-- 5. Voiding changes only the void columns. expires_at is let through because
--    the null-expiry trigger, which fires first (triggers fire in name order:
--    "trg_document_agreements_null_expiry_on_complete" sorts before
--    "trg_document_agreements_void_is_final"), nulls it on a filed row.
-- ---------------------------------------------------------------------------
create or replace function public.document_agreements_void_is_final()
returns trigger language plpgsql set search_path = public as $$
declare
  v_cols text[] := array['voided_at','voided_by','voided_by_member_id','voided_by_name',
                         'void_reason','void_group_id','voided_with_id','expires_at'];
begin
  if old.voided_at is not null then
    raise exception 'voided_document_is_final' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.voided_at is not null then
    if auth.uid() is not null and not private.team_has_permission('documents:manage') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (to_jsonb(new) - v_cols) is distinct from (to_jsonb(old) - v_cols) then
      raise exception 'voiding_changes_only_the_void' using errcode = '42501';
    end if;
    if current_user in ('authenticated', 'anon') then
      raise exception 'void_through_the_function_only' using errcode = '42501';
    end if;
    if new.document_type = 'powerOfAttorney' then
      raise exception 'not_voidable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_agreements_void_is_final on public.document_agreements;
create trigger trg_document_agreements_void_is_final before update or delete on public.document_agreements
  for each row execute function public.document_agreements_void_is_final();

-- Rule 1: nothing is born voided.
create or replace function public.document_agreements_born_unvoided()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.voided_at is not null or new.voided_by is not null or new.voided_by_member_id is not null
     or new.voided_by_name is not null or new.void_reason is not null or new.void_group_id is not null
     or new.voided_with_id is not null then
    raise exception 'voided_on_insert' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_agreements_born_unvoided on public.document_agreements;
create trigger trg_document_agreements_born_unvoided before insert on public.document_agreements
  for each row execute function public.document_agreements_born_unvoided();

-- ---------------------------------------------------------------------------
-- A document printing the bill of sale's figures is filed only while a
-- current bill of sale is on file, and never at the same moment as a void.
--
-- The desk's filing action refuses this first (billOfSaleFirst); this is the
-- backstop for the race the action cannot see: a contract or 130-U filed
-- while the bill of sale is being voided would otherwise stay current with
-- the voided figures. The deal row is locked FOR SHARE, which waits for the
-- void's FOR UPDATE (and the void waits for this), so the two never cross.
-- Security definer so the lock is taken whatever the filer's role.
-- ---------------------------------------------------------------------------
create or replace function public.document_agreements_need_their_bill_of_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deal_id is not null
     and new.document_type in ('financing', 'form130U', 'vehicleResponsibility', 'towAwayAcknowledgment')
     and (new.finalized_at is not null or new.completed_at is not null or new.status in ('finalized', 'completed')) then
    perform 1 from deals where id = new.deal_id for share;
    if not exists (
      select 1 from document_agreements d
       where d.deal_id = new.deal_id
         and d.voided_at is null
         and d.document_type in ('billOfSale', 'salvageBillOfSale')
         and (d.finalized_at is not null or d.completed_at is not null or d.status in ('finalized', 'completed'))
    ) then
      raise exception 'bill_of_sale_first' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_agreements_need_their_bill_of_sale on public.document_agreements;
create trigger trg_document_agreements_need_their_bill_of_sale before insert on public.document_agreements
  for each row execute function public.document_agreements_need_their_bill_of_sale();

-- ---------------------------------------------------------------------------
-- The void itself, in one transaction.
--
-- Who voided is the caller's own session (auth.uid() and its active roster
-- row), never a name the caller passes: a memberId or memberName in p_detail
-- is overwritten with the session's own. What is voided is fixed here, not
-- chosen by the caller: p_types must be exactly the set below (every corridor
-- document but the power of attorney), so a direct call cannot void the bill
-- of sale alone and leave the contract filed on its figures. The caller must
-- attest that the title application has not gone to the county
-- (p_detail.titleApplication = 'notYet'), which the audit event records.
--
-- p_at is the app's clock, held to within five minutes of the database's,
-- because signing links are dated by the app's clock. The void is dated the
-- later of p_at and the database's clock at the moment of voiding, so a link
-- minted while the void was on its way is dated before it and stops working.
-- ---------------------------------------------------------------------------
create or replace function public.void_filed_documents(
  p_deal_id uuid,
  p_root_id uuid,
  p_types text[],
  p_reason text,
  p_at timestamptz,
  p_detail jsonb default '{}'::jsonb)
returns setof public.document_agreements
language plpgsql security definer set search_path = public as $$
declare
  v_types constant text[] := array['billOfSale', 'salvageBillOfSale', 'financing', 'form130U',
                                    'vehicleResponsibility', 'insuranceAcknowledgment', 'rebuiltDisclosure',
                                    'towAwayAcknowledgment', 'buyerResponsibilityStatement'];
  v_uid uuid := auth.uid();
  v_member record;
  v_deal record;
  v_root record;
  -- Control characters become spaces; invisible format characters (zero
  -- width, bidi overrides, soft hyphen) are dropped, so a reason cannot be
  -- blank-looking or read backwards; whitespace collapses. The app cleans it
  -- the same way (void-bill-of-sale.ts, cleanVoidReason).
  v_reason text := btrim(regexp_replace(
                     regexp_replace(
                       regexp_replace(coalesce(p_reason, ''), '[[:cntrl:]]', ' ', 'g'),
                       '[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]', '', 'g'),
                     '\s+', ' ', 'g'));
  v_group uuid := gen_random_uuid();
  v_at timestamptz;
  v_name text;
  v_plate text;
  v_recorded text;
  v_docs jsonb;
  v_signed integer;
  v_invite record;
begin
  if v_uid is null or not private.team_has_permission('documents:manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id, full_name into v_member
    from team_members where auth_user_id = v_uid and status = 'active' limit 1;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_types is null or 'powerOfAttorney' = any(p_types) or not (p_types @> v_types and v_types @> p_types) then
    raise exception 'not_voidable';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'reason_required';
  end if;
  if p_at is null or abs(extract(epoch from (p_at - now()))) > 300 then
    raise exception 'bad_time';
  end if;
  if coalesce(p_detail->>'titleApplication', '') <> 'notYet' then
    raise exception 'title_question';
  end if;

  select * into v_deal from deals where id = p_deal_id for update;
  if not found then
    raise exception 'not_current';
  end if;
  if v_deal.status::text <> 'in_progress' then
    raise exception 'sale_closed';
  end if;

  select * into v_root from document_agreements where id = p_root_id for update;
  if not found
     or v_root.deal_id is distinct from p_deal_id
     or v_root.voided_at is not null
     or not (v_root.finalized_at is not null or v_root.completed_at is not null
             or v_root.status in ('finalized', 'completed'))
     or v_root.document_type not in ('billOfSale', 'salvageBillOfSale') then
    raise exception 'not_current';
  end if;

  -- The desk's evidence that the title application went to the county: a
  -- plate recorded at or after the bill of sale was filed. No recorded time,
  -- or one nobody can read, counts as evidence.
  v_plate := nullif(btrim(coalesce(v_deal.step_data->>'plate', '')), '');
  if v_plate is not null then
    v_recorded := nullif(btrim(coalesce(v_deal.step_data->>'plateRecordedAt', '')), '');
    if v_recorded is null then
      raise exception 'title_filed';
    end if;
    begin
      if v_recorded::timestamptz >= coalesce(v_root.finalized_at, v_root.completed_at, v_root.created_at) then
        raise exception 'title_filed';
      end if;
    exception when others then
      raise exception 'title_filed';
    end;
  end if;

  v_name := coalesce(nullif(btrim(v_member.full_name), ''), (select email from auth.users where id = v_uid), 'A team member');

  -- Every row the void takes is locked before it is read, so the audit's
  -- "was it signed" is what was voided, not what was true a moment earlier.
  perform 1 from document_agreements
   where deal_id = p_deal_id
     and voided_at is null
     and document_type = any(v_types)
     and (finalized_at is not null or completed_at is not null or status in ('finalized', 'completed'))
   for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'type', document_type,
           'signed', (coalesce(has_buyer_signature, false) or signed_at is not null),
           'filed_at', coalesce(finalized_at, completed_at, created_at)) order by created_at), '[]'::jsonb),
         count(*) filter (where coalesce(has_buyer_signature, false) or signed_at is not null)
    into v_docs, v_signed
    from document_agreements
   where deal_id = p_deal_id
     and voided_at is null
     and document_type = any(v_types)
     and (finalized_at is not null or completed_at is not null or status in ('finalized', 'completed'));

  v_at := greatest(p_at, clock_timestamp());

  return query
    update document_agreements d
       set voided_at = v_at,
           voided_by = v_uid,
           voided_by_member_id = v_member.id,
           voided_by_name = v_name,
           void_reason = v_reason,
           void_group_id = v_group,
           voided_with_id = case when d.id = p_root_id then null else p_root_id end
     where d.deal_id = p_deal_id
       and d.voided_at is null
       and d.document_type = any(v_types)
       and (d.finalized_at is not null or d.completed_at is not null or d.status in ('finalized', 'completed'))
    returning d.*;

  -- The old signing links stop working: the texted one is deactivated here,
  -- and every token issued at or before the void is refused by the app.
  update packet_signing_texts set active = false where deal_id = p_deal_id and active;

  -- A texted copy of the old paperwork is revoked, with the reason.
  for v_invite in select id from paperwork_invites where deal_id = p_deal_id and active loop
    insert into paperwork_invite_events (invite_id, event, detail)
      values (v_invite.id, 'revoked', jsonb_build_object('reason', 'documents_voided', 'void_group', v_group));
    update paperwork_invites set active = false, revoked_at = now() where id = v_invite.id;
  end loop;

  insert into team_activity_events (actor_id, event_type, entity_type, entity_id, body, metadata)
  values (
    v_member.id,
    'sale_documents_voided',
    'deal',
    p_deal_id,
    v_name || ' voided the filed ' || v_root.document_type || ' and ' || greatest(jsonb_array_length(v_docs) - 1, 0)
      || ' other document(s): ' || v_reason,
    (coalesce(p_detail, '{}'::jsonb) - 'memberId' - 'memberName') || jsonb_build_object(
      'memberId', v_member.id,
      'memberName', v_name,
      'void_group', v_group,
      'reason', v_reason,
      'root_id', p_root_id,
      'root_type', v_root.document_type,
      'voided_at', v_at,
      'documents', v_docs,
      'signed_count', v_signed));
end;
$$;

revoke all on function public.void_filed_documents(uuid, uuid, text[], text, timestamptz, jsonb) from public, anon;
grant execute on function public.void_filed_documents(uuid, uuid, text[], text, timestamptz, jsonb) to authenticated;

-- ===========================================================================
-- A password reset signs out every device (owner's decision 10/02/2026).
--
-- The desk refuses a session that signed in before the account's last reset
-- (app_metadata.password_reset_at; password-reset-cutoff.ts). These two make
-- the database refuse it too, so a stale device cannot go around the desk
-- with the public key and its old tokens:
--
-- 1. end_sessions_before: the owner's reset deletes every auth session the
--    account started before the reset, which ends their refresh tokens (they
--    cascade with the session). Service role only; the desk calls it from
--    every path that stamps password_reset_at, as a best effort.
-- 2. private.session_predates_reset: a signed-in request whose session first
--    authenticated (the earliest amr time in its JWT) more than 3 seconds
--    before the account's last reset holds no team role, so every policy and
--    the void function refuse it. No amr time (an older token format), no
--    reset recorded, or a reset nobody can read as a time: no change. An
--    access token issued before the reset therefore stops working here at
--    once, not only when it expires.
-- ===========================================================================
create or replace function public.end_sessions_before(p_user uuid, p_at timestamptz)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
begin
  if p_user is null or p_at is null then
    return 0;
  end if;
  delete from auth.sessions where user_id = p_user and created_at < p_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.end_sessions_before(uuid, timestamptz) from public;
do $$ begin
  revoke all on function public.end_sessions_before(uuid, timestamptz) from anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.end_sessions_before(uuid, timestamptz) to service_role';
  end if;
end $$;

create or replace function private.session_predates_reset()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_raw text := coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                         nullif(current_setting('request.jwt.claims', true), ''));
  v_amr jsonb;
  v_first double precision;
  v_reset text;
  v_reset_at timestamptz;
begin
  if v_raw is null or auth.uid() is null then
    return false;
  end if;
  v_amr := v_raw::jsonb -> 'amr';
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    return false;
  end if;
  select min((e->>'timestamp')::double precision) into v_first
    from jsonb_array_elements(v_amr) e
   where jsonb_typeof(e) = 'object' and coalesce(e->>'timestamp', '') ~ '^[0-9]+(\.[0-9]+)?$';
  if v_first is null then
    return false;
  end if;
  select raw_app_meta_data->>'password_reset_at' into v_reset from auth.users where id = auth.uid();
  if v_reset is null or btrim(v_reset) = '' then
    return false;
  end if;
  begin
    v_reset_at := v_reset::timestamptz;
  exception when others then
    return false;
  end;
  return to_timestamp(v_first) < v_reset_at - interval '3 seconds';
end;
$$;

create or replace function private.current_team_role()
returns text language sql stable security definer set search_path = public as $$
  select role from team_members
   where auth_user_id = auth.uid() and status = 'active' and not private.session_predates_reset()
   limit 1
$$;
