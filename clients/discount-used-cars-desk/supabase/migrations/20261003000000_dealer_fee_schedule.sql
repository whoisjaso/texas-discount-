-- Dealer fees set at owner onboarding, with the Texas limits enforced.
--
-- Additive. Apply after 20261002000001_vehicle_empty_weight.sql. NOT run by
-- the build: the owner applies it (supabase db push) after reviewing it.
-- Nothing here drops, deletes or rewrites existing data.
--
-- The one dealer fact held in the database. Every other dealer fact lives in
-- src/lib/dealership-config.ts. The documentary fee (with the OCCC filing,
-- dealer-deputy and inventory-tax answers beside it) is the exception because
-- an owner sets it in the desk itself, at first sign-in (Your Fees) or under
-- /admin/dealership/fees, like the signature: set once, used on every sale,
-- and every change kept on record. The environment value stays the seed
-- until an owner saves one.
--
-- The limits are the rulebook's (premium-dealer-build skill,
-- references/texas-dealer-fees.md, as of 2026-10-03), mirrored in
-- src/lib/legal/texas-dealer-fees.ts; a test pins the constants below to it:
--
--   documentary fee   at most 22500 cents ($225.00, presumed reasonable,
--                     7 TAC §84.205(b)(1), eff. 2024-07-11), unless a
--                     complete OCCC filing is recorded; never above the
--                     filed maximum (§84.205(c), (d); Fin. Code §348.006(e)).
--   deputy title fee  at most 1000 cents ($10.00), only for a dealer the
--                     county deputized (43 TAC §217.168(b)(2), eff. 2025-07-01).
--   inventory tax     only for a dealer in business on January 1, by its
--                     unit property tax factor (Tax Code §23.121-.122).
--
-- Texas has no combined cap on dealer fees (rulebook section 4); each limit is
-- enforced on its own. Nothing is trimmed: an over-limit figure is refused.
--
-- 1. dealer_fee_schedule: one row (the desk is one dealership). Read by any
--    role that reads sales; written ONLY through save_dealer_fee_schedule, so
--    no save can skip the audit. Never deleted.
-- 2. dealer_fee_schedule_changes: who changed what, when, from what to what.
--    Append only: never updated, never deleted. Read by the owner.
-- 3. save_dealer_fee_schedule: owner only, compare-and-set on the version,
--    validated with the same codes as the desk's validator (fee-schedule.ts),
--    then the CHECK constraints enforce the caps again. One transaction.
-- 4. dealer_fee_record: the doc fee and OCCC filing a given version saved,
--    for the filing's tamper check, readable by the roles that file.
-- 5. deal_fee_copy_guard: a sale's own copy of its fees (deals.step_data
--    ->'fees') can only ever be the schedule as it stands when the copy is
--    written, whoever writes it. The desk's server writes as the signed-in
--    person's session, so the database cannot tell the server from a browser
--    holding the same session; it checks what is written instead.

-- ---------------------------------------------------------------------------
-- 1. The schedule
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_fee_schedule (
  id smallint primary key default 1 check (id = 1),
  version integer not null check (version >= 1),
  doc_fee_cents integer not null check (doc_fee_cents >= 0),
  occc_filed_max_cents integer,
  occc_filed_on date,
  occc_effective_on date,
  occc_license_or_nmls text check (occc_license_or_nmls is null or char_length(occc_license_or_nmls) between 1 and 120),
  occc_location text check (occc_location is null or char_length(occc_location) between 1 and 120),
  writes_finance_contracts boolean,
  nmls_id text check (nmls_id is null or char_length(nmls_id) <= 120),
  legacy_license text check (legacy_license is null or char_length(legacy_license) <= 120),
  is_dealer_deputy boolean not null default false,
  deputy_fee_cents integer not null default 0 check (deputy_fee_cents between 0 and 1000),
  vit_year integer,
  vit_in_business_jan1 boolean,
  vit_passes_through boolean,
  vit_unit_factor numeric check (vit_unit_factor is null or (vit_unit_factor >= 0 and vit_unit_factor < 1)),
  finances_ch345 boolean,
  rulebook_as_of date not null,
  updated_by uuid references public.team_members(id) on delete set null,
  updated_by_name text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- The OCCC filing is whole or absent, and exists only above $225.00.
  constraint dealer_fee_schedule_occc_whole check (
    num_nonnulls(occc_filed_max_cents, occc_filed_on, occc_effective_on, occc_license_or_nmls, occc_location) in (0, 5)
  ),
  constraint dealer_fee_schedule_occc_above_presumed check (occc_filed_max_cents is null or occc_filed_max_cents > 22500),
  -- A filing takes effect only once the OCCC receives it (§84.205(c)(3)).
  constraint dealer_fee_schedule_occc_dates check (occc_filed_on is null or occc_effective_on >= occc_filed_on),
  -- The documentary fee: $225.00, or never above the filed maximum.
  constraint dealer_fee_schedule_doc_fee_limit check (
    doc_fee_cents <= 22500 or (occc_filed_max_cents is not null and doc_fee_cents <= occc_filed_max_cents)
  ),
  -- No deputy fee without deputy status.
  constraint dealer_fee_schedule_deputy_only check (deputy_fee_cents = 0 or is_dealer_deputy),
  -- The inventory tax: January 1 status first, and a factor to pass it on.
  constraint dealer_fee_schedule_vit_needs_jan1 check (
    (coalesce(vit_passes_through, false) = false and vit_unit_factor is null)
    or vit_in_business_jan1 is true
  ),
  constraint dealer_fee_schedule_vit_factor check (coalesce(vit_passes_through, false) = false or vit_unit_factor is not null)
);

drop trigger if exists trg_dealer_fee_schedule_updated_at on public.dealer_fee_schedule;
create trigger trg_dealer_fee_schedule_updated_at before update on public.dealer_fee_schedule
  for each row execute function public.update_updated_at();

-- Never deleted: a sale's fee copy names the version it came from.
create or replace function public.dealer_fee_schedule_is_kept()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'fee_schedule_is_kept' using errcode = '42501';
end;
$$;

drop trigger if exists trg_dealer_fee_schedule_is_kept on public.dealer_fee_schedule;
create trigger trg_dealer_fee_schedule_is_kept before delete on public.dealer_fee_schedule
  for each row execute function public.dealer_fee_schedule_is_kept();

-- ---------------------------------------------------------------------------
-- 2. The change log. No foreign keys: a change row is final, and no foreign
--    key action (a team member deleted) may ever be forced to write it.
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_fee_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  changed_by uuid,              -- team_members.id
  changed_by_name text not null, -- a snapshot of the name
  source text not null check (source in ('onboarding', 'settings')),
  previous jsonb,               -- null on the first save
  next jsonb not null,          -- includes next.version
  rulebook_as_of date not null
);
create index if not exists idx_dealer_fee_schedule_changes_at on public.dealer_fee_schedule_changes (changed_at desc);
-- One change row per version: two saves that both read version N can never
-- both log N + 1 (the second rolls back whole).
create unique index if not exists idx_dealer_fee_schedule_changes_version on public.dealer_fee_schedule_changes (((next->>'version')::integer));

create or replace function public.dealer_fee_schedule_changes_are_final()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'fee_change_is_final' using errcode = '42501';
end;
$$;

drop trigger if exists trg_dealer_fee_schedule_changes_are_final on public.dealer_fee_schedule_changes;
create trigger trg_dealer_fee_schedule_changes_are_final before update or delete on public.dealer_fee_schedule_changes
  for each row execute function public.dealer_fee_schedule_changes_are_final();

-- ---------------------------------------------------------------------------
-- Row level security. Reads only: there is no insert, update or delete
-- policy on either table, so a signed-in session writes them only through
-- the function below.
-- ---------------------------------------------------------------------------
alter table public.dealer_fee_schedule enable row level security;
alter table public.dealer_fee_schedule_changes enable row level security;

-- Readable by every active team member. The documentary fee is printed on
-- every bill of sale and posted where sales close, so it is no secret, and a
-- row hidden from a role would read as "no owner schedule" and fall back to
-- the config seed: every role that can reach a screen sees the same fees.
drop policy if exists "fee schedule: sales read" on public.dealer_fee_schedule;
drop policy if exists "fee schedule: team read" on public.dealer_fee_schedule;
create policy "fee schedule: team read" on public.dealer_fee_schedule for select to authenticated
  using (private.current_team_role() is not null);

drop policy if exists "fee changes: owner read" on public.dealer_fee_schedule_changes;
create policy "fee changes: owner read" on public.dealer_fee_schedule_changes for select to authenticated
  using (private.team_has_permission('admin:all'));

-- ---------------------------------------------------------------------------
-- 3. The save. Who saved is the caller's own session (auth.uid() and its
--    active roster row), never a name the caller passes. p_expected_version
--    is the version the screen read (0 when there was none): a stale screen
--    is refused ('stale') rather than overwriting a save it never saw.
--    Refusals are raised with the desk's own codes.
-- ---------------------------------------------------------------------------
create or replace function public.save_dealer_fee_schedule(
  p_expected_version integer,
  p_next jsonb,
  p_source text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_member record;
  v_row public.dealer_fee_schedule%rowtype;
  v_found boolean;
  v_current integer;
  v_name text;
  v_doc integer;
  v_filing jsonb;
  v_max integer := null;
  v_filed_on date := null;
  v_effective_on date := null;
  v_licence text := null;
  v_location text := null;
  v_deputy jsonb;
  v_is_deputy boolean;
  v_deputy_fee integer;
  v_vit jsonb;
  v_vit_year integer;
  v_jan1 boolean;
  v_passes boolean;
  v_factor numeric;
  v_writes boolean;
  v_ch345 boolean;
  v_nmls text;
  v_legacy text;
  v_asof date;
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_previous jsonb;
  v_next jsonb;
  v_body text;
begin
  if v_uid is null or not private.team_has_permission('admin:all') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id, full_name into v_member
    from team_members where auth_user_id = v_uid and status = 'active' limit 1;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('onboarding', 'settings') then
    raise exception 'bad_source';
  end if;
  if p_next is null or jsonb_typeof(p_next) <> 'object' then
    raise exception 'docFeeRequired';
  end if;

  -- No fee the schedule does not know: nothing slips in under another name.
  if exists (select 1 from jsonb_object_keys(p_next) k
              where k not in ('docFeeCents', 'occcFiling', 'writesFinanceContracts', 'nmlsId', 'legacyLicense',
                              'deputy', 'vit', 'financesCh345', 'rulebookAsOf')) then
    raise exception 'unknownField';
  end if;

  -- The documentary fee: whole cents, zero or more.
  if p_next->'docFeeCents' is null or jsonb_typeof(p_next->'docFeeCents') = 'null' then
    raise exception 'docFeeRequired';
  end if;
  if jsonb_typeof(p_next->'docFeeCents') <> 'number'
     or (p_next->>'docFeeCents')::numeric <> trunc((p_next->>'docFeeCents')::numeric)
     or (p_next->>'docFeeCents')::numeric < 0
     or (p_next->>'docFeeCents')::numeric > 2147483647 then
    raise exception 'feeNotDollars';
  end if;
  v_doc := (p_next->>'docFeeCents')::integer;

  -- The OCCC filing: whole or absent, and only above $225.00.
  v_filing := p_next->'occcFiling';
  if v_filing is not null and jsonb_typeof(v_filing) <> 'null' then
    if jsonb_typeof(v_filing) <> 'object' then
      raise exception 'occcFilingIncomplete';
    end if;
    if exists (select 1 from jsonb_object_keys(v_filing) k
                where k not in ('maxCents', 'filedOn', 'effectiveOn', 'licenseOrNmls', 'location')) then
      raise exception 'unknownField';
    end if;
    if jsonb_typeof(v_filing->'maxCents') is distinct from 'number'
       or (v_filing->>'maxCents')::numeric <> trunc((v_filing->>'maxCents')::numeric)
       or (v_filing->>'maxCents')::numeric <= 0
       or (v_filing->>'maxCents')::numeric > 2147483647
       or coalesce(v_filing->>'filedOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(v_filing->>'effectiveOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or btrim(coalesce(v_filing->>'licenseOrNmls', '')) = ''
       or btrim(coalesce(v_filing->>'location', '')) = '' then
      raise exception 'occcFilingIncomplete';
    end if;
    begin
      v_filed_on := (v_filing->>'filedOn')::date;
      v_effective_on := (v_filing->>'effectiveOn')::date;
    exception when others then
      raise exception 'occcFilingIncomplete';
    end;
    v_max := (v_filing->>'maxCents')::integer;
    v_licence := btrim(v_filing->>'licenseOrNmls');
    v_location := btrim(v_filing->>'location');
    if char_length(v_licence) > 120 or char_length(v_location) > 120 then
      raise exception 'textTooLong';
    end if;
    if v_max <= 22500 then
      raise exception 'occcFilingNotHigher';
    end if;
    -- Filed on or before today (the business date), and in effect no
    -- earlier than it was filed (7 TAC §84.205(c)(3)).
    if v_filed_on > v_today then
      raise exception 'occcFilingInFuture';
    end if;
    if v_effective_on < v_filed_on then
      raise exception 'occcFilingDatesOutOfOrder';
    end if;
    -- Saved ahead of its effective date, it raises nothing until then
    -- (§84.205(c)(5)(A)): no fee above $225.00 meanwhile.
    if v_effective_on > v_today and v_doc > 22500 then
      raise exception 'occcFilingNotYetEffective';
    end if;
  end if;

  if v_doc > 22500 and v_max is null then
    raise exception 'docFeeOverPresumed';
  end if;
  if v_max is not null and v_doc > v_max then
    raise exception 'docFeeOverFiled';
  end if;

  -- The dealer deputy title fee: only a deputy, $10.00 at most.
  v_deputy := coalesce(p_next->'deputy', '{}'::jsonb);
  if jsonb_typeof(v_deputy) <> 'object' then
    raise exception 'feeNotDollars';
  end if;
  if exists (select 1 from jsonb_object_keys(v_deputy) k where k not in ('isDeputy', 'feeCents')) then
    raise exception 'unknownField';
  end if;
  v_is_deputy := coalesce((v_deputy->>'isDeputy')::boolean, false);
  if v_deputy->'feeCents' is not null and jsonb_typeof(v_deputy->'feeCents') <> 'null'
     and (jsonb_typeof(v_deputy->'feeCents') <> 'number'
          or (v_deputy->>'feeCents')::numeric <> trunc((v_deputy->>'feeCents')::numeric)
          or (v_deputy->>'feeCents')::numeric < 0
          or (v_deputy->>'feeCents')::numeric > 2147483647) then
    raise exception 'feeNotDollars';
  end if;
  v_deputy_fee := coalesce((v_deputy->>'feeCents')::integer, 0);
  if v_deputy_fee > 0 and not v_is_deputy then
    raise exception 'deputyFeeWithoutDeputy';
  end if;
  if v_deputy_fee > 1000 then
    raise exception 'deputyFeeOverLimit';
  end if;

  -- The inventory tax: January 1 first, then a factor to pass it on.
  v_vit := coalesce(p_next->'vit', '{}'::jsonb);
  if jsonb_typeof(v_vit) <> 'object' then
    raise exception 'vitFactorInvalid';
  end if;
  if exists (select 1 from jsonb_object_keys(v_vit) k
              where k not in ('year', 'inBusinessJan1', 'passesThrough', 'unitFactor')) then
    raise exception 'unknownField';
  end if;
  v_vit_year := nullif(v_vit->>'year', '')::integer;
  v_jan1 := (v_vit->>'inBusinessJan1')::boolean;
  v_passes := (v_vit->>'passesThrough')::boolean;
  if v_vit->'unitFactor' is not null and jsonb_typeof(v_vit->'unitFactor') <> 'null' then
    if jsonb_typeof(v_vit->'unitFactor') <> 'number'
       or (v_vit->>'unitFactor')::numeric < 0
       or (v_vit->>'unitFactor')::numeric >= 1 then
      raise exception 'vitFactorInvalid';
    end if;
    v_factor := (v_vit->>'unitFactor')::numeric;
  end if;
  if (coalesce(v_passes, false) or v_factor is not null) and v_jan1 is not true then
    raise exception 'vitNeedsJan1';
  end if;
  if coalesce(v_passes, false) and v_factor is null then
    raise exception 'vitFactorMissing';
  end if;

  v_writes := (p_next->>'writesFinanceContracts')::boolean;
  v_ch345 := (p_next->>'financesCh345')::boolean;
  v_nmls := nullif(btrim(coalesce(p_next->>'nmlsId', '')), '');
  v_legacy := nullif(btrim(coalesce(p_next->>'legacyLicense', '')), '');
  if char_length(coalesce(v_nmls, '')) > 120 or char_length(coalesce(v_legacy, '')) > 120 then
    raise exception 'textTooLong';
  end if;
  begin
    v_asof := (p_next->>'rulebookAsOf')::date;
  exception when others then
    v_asof := null;
  end;
  if v_asof is null then
    raise exception 'bad_rulebook';
  end if;

  -- Compare and set: the version the screen read must still be current.
  -- One save at a time, including the very first (a missing row takes no
  -- row lock), so a second save that read the same version is 'stale'.
  perform pg_advisory_xact_lock(hashtext('public.dealer_fee_schedule'));
  select * into v_row from dealer_fee_schedule where id = 1 for update;
  v_found := found;
  v_current := case when v_found then v_row.version else 0 end;
  if p_expected_version is distinct from v_current then
    raise exception 'stale';
  end if;

  v_name := coalesce(nullif(btrim(v_member.full_name), ''), (select email from auth.users where id = v_uid), 'An owner');

  v_previous := case when not v_found then null else jsonb_build_object(
    'version', v_row.version,
    'docFeeCents', v_row.doc_fee_cents,
    'occcFiling', case when v_row.occc_filed_max_cents is null then 'null'::jsonb else jsonb_build_object(
      'maxCents', v_row.occc_filed_max_cents,
      'filedOn', to_char(v_row.occc_filed_on, 'YYYY-MM-DD'),
      'effectiveOn', to_char(v_row.occc_effective_on, 'YYYY-MM-DD'),
      'licenseOrNmls', v_row.occc_license_or_nmls,
      'location', v_row.occc_location) end,
    'writesFinanceContracts', v_row.writes_finance_contracts,
    'nmlsId', v_row.nmls_id,
    'legacyLicense', v_row.legacy_license,
    'deputy', jsonb_build_object('isDeputy', v_row.is_dealer_deputy, 'feeCents', v_row.deputy_fee_cents),
    'vit', jsonb_build_object('year', v_row.vit_year, 'inBusinessJan1', v_row.vit_in_business_jan1,
                              'passesThrough', v_row.vit_passes_through, 'unitFactor', v_row.vit_unit_factor),
    'financesCh345', v_row.finances_ch345) end;

  v_next := jsonb_build_object(
    'version', v_current + 1,
    'docFeeCents', v_doc,
    'occcFiling', case when v_max is null then 'null'::jsonb else jsonb_build_object(
      'maxCents', v_max,
      'filedOn', to_char(v_filed_on, 'YYYY-MM-DD'),
      'effectiveOn', to_char(v_effective_on, 'YYYY-MM-DD'),
      'licenseOrNmls', v_licence,
      'location', v_location) end,
    'writesFinanceContracts', v_writes,
    'nmlsId', v_nmls,
    'legacyLicense', v_legacy,
    'deputy', jsonb_build_object('isDeputy', v_is_deputy, 'feeCents', v_deputy_fee),
    'vit', jsonb_build_object('year', v_vit_year, 'inBusinessJan1', v_jan1, 'passesThrough', v_passes, 'unitFactor', v_factor),
    'financesCh345', v_ch345);

  insert into dealer_fee_schedule (
    id, version, doc_fee_cents, occc_filed_max_cents, occc_filed_on, occc_effective_on, occc_license_or_nmls,
    occc_location, writes_finance_contracts, nmls_id, legacy_license, is_dealer_deputy, deputy_fee_cents, vit_year,
    vit_in_business_jan1, vit_passes_through, vit_unit_factor, finances_ch345, rulebook_as_of, updated_by, updated_by_name)
  values (
    1, v_current + 1, v_doc, v_max, v_filed_on, v_effective_on, v_licence,
    v_location, v_writes, v_nmls, v_legacy, v_is_deputy, v_deputy_fee, v_vit_year,
    v_jan1, v_passes, v_factor, v_ch345, v_asof, v_member.id, v_name)
  on conflict (id) do update set
    version = excluded.version,
    doc_fee_cents = excluded.doc_fee_cents,
    occc_filed_max_cents = excluded.occc_filed_max_cents,
    occc_filed_on = excluded.occc_filed_on,
    occc_effective_on = excluded.occc_effective_on,
    occc_license_or_nmls = excluded.occc_license_or_nmls,
    occc_location = excluded.occc_location,
    writes_finance_contracts = excluded.writes_finance_contracts,
    nmls_id = excluded.nmls_id,
    legacy_license = excluded.legacy_license,
    is_dealer_deputy = excluded.is_dealer_deputy,
    deputy_fee_cents = excluded.deputy_fee_cents,
    vit_year = excluded.vit_year,
    vit_in_business_jan1 = excluded.vit_in_business_jan1,
    vit_passes_through = excluded.vit_passes_through,
    vit_unit_factor = excluded.vit_unit_factor,
    finances_ch345 = excluded.finances_ch345,
    rulebook_as_of = excluded.rulebook_as_of,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name;

  insert into dealer_fee_schedule_changes (changed_by, changed_by_name, source, previous, next, rulebook_as_of)
  values (v_member.id, v_name, p_source, v_previous, v_next, v_asof);

  v_body := v_name || ' set the documentary fee to $' || to_char(v_doc / 100.0, 'FM999,999,990.00') || ' (was '
    || case when not v_found then 'not set' else '$' || to_char(v_row.doc_fee_cents / 100.0, 'FM999,999,990.00') end
    || ').';
  insert into team_activity_events (actor_id, event_type, entity_type, entity_id, body, metadata)
  values (v_member.id, 'dealer_fees_saved', 'dealer_fee_schedule', null, v_body,
          jsonb_build_object('previous', v_previous, 'next', v_next, 'source', p_source, 'version', v_current + 1));

  return v_current + 1;
end;
$$;

revoke all on function public.save_dealer_fee_schedule(integer, jsonb, text) from public, anon;
grant execute on function public.save_dealer_fee_schedule(integer, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What a saved version said, for the filing's tamper check: the doc fee
--    and the OCCC filing that version saved, or null when no such version
--    exists. Readable by the roles that file paperwork, without opening the
--    whole change log to them.
-- ---------------------------------------------------------------------------
create or replace function public.dealer_fee_record(p_version integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_next jsonb;
begin
  if auth.uid() is null or not (private.team_has_permission('sales:read') or private.team_has_permission('paperwork:read')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select next into v_next from dealer_fee_schedule_changes
   where (next->>'version')::integer = p_version
   order by changed_at desc limit 1;
  if v_next is null then
    return null;
  end if;
  return jsonb_build_object('version', v_next->'version', 'docFeeCents', v_next->'docFeeCents', 'occcFiling', v_next->'occcFiling');
end;
$$;

revoke all on function public.dealer_fee_record(integer) from public, anon;
grant execute on function public.dealer_fee_record(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A sale's copy of its fees is the schedule's, whoever writes it.
--
--    The copy (deals.step_data->'fees', fee-schedule.ts) is written at Start
--    A Sale, by "Apply Today's Fees", and once on a sale started before
--    copies existed. Each time it is the schedule as it stands. A copy that
--    changes is refused unless it names the current version with that
--    version's documentary fee and OCCC filing (or, before any owner save,
--    version 0 from the config seed, which the filing checks against the
--    desk's own configuration). Removing a copy is allowed: a sale with no
--    copy resolves to the current schedule or, once a bill of sale is filed,
--    to the fees that paper printed.
-- ---------------------------------------------------------------------------
create or replace function public.deal_fee_copy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := new.step_data->'fees';
  v_old jsonb := case when tg_op = 'UPDATE' then old.step_data->'fees' else null end;
  v_row public.dealer_fee_schedule%rowtype;
  v_filing jsonb;
begin
  if v_new is null or jsonb_typeof(v_new) = 'null' then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_old is not distinct from v_new then
    return new;
  end if;
  if jsonb_typeof(v_new) <> 'object'
     or jsonb_typeof(v_new->'scheduleVersion') is distinct from 'number'
     or (jsonb_typeof(v_new->'docFee') is distinct from 'number' and jsonb_typeof(v_new->'docFee') is distinct from 'null') then
    raise exception 'fees_protected' using errcode = '42501';
  end if;
  select * into v_row from dealer_fee_schedule where id = 1;
  if not found then
    if (v_new->>'scheduleVersion')::numeric <> 0 or v_new->>'source' is distinct from 'config' then
      raise exception 'fees_protected' using errcode = '42501';
    end if;
    return new;
  end if;
  v_filing := v_new->'occcFiling';
  if (v_new->>'scheduleVersion')::numeric <> v_row.version
     or v_new->>'source' is distinct from 'owner'
     or jsonb_typeof(v_new->'docFee') is distinct from 'number'
     or round((v_new->>'docFee')::numeric * 100) <> v_row.doc_fee_cents then
    raise exception 'fees_protected' using errcode = '42501';
  end if;
  if v_row.occc_filed_max_cents is null then
    if v_filing is not null and jsonb_typeof(v_filing) <> 'null' then
      raise exception 'fees_protected' using errcode = '42501';
    end if;
  elsif v_filing is null or jsonb_typeof(v_filing) <> 'object'
     or (v_filing->>'maxCents') is distinct from v_row.occc_filed_max_cents::text
     or (v_filing->>'filedOn') is distinct from to_char(v_row.occc_filed_on, 'YYYY-MM-DD')
     or (v_filing->>'effectiveOn') is distinct from to_char(v_row.occc_effective_on, 'YYYY-MM-DD')
     or (v_filing->>'licenseOrNmls') is distinct from v_row.occc_license_or_nmls
     or (v_filing->>'location') is distinct from v_row.occc_location then
    raise exception 'fees_protected' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deal_fee_copy_guard on public.deals;
create trigger trg_deal_fee_copy_guard before insert or update of step_data on public.deals
  for each row execute function public.deal_fee_copy_guard();
