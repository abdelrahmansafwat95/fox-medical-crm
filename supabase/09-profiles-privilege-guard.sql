-- ============================================================================
-- 09 · Stop users promoting themselves (applied live as migration
--      profiles_privilege_guard, 2026-09-26)
-- ============================================================================
-- profile_self_update lets a user update their own row, and `authenticated`
-- holds UPDATE on every column — so any signed-in rep could run
--   update profiles set role = 'admin' where id = auth.uid()
-- and become admin, or move themselves to another manager, branch or
-- territory (which is what RLS scopes their data by). Reproduced on
-- 2026-09-26 as a medical_rep.
--
-- RLS cannot restrict columns, so a trigger does: the organisation fields
-- below change only for an admin, or from a trusted server path (service
-- role, SQL, handle_new_user — all run with no JWT, so auth.uid() is null).
-- A user's own name, Arabic name, phone, product line, avatar, working hours
-- and tracking consent stay self-editable, which is all Settings writes.
-- Roles are assigned in the database today (see the Team page note), so no
-- app screen loses anything.

create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.tg_profiles_guard();

-- log_activity() (the activity_log trigger added 2026-07-22) was created after
-- the earlier EXECUTE hardening, so anon could reach it at /rpc/log_activity.
-- A trigger function errors when called directly; revoked anyway so the
-- advisor stays clean. Applied live as migration revoke_log_activity_execute.
revoke all on function public.log_activity() from public, anon, authenticated;
