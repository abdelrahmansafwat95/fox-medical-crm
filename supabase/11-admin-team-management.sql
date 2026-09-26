-- ============================================================================
-- 11 · Admins manage the team from the app (applied live as migration
--      admin_team_management, 2026-09-26)
-- ============================================================================
-- Until now roles, reporting lines, branches and territories could only be
-- set in the Supabase dashboard: profile_self_update covers a user's OWN row
-- only, so an admin editing someone else from the browser updated nothing.
-- The Team page now has an Edit dialog for admins; this is its database side.
--
-- tg_profiles_guard (09) already limits the organisation fields to admins.
-- Two rules are added to it, because an admin editing freely can do damage
-- no one else could:
--   · nobody reports to themselves (get_subordinate_ids would still terminate,
--     but every "my team" view for that person would be nonsense);
--   · the last active admin cannot be demoted or deactivated — there would be
--     no one left to undo it without the Supabase dashboard.

drop policy if exists profile_admin_update on public.profiles;
create policy profile_admin_update on public.profiles
  for update to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.line_manager_id is not null and new.line_manager_id = new.id then
    raise exception 'A person cannot be their own line manager' using errcode = '23514';
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.profiles p
                      where p.role = 'admin' and p.is_active and p.id <> old.id) then
    raise exception 'This is the only active admin. Make someone else an admin first.'
      using errcode = '42501';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if (new.role, new.line_manager_id, new.branch_id, new.territory_id,
      new.is_active, new.email, new.employee_id, new.code)
     is distinct from
     (old.role, old.line_manager_id, old.branch_id, old.territory_id,
      old.is_active, old.email, old.employee_id, old.code)
     and coalesce(public.get_user_role(auth.uid()), '') <> 'admin' then
    raise exception 'Only an admin can change roles, reporting lines, branches, territories or account status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_profiles_guard() from public, anon, authenticated;

-- "Inactive" used to be a label only: no policy or sign-in check read it, so
-- a deactivated rep could still sign in and see their data. Deactivating now
-- bans the GoTrue account (banned_until = infinity) and reactivating lifts it.
-- An open session ends when its access token next needs refreshing (≤ 1 hour).
-- Applied live as migration deactivate_blocks_sign_in.
create or replace function public.tg_profiles_sync_ban()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
     set banned_until = case when new.is_active then null else 'infinity'::timestamptz end
   where id = new.id;
  return null;
end;
$$;

revoke all on function public.tg_profiles_sync_ban() from public, anon, authenticated;

drop trigger if exists profiles_sync_ban on public.profiles;
create trigger profiles_sync_ban
  after update of is_active on public.profiles
  for each row
  when (new.is_active is distinct from old.is_active)
  execute function public.tg_profiles_sync_ban();
