-- Team History: written by the desk's server alone.
--
-- Additive (one function and one trigger); the owner applies it after
-- 20261004000000_team_member_guards.sql. Nothing here drops, rewrites or
-- backfills a row.
--
-- The team screen (/admin/dealership/team) shows every team_activity_events
-- row whose entity_type is 'team_member' as Team History, the record of who
-- approved, denied, removed or reset whom and who changed a clearance or a
-- name. The desk writes those rows as the service role
-- (src/lib/actions/team-access.ts and team-onboarding.ts). But the policy
-- "activity: staff write" lets any admin:read session (every role, Sales and
-- Viewer included) insert any activity row, with any actor and any words,
-- straight through the API: a salesperson could post "Maria Lopez turned
-- signing on for Jason Price." into the owner's record.
--
-- So a signed-in session (current_user authenticated or anon) may not write
-- a team_member row ('team_history_server_only'). Every other kind of
-- activity a staff session records (a deal's, the fee schedule's) is as it
-- was. There is no update policy on the table, so the update case is only a
-- second lock for the day one is added.
-- ---------------------------------------------------------------------------
create or replace function public.team_activity_events_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.entity_type = 'team_member'
    or (tg_op = 'UPDATE' and old.entity_type = 'team_member')
  ) then
    raise exception 'team_history_server_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger trg_team_activity_events_guard
  before insert or update on public.team_activity_events
  for each row execute function public.team_activity_events_guard();
