-- Team member guards: the team screen's rules, held by the database too.
--
-- Additive (one function and one trigger); the owner applies it after
-- 20261003000000_dealer_fee_schedule.sql. Nothing here drops, rewrites or
-- backfills a row.
--
-- The desk's team screen (/admin/dealership/team) and its actions
-- (src/lib/actions/team-access.ts, with the rules in
-- src/lib/onboarding/team-rules.ts) refuse these changes on the server, then
-- write as the service role. But the policy "team members: self or team
-- manager" lets any team:manage session (a manager) write any column of any
-- row straight through the API, and lets any member delete their own row. So
-- the same lines are held here:
--
-- 1. The last active owner is never removed, demoted or deleted, by anybody,
--    the service role included: the desk would be left with nobody who can
--    set the fees or approve another owner. The owners are counted under one
--    transaction-scoped advisory lock, so two removals running at once cannot
--    each count the other as the owner who remains.
-- 2. For a signed-in session (current_user authenticated or anon; the desk's
--    server writes as the service role, after its own checks):
--    a. only an owner (admin:all) makes an owner, or changes or deletes an
--       owner's row;
--    b. only an owner changes who is cleared to sign (can_sign_contracts),
--       or the legal name (full_name, display_name) that prints on the 130-U
--       seller line, the VTR-61 and every dealer line, or inserts a row that
--       is already cleared to sign. Nor, for the same reason, does anybody
--       else change what makes a row a person's: the account it belongs to
--       and its address (auth_user_id, email: re-pointed, another account
--       would file under the signer's name, clearance and signature), the
--       stored signature printed on every dealer line (signature_data_url,
--       signature_updated_at), or whether onboarding is finished
--       (onboarding_completed_at: cleared, the name step opens again and the
--       member renames themselves around Correct Name); nor insert a row that
--       already carries any of the last three; nor turn a row back into a
--       fresh request (status 'pending'), whose next approval would write the
--       role's default clearance over an owner's choice. The member's own
--       signature and onboarding are saved by the desk's server, as the
--       service role, so neither is touched by this;
--    c. only team:manage deletes a row. The self-or-manager policy let a
--       member delete their own roster row, and with no row the account's
--       older metadata could stand in for access the roster had removed.
-- ---------------------------------------------------------------------------
create or replace function public.team_members_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_session boolean := current_user in ('authenticated', 'anon');
  v_owner boolean;
begin
  -- 2. A signed-in session (the desk's server is checked by the desk).
  if v_session then
    v_owner := private.team_has_permission('admin:all');
    if tg_op = 'DELETE' then
      -- 2c, then 2a.
      if not private.team_has_permission('team:manage') then
        raise exception 'forbidden' using errcode = '42501';
      end if;
      if old.role = 'owner' and not v_owner then
        raise exception 'owner_only' using errcode = '42501';
      end if;
    elsif not v_owner then
      -- 2a.
      if new.role = 'owner' and (tg_op = 'INSERT' or old.role <> 'owner') then
        raise exception 'owner_only' using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and old.role = 'owner' then
        raise exception 'owner_only' using errcode = '42501';
      end if;
      -- 2b.
      if tg_op = 'INSERT' and (
        new.can_sign_contracts
        or new.signature_data_url is not null
        or new.signature_updated_at is not null
        or new.onboarding_completed_at is not null
      ) then
        raise exception 'owner_only' using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and (
        new.can_sign_contracts is distinct from old.can_sign_contracts
        or new.full_name is distinct from old.full_name
        or new.display_name is distinct from old.display_name
        or new.auth_user_id is distinct from old.auth_user_id
        or new.email is distinct from old.email
        or new.signature_data_url is distinct from old.signature_data_url
        or new.signature_updated_at is distinct from old.signature_updated_at
        or new.onboarding_completed_at is distinct from old.onboarding_completed_at
        or (new.status = 'pending' and old.status <> 'pending')
      ) then
        raise exception 'owner_only' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 1. The last active owner, whoever writes.
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and old.status = 'active' then
    if tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active' then
      perform pg_advisory_xact_lock(hashtext('public.team_members.active_owners'));
      if not exists (
        select 1 from team_members where role = 'owner' and status = 'active' and id <> old.id
      ) then
        raise exception 'last_owner' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_members_guard on public.team_members;
create trigger trg_team_members_guard before insert or update or delete on public.team_members
  for each row execute function public.team_members_guard();
