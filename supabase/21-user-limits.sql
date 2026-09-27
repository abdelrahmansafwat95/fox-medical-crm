-- User limits per plan, as sold on the pricing page: Starter 2, Team 10,
-- Growth 15, Business 25, Complete 40 active users. Demo visitors do not count.
--
-- Enforced in the database, so every way of adding or re-activating a user
-- (invite screen, import, SQL) meets the same limit. The invite code calls
-- seat_usage() first so the admin gets a clear message before any login is
-- created. Going down a plan never deactivates anyone: existing users keep
-- working, only adding or re-activating is refused while over the limit.
-- The plan itself is fox_plan.config (see the plan-limits migration).
create or replace function fox_plan.seats() returns int
language sql stable security definer set search_path to 'fox_plan' as $$
  select case fox_plan.current() when 'starter' then 2 when 'team' then 10 when 'growth' then 15
                                 when 'business' then 25 else 40 end
$$;
revoke all on function fox_plan.seats() from public, anon;
grant execute on function fox_plan.seats() to authenticated, service_role;

create or replace function public.seat_usage() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('plan', fox_plan.current(), 'limit', fox_plan.seats(),
                            'used', (select count(*) from public.profiles where coalesce(is_active, true) and not coalesce(is_demo_visitor, false)))
$$;
revoke all on function public.seat_usage() from public, anon;
grant execute on function public.seat_usage() to authenticated, service_role;

create or replace function fox_plan.tg_seat_limit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare used int; lim int := fox_plan.seats();
begin
  if not (coalesce(new.is_active, true) and not coalesce(new.is_demo_visitor, false)) then return new; end if;
  if tg_op = 'UPDATE' then
    if (coalesce(old.is_active, true) and not coalesce(old.is_demo_visitor, false)) then return new; end if;
  end if;
  -- two admins adding the last seat at the same moment must not both get it
  perform pg_advisory_xact_lock(hashtext('fox_plan.seat_limit'));
  select count(*) into used from public.profiles where coalesce(is_active, true) and not coalesce(is_demo_visitor, false) and id <> new.id;
  if used >= lim then
    raise exception 'Your plan (%) includes up to % active users. Deactivate a user or upgrade the plan to add more.',
      initcap(fox_plan.current()), lim using hint = 'seat_limit';
  end if;
  return new;
end $$;
revoke all on function fox_plan.tg_seat_limit() from public, anon, authenticated;

drop trigger if exists seat_limit on public.profiles;
create trigger seat_limit before insert or update on public.profiles
  for each row execute function fox_plan.tg_seat_limit();
