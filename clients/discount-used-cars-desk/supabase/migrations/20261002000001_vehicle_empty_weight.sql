-- The 130-U's box 11, the empty weight, recorded with where it came from.
--
-- Additive only. `weight_lbs` keeps its name and its meaning tightens: it is
-- box 11 as a person confirmed it FROM A DOCUMENT (a title, an MCO, a weight
-- certificate, or KBB / JD Power where TxDMV accepts it), with the Texas
-- rounding already applied. An estimate never goes in it.
--
-- An estimate (EPA test weight less 300 lb, Transport Canada, or the vPIC
-- decode) lives in `weight_estimate`, with its source, method, range and
-- confidence. Nothing prints, previews or pastes it: a person confirms it on
-- the 130-U, and that confirmation is recorded on the deal, not here.
--
-- None of these columns is in the public inventory view, which lists its
-- columns by name.

alter table public.vehicles
  add column if not exists weight_source text check (weight_source in
    ('texas_title', 'out_of_state_title', 'mco', 'weight_certificate', 'kbb_jdpower')),
  add column if not exists weight_reading_lbs integer check (weight_reading_lbs between 500 and 80000),
  add column if not exists weight_rule text check (weight_rule in ('roundUp', 'plus100RoundUp')),
  add column if not exists weight_confirmed_by uuid,
  add column if not exists weight_confirmed_by_name text,
  add column if not exists weight_confirmed_at timestamptz,
  add column if not exists weight_note text,
  add column if not exists weight_estimate jsonb,
  add column if not exists weight_estimated_at timestamptz;

-- A recorded source is a whole record: the figure, the reading it came from,
-- and when somebody confirmed it.
alter table public.vehicles drop constraint if exists vehicles_weight_record_complete;
alter table public.vehicles add constraint vehicles_weight_record_complete check
  (weight_source is null or (weight_lbs is not null and weight_reading_lbs is not null and weight_confirmed_at is not null));

comment on column public.vehicles.weight_lbs is
  '130-U box 11 as a person confirmed it from a document, Texas rounding already applied. Never an estimate.';
comment on column public.vehicles.weight_source is
  'The document box 11 was read from: texas_title, out_of_state_title, mco, weight_certificate or kbb_jdpower. Null on a legacy weight whose source was never recorded.';
comment on column public.vehicles.weight_reading_lbs is
  'The figure as printed on that document, before rounding.';
comment on column public.vehicles.weight_rule is
  'roundUp (title, certificate, truck) or plus100RoundUp (MCO or KBB/JD Power on a passenger class vehicle).';
comment on column public.vehicles.weight_estimate is
  'Estimated curb weight with its source, method and confidence. Never printed or pasted; a person confirms it on the 130-U.';
