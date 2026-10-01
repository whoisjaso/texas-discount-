-- Vega's Auto Sales & Glass Co. — Handle A Sale desk schema.
--
-- One consolidated, additive migration for a NEW Supabase project dedicated to
-- Vega's. Derived from the schema the reference desk runs on, trimmed to what
-- this desk reads and writes. NOT run by the build: the owner applies it
-- (supabase db push) after reviewing it. Nothing here drops or rewrites data.
--
-- Dealer facts do not live in the database; they live in
-- src/lib/dealership-config.ts. The one exception is the business time zone
-- in complete_sale_atomic(), marked below.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Shared trigger
-- ---------------------------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff, roles and permissions
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text unique,
  phone text,
  role text not null default 'viewer' check (role in ('owner','manager','sales','finance','mechanic','registration','social','lot','viewer')),
  language_preference text not null default 'en' check (language_preference in ('en','es')),
  status text not null default 'pending' check (status in ('pending','active','inactive')),
  can_sign_contracts boolean not null default false,
  invited_at timestamptz,
  last_invite_error text,
  signature_data_url text,
  signature_updated_at timestamptz,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  onboarding_completed_at timestamptz,
  approved_email_sent_at timestamptz,
  approved_email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_team_members_email on public.team_members (lower(email));
create index if not exists idx_team_members_role_status on public.team_members (role, status);
create unique index if not exists idx_team_members_username_unique on public.team_members (lower(username)) where username is not null;

create table if not exists public.team_role_permissions (
  role text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);

insert into public.team_role_permissions (role, permission) values
  ('owner','admin:all'),
  ('manager','admin:read'),('manager','documents:deliver'),('manager','documents:manage'),('manager','documents:read'),
  ('manager','inventory:manage'),('manager','inventory:read'),('manager','paperwork:manage'),('manager','paperwork:read'),
  ('manager','payments:manage'),('manager','payments:read'),('manager','sales:manage'),('manager','sales:read'),('manager','team:manage'),
  ('sales','admin:read'),('sales','documents:deliver'),('sales','documents:read'),('sales','inventory:read'),
  ('sales','sales:manage'),('sales','sales:read'),
  ('finance','admin:read'),('finance','documents:read'),('finance','payments:read'),('finance','sales:read'),
  ('registration','admin:read'),('registration','documents:read'),('registration','inventory:read'),
  ('registration','paperwork:manage'),('registration','paperwork:read'),('registration','sales:read'),
  ('lot','admin:read'),('lot','inventory:read'),
  ('mechanic','admin:read'),('mechanic','inventory:read'),
  ('social','admin:read'),('social','inventory:read'),
  ('viewer','admin:read')
on conflict do nothing;

create or replace function private.current_team_role()
returns text language sql stable security definer set search_path = public as $$
  select role from team_members where auth_user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function private.team_has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_role_permissions trp
    where trp.role = private.current_team_role()
      and (trp.permission = 'admin:all' or trp.permission = p_permission)
  )
$$;

create table if not exists public.team_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.team_members(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  body text not null default '',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.sign_in_codes (
  id uuid primary key default gen_random_uuid(),
  email_fingerprint text not null,
  purpose text not null check (purpose in ('sign_in','verify_email')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sign_in_codes_lookup on public.sign_in_codes (email_fingerprint, purpose, created_at desc);

create table if not exists public.reset_request_limits (
  id bigint generated always as identity primary key,
  email_hmac text not null,
  ip text,
  requested_at timestamptz not null default now()
);
create index if not exists reset_limits_email_idx on public.reset_request_limits (email_hmac, requested_at);
create index if not exists reset_limits_ip_idx on public.reset_request_limits (ip, requested_at);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  language text not null default 'en',
  notes text,
  sms_opted_out boolean default false,
  sms_consent_at timestamptz,
  sms_consent_source text,
  sms_consent_status text not null default 'unknown' check (sms_consent_status in ('unknown','granted','revoked')),
  sms_review_hold_at timestamptz,
  sms_review_hold_reason text,
  sms_review_hold_cleared_by uuid,
  profile_data jsonb not null default '{}',
  latest_license_number text,
  latest_license_state text,
  latest_license_expiration date,
  latest_address text,
  latest_insurance jsonb not null default '{}',
  date_of_birth date,
  good_standing_since date,
  late_payment_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_profile_data_gin on public.customers using gin (profile_data);
create index if not exists idx_customers_latest_license_number on public.customers (latest_license_number) where latest_license_number is not null;

-- ---------------------------------------------------------------------------
-- Vehicles (the lot; the public site reads the view below)
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vin text not null unique,
  year integer not null,
  make text not null,
  model text not null,
  trim text,
  slug text not null unique,
  stock_number text,
  price numeric(12,2) not null default 0,
  mileage integer not null default 0,
  status text not null default 'Available' check (status in ('Bidding','Purchased','In_Transit','Arrived','Inspection','Available','Pending','Sold')),
  body_style text,
  exterior_color text,
  interior_color text,
  transmission text,
  drivetrain text,
  engine text,
  fuel_type text,
  description text,
  image_url text,
  gallery text[] default '{}',
  carfax_url text,
  weight_lbs integer,
  title_type text default 'Clean',
  title_status text not null default 'unknown' check (title_status in ('clean','rebuilt_salvage','bonded','salvage_unrebuilt','nonrepairable','export_only','unknown')),
  title_status_verified_at timestamptz,
  title_status_verified_by uuid,
  title_status_evidence text,
  is_rental_fleet boolean default false,
  license_plate text,
  buyer_customer_id uuid references public.customers(id) on delete set null,
  buyer_name text,
  buyer_phone text,
  buyer_id_number text,
  sale_price numeric,
  date_added timestamptz default now(),
  date_listed timestamptz,
  date_sold timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_vehicles_status on public.vehicles (status);
create index if not exists idx_vehicles_buyer_customer_id on public.vehicles (buyer_customer_id) where buyer_customer_id is not null;
create index if not exists vehicles_stock_key_idx on public.vehicles (lower(btrim(stock_number)));
drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Deals: one record per sale. Answers live in step_data; "done" is never stored.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.deal_status as enum ('in_progress','completed','abandoned');
exception when duplicate_object then null; end $$;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.deal_status not null default 'in_progress',
  current_step integer not null default 1 check (current_step between 1 and 9),
  step_data jsonb not null default '{}',
  step_version bigint not null default 0,
  language text not null default 'en' check (language in ('en','es')),
  paperwork_origin text not null default 'corridor' check (paperwork_origin in ('corridor','legacy_paper')),
  created_by uuid references auth.users(id),
  started_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
-- One open sale per car.
create unique index if not exists deals_vehicle_active_idx on public.deals (vehicle_id) where status = 'in_progress';
create index if not exists deals_status_idx on public.deals (status);
create index if not exists deals_created_at_idx on public.deals (created_at desc);
create index if not exists deals_started_at_idx on public.deals (started_at desc);

-- Each writer merges ONE key, compare-and-swap on step_version.
create or replace function public.merge_deal_step_data(
  p_deal_id uuid, p_patch jsonb, p_language text default null, p_expected_version bigint default null)
returns bigint language plpgsql set search_path = public as $$
declare v_new bigint;
begin
  update deals
     set step_data = coalesce(step_data, '{}'::jsonb) || p_patch,
         language = coalesce(p_language, language),
         step_version = step_version + 1
   where id = p_deal_id
     and (p_expected_version is null or step_version = p_expected_version)
  returning step_version into v_new;
  return v_new;
end;
$$;

-- The one visible exception to "facts live in the config": the sale date is
-- the business date. America/Chicago is Houston's zone; change it here and in
-- NEXT_PUBLIC_DEALER_TIME_ZONE together if the owner confirms otherwise.
create or replace function public.complete_sale_atomic(
  p_deal_id uuid, p_buyer_id_number text default null, p_sale_price numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_deal record; v_vehicle record; v_customer record; v_sold_on date;
  v_corrected text := nullif(trim(coalesce(p_buyer_id_number, '')), '');
begin
  if auth.uid() is not null and not private.team_has_permission('sales:manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_sale_price is not null and (p_sale_price < 0 or p_sale_price = 'NaN'::numeric) then
    raise exception 'bad_price';
  end if;
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_vehicle from vehicles where id = v_deal.vehicle_id for update;
  if not found then raise exception 'missing_parties'; end if;
  select * into v_customer from customers where id = v_deal.customer_id;
  if not found then raise exception 'missing_parties'; end if;
  if v_vehicle.buyer_customer_id is not null and v_vehicle.buyer_customer_id <> v_deal.customer_id then
    raise exception 'vehicle_conflict';
  end if;
  v_sold_on := (now() at time zone 'America/Chicago')::date;
  if v_deal.status = 'completed' and v_vehicle.status = 'Sold' and v_vehicle.buyer_customer_id = v_deal.customer_id then
    return jsonb_build_object('vehicle_id', v_deal.vehicle_id, 'customer_id', v_deal.customer_id);
  end if;
  if v_corrected is not null then
    update customers
       set profile_data = coalesce(profile_data, '{}'::jsonb)
             || jsonb_build_object('dealership', coalesce(profile_data->'dealership', '{}'::jsonb)
                || jsonb_build_object('buyerProfile', coalesce(profile_data->'dealership'->'buyerProfile', '{}'::jsonb)
                   || jsonb_build_object('buyerLicense', v_corrected)))
     where id = v_deal.customer_id;
  end if;
  update vehicles
     set status = 'Sold',
         date_sold = coalesce(case when v_vehicle.status = 'Sold' then v_vehicle.date_sold end, v_sold_on),
         buyer_customer_id = v_deal.customer_id,
         buyer_name = v_customer.name,
         buyer_phone = v_customer.phone,
         buyer_id_number = coalesce(v_corrected, v_vehicle.buyer_id_number),
         sale_price = coalesce(p_sale_price, v_vehicle.sale_price)
   where id = v_deal.vehicle_id;
  update deals set status = 'completed', completed_at = coalesce(v_deal.completed_at, now()) where id = p_deal_id;
  return jsonb_build_object('vehicle_id', v_deal.vehicle_id, 'customer_id', v_deal.customer_id);
end;
$$;

-- A car with a sale on it never shows on the public site.
create or replace function private.vehicle_sale_blocked(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((
    select coalesce(v.status = 'Sold', false)
      or v.date_sold is not null
      or v.buyer_customer_id is not null
      or coalesce(v.sale_price, 0) > 0
      or exists (select 1 from public.deals d where d.vehicle_id = v.id)
    from public.vehicles v where v.id = p_vehicle_id
  ), true)
$$;

create or replace view public.public_inventory_vehicles with (security_barrier = true) as
  select make, model, year, price, mileage, vin, status, description, image_url, gallery, slug,
         body_style, exterior_color, interior_color, transmission, drivetrain, engine, fuel_type,
         "trim", title_type, carfax_url, date_added, date_listed, created_at, updated_at
    from public.vehicles v
   where status = 'Available' and coalesce(is_rental_fleet, false) = false and not private.vehicle_sale_blocked(id);
grant select on public.public_inventory_vehicles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Documents: signature evidence lives on the row, inside form_data.
-- ---------------------------------------------------------------------------
create table if not exists public.document_agreements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  parent_agreement_id uuid references public.document_agreements(id) on delete set null,
  document_type text not null check (document_type in (
    'billOfSale','form130U','financing','vehicleResponsibility','insuranceAcknowledgment',
    'powerOfAttorney','rebuiltDisclosure','salvageBillOfSale','towAwayAcknowledgment',
    'buyerResponsibilityStatement','chargebackAcknowledgment')),
  status text not null default 'pending' check (status in ('pending','completed','finalized')),
  state text not null default 'draft' check (state in ('draft','sent','signed','active','default','terminated','completed','filed')),
  language text not null default 'en' check (language in ('en','es')),
  buyer_name text, buyer_email text, buyer_phone text,
  buyer_address text, buyer_city text, buyer_state text, buyer_zip text,
  buyer_license text, buyer_license_state text, buyer_id_photo text,
  co_buyer_name text, co_buyer_email text, co_buyer_phone text, co_buyer_address text,
  co_buyer_city text, co_buyer_state text, co_buyer_zip text, co_buyer_license text, co_buyer_license_state text,
  vehicle_description text,
  vehicle_vin text,
  acknowledgments jsonb default '{}',
  form_data jsonb,
  portal_data jsonb,
  completed_link text,
  has_buyer_signature boolean not null default false,
  has_cobuyer_signature boolean not null default false,
  has_dealer_signature boolean not null default false,
  has_buyer_id boolean not null default false,
  signing_token text unique,
  signing_token_expires_at timestamptz,
  signature_svg text,
  signed_at timestamptz,
  signed_ip text,
  pdf_path text,
  pdf_buyer_path text,
  pdf_dealer_path text,
  agreement_pdf_url text,
  last_emailed_at timestamptz,
  sent_at timestamptz not null default now(),
  expires_at timestamptz default (now() + interval '24 hours'),
  finalized_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_document_agreements_deal_id on public.document_agreements (deal_id) where deal_id is not null;
create index if not exists idx_document_agreements_status on public.document_agreements (status);
create index if not exists idx_document_agreements_sent_at on public.document_agreements (sent_at desc);

create or replace function public.document_agreements_null_expiry_on_complete()
returns trigger language plpgsql as $$
begin
  if new.status in ('completed','finalized') then new.expires_at := null; end if;
  return new;
end;
$$;
drop trigger if exists trg_document_agreements_null_expiry_on_complete on public.document_agreements;
create trigger trg_document_agreements_null_expiry_on_complete before update on public.document_agreements
  for each row execute function public.document_agreements_null_expiry_on_complete();

-- ---------------------------------------------------------------------------
-- Salvage title work, signing texts, paperwork delivery, promises, messaging
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_title_work (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  step text not null check (step in ('ownership','repairs','photos','vtr61','inspection','form130u','county','received')),
  completed_at timestamptz,
  completed_by uuid,
  note text,
  data jsonb not null default '{}',
  files jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_title_work_one_row_per_step unique (vehicle_id, step)
);

create table if not exists public.packet_signing_texts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  recipient_phone text not null,
  token_hash text not null,
  consent_wording_hash text not null,
  issued_by uuid not null,
  active boolean not null default true,
  status text not null default 'pending' check (status in ('pending','accepted','delivered','failed','unknown')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_status_at timestamptz not null default now()
);
create unique index if not exists packet_signing_texts_one_active on public.packet_signing_texts (deal_id) where active;

create table if not exists public.paperwork_invites (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  recipient_phone text not null,
  token_hash text,
  access_code_hash text,
  manifest jsonb not null,
  manifest_hash text not null,
  consent_basis text not null default 'paperwork_delivery' check (consent_basis = 'paperwork_delivery'),
  consent_attested boolean not null default false,
  consent_wording_hash text,
  issued_by uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','delivered','failed')),
  provider_message_id text,
  sent_at timestamptz, accepted_at timestamptz, delivered_at timestamptz, failed_at timestamptz,
  failure_reason text,
  last_webhook_at timestamptz,
  failed_attempts integer not null default 0,
  locked_at timestamptz,
  active boolean not null default true,
  revoked_at timestamptz,
  superseded_by uuid references public.paperwork_invites(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create unique index if not exists paperwork_invites_one_active_per_deal on public.paperwork_invites (deal_id) where active;

create table if not exists public.paperwork_invite_events (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.paperwork_invites(id) on delete restrict,
  event text not null check (event in ('issued','sent','open_attempt','gate_passed','gate_failed','document_viewed','locked','revoked','superseded','auth_material_nulled')),
  detail jsonb,
  at timestamptz not null default now()
);

create table if not exists public.payment_promises (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  installment_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  promised_for date not null,
  quote text not null,
  source text not null check (source in ('sms','desk','portal')),
  captured_by text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'open' check (status in ('open','kept','broken','cancelled')),
  settled_at timestamptz,
  settled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_promises_one_open_idx on public.payment_promises (customer_id) where status = 'open';

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  from_number text not null,
  to_number text not null,
  telnyx_message_id text,
  status text default 'sent',
  provider_status text,
  error_code text,
  error_message text,
  last_status_at timestamptz,
  ai_generated boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  installment_id uuid,
  channel text not null,
  template_key text not null,
  message_body text not null,
  status text not null default 'sent',
  provider_message_id text,
  notification_date date not null default current_date,
  sent_at timestamptz not null default now()
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  business_key text not null unique,
  template text not null,
  recipient_fingerprint text not null,
  language text not null default 'en' check (language in ('en','es')),
  from_identity text not null default 'support' check (from_identity in ('support','documents')),
  state text not null default 'pending' check (state in ('pending','accepted','rejected','sent_unknown','skipped')),
  provider_id text,
  error_code text,
  attempts integer not null default 0,
  delivery_state text,
  delivery_detail text,
  delivered_at timestamptz,
  delivery_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security: staff by permission; anonymous gets nothing except the
-- public inventory view. The buyer's signing page never uses the anon key
-- against these tables: it goes through server actions that verify a signed
-- token and use the service role, scoped to that token's deal.
-- ---------------------------------------------------------------------------
alter table public.team_members enable row level security;
alter table public.team_role_permissions enable row level security;
alter table public.team_activity_events enable row level security;
alter table public.sign_in_codes enable row level security;
alter table public.reset_request_limits enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.deals enable row level security;
alter table public.document_agreements enable row level security;
alter table public.vehicle_title_work enable row level security;
alter table public.packet_signing_texts enable row level security;
alter table public.paperwork_invites enable row level security;
alter table public.paperwork_invite_events enable row level security;
alter table public.payment_promises enable row level security;
alter table public.sms_messages enable row level security;
alter table public.notification_log enable row level security;
alter table public.email_outbox enable row level security;
-- sign_in_codes, reset_request_limits, packet_signing_texts, paperwork_invites,
-- paperwork_invite_events, email_outbox and notification_log have no policies:
-- only the service role (server code) reads or writes them.

create policy "team members: self or team manager" on public.team_members for all to authenticated
  using (private.team_has_permission('team:manage') or auth_user_id = auth.uid())
  with check (private.team_has_permission('team:manage'));
create policy "role permissions: staff read" on public.team_role_permissions for select to authenticated
  using (private.team_has_permission('admin:read'));
create policy "activity: staff read" on public.team_activity_events for select to authenticated
  using (private.team_has_permission('admin:read'));
create policy "activity: staff write" on public.team_activity_events for insert to authenticated
  with check (private.team_has_permission('admin:read'));

create policy customers_select on public.customers for select to authenticated
  using (private.team_has_permission('sales:read') or private.team_has_permission('payments:read'));
create policy customers_insert on public.customers for insert to authenticated
  with check (private.team_has_permission('sales:manage') or private.team_has_permission('payments:manage'));
create policy customers_update on public.customers for update to authenticated
  using (private.team_has_permission('sales:manage') or private.team_has_permission('payments:manage'))
  with check (private.team_has_permission('sales:manage') or private.team_has_permission('payments:manage'));

create policy vehicles_select_team on public.vehicles for select to authenticated
  using (private.team_has_permission('inventory:read') or private.team_has_permission('sales:read'));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (private.team_has_permission('inventory:manage') or private.team_has_permission('sales:manage'));
create policy vehicles_update on public.vehicles for update to authenticated
  using (private.team_has_permission('inventory:manage') or private.team_has_permission('sales:manage'))
  with check (private.team_has_permission('inventory:manage') or private.team_has_permission('sales:manage'));
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (private.team_has_permission('inventory:manage'));

create policy deals_select on public.deals for select to authenticated using (private.team_has_permission('sales:read'));
create policy deals_insert on public.deals for insert to authenticated with check (private.team_has_permission('sales:manage'));
create policy deals_update on public.deals for update to authenticated
  using (private.team_has_permission('sales:manage')) with check (private.team_has_permission('sales:manage'));
create policy deals_delete on public.deals for delete to authenticated using (private.team_has_permission('sales:manage'));

create policy agreements_select on public.document_agreements for select to authenticated
  using (private.team_has_permission('sales:read') or private.team_has_permission('documents:read') or private.team_has_permission('paperwork:read'));
create policy agreements_insert on public.document_agreements for insert to authenticated
  with check (private.team_has_permission('sales:manage') or private.team_has_permission('documents:manage') or private.team_has_permission('paperwork:manage'));
create policy agreements_update on public.document_agreements for update to authenticated
  using (private.team_has_permission('sales:manage') or private.team_has_permission('documents:manage') or private.team_has_permission('paperwork:manage'))
  with check (private.team_has_permission('sales:manage') or private.team_has_permission('documents:manage') or private.team_has_permission('paperwork:manage'));
create policy agreements_delete on public.document_agreements for delete to authenticated
  using (private.team_has_permission('documents:manage'));

create policy title_work_select on public.vehicle_title_work for select to authenticated using (private.team_has_permission('inventory:read'));
create policy title_work_write on public.vehicle_title_work for all to authenticated
  using (private.team_has_permission('inventory:manage')) with check (private.team_has_permission('inventory:manage'));

create policy promises_staff on public.payment_promises for all to authenticated
  using (private.team_has_permission('payments:read') or private.team_has_permission('sales:read'))
  with check (private.team_has_permission('payments:manage') or private.team_has_permission('sales:manage'));
create policy sms_staff on public.sms_messages for select to authenticated
  using (private.team_has_permission('sales:read'));

-- The public site reads available cars through the view only.
create policy "public: available cars only" on public.vehicles for select to anon
  using (status = 'Available' and coalesce(is_rental_fleet, false) = false and not private.vehicle_sale_blocked(id));

-- The desk's packet screen follows the deal live.
do $$ begin
  alter publication supabase_realtime add table public.deals;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Storage: all PRIVATE. Files are served only through signed URLs of 10
-- minutes or less, minted on the server. `documents` has no policies at all:
-- only the service role touches filed PDFs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('buyer-ids', 'buyer-ids', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('documents', 'documents', false, 10485760, array['application/pdf']),
  ('title-work', 'title-work', false, 20971520, array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false;

create policy buyer_ids_select on storage.objects for select to authenticated
  using (bucket_id = 'buyer-ids' and private.team_has_permission('documents:read'));
create policy buyer_ids_write on storage.objects for insert to authenticated
  with check (bucket_id = 'buyer-ids' and private.team_has_permission('documents:manage'));
create policy title_work_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'title-work' and private.team_has_permission('inventory:read'));
create policy title_work_objects_write on storage.objects for insert to authenticated
  with check (bucket_id = 'title-work' and private.team_has_permission('inventory:manage'));
