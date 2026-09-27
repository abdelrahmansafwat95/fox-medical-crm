-- ============================================================================
-- 14 · Demo trial rules (owner's decision, 2026-09-27; applied live)
-- ============================================================================
--   · a trial lasts 3 days (was 7);
--   · one active trial at a time per phone, email or company — the same phone
--     gets its own login back, a different person from the same email/company
--     is refused until that trial ends; afterwards a new one is allowed;
--   · when it ends the login is blocked at once (hourly) and the account,
--     everything it created and its sign-up record are erased at the next
--     nightly reset.

create or replace function public.demo_trial_days() returns int
language sql immutable as $$ select 3 $$;

create or replace function public.demo_norm_company(p text) returns text
language sql immutable as $$ select nullif(lower(regexp_replace(coalesce(p, ''), '[^[:alnum:]]', '', 'g')), '') $$;

drop function if exists public.demo_signup_prepare(text, text, text);
create or replace function public.demo_signup_prepare(
  p_secret text, p_phone text, p_ip text, p_email text default '', p_company text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record; recent int;
begin
  if p_secret is null or p_secret is distinct from (select value from demo_ops.config where key = 'signup_secret') then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  select count(*) into recent from demo_ops.visitors where ip = p_ip and created_at > now() - interval '1 hour';
  if recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select dv.user_id, dv.email,
         case when dv.phone_normalized = p_phone then 'phone'
              when nullif(lower(trim(p_email)), '') = lower(dv.contact_email) then 'email'
              else 'company' end as matched_by,
         p.created_at + make_interval(days => public.demo_trial_days()) as ends_at
    into v
    from demo_ops.visitors dv
    join public.profiles p on p.id = dv.user_id and p.is_demo_visitor
   where p.created_at > now() - make_interval(days => public.demo_trial_days())
     and (dv.phone_normalized = p_phone
          or (nullif(lower(trim(p_email)), '') is not null and lower(dv.contact_email) = lower(trim(p_email)))
          or (length(public.demo_norm_company(p_company)) >= 3
              and public.demo_norm_company(dv.company) = public.demo_norm_company(p_company)))
   order by (dv.phone_normalized = p_phone) desc, dv.created_at desc
   limit 1;

  if v.user_id is not null and v.matched_by <> 'phone' then
    return jsonb_build_object('ok', false, 'error', 'active_trial', 'matched_by', v.matched_by, 'ends_at', v.ends_at);
  end if;
  return jsonb_build_object('ok', true,
    'existing', case when v.user_id is null then null
                     else jsonb_build_object('user_id', v.user_id, 'email', v.email, 'ends_at', v.ends_at) end);
end $$;
revoke all on function public.demo_signup_prepare(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.demo_signup_prepare(text, text, text, text, text) to service_role;

create or replace function public.demo_block_expired() returns int
language sql security definer set search_path = public as $$
  with b as (
    update auth.users u set banned_until = 'infinity'
      from public.profiles p
     where p.id = u.id and p.is_demo_visitor
       and p.created_at <= now() - make_interval(days => public.demo_trial_days())
       and u.banned_until is distinct from 'infinity'
    returning 1)
  select count(*)::int from b
$$;
revoke all on function public.demo_block_expired() from public, anon, authenticated;
select cron.schedule('demo-block-expired', '7 * * * *', 'select public.demo_block_expired()');

-- demo_reset from 12, with 3-day accounts and erased sign-up records.
create or replace function public.demo_reset()
returns text language plpgsql security invoker set search_path = '' as $$
declare
  t text; sel text; cols text;
  v_as_of timestamptz; v_shift interval; v_months integer; v_expired integer;
begin
  select as_of into v_as_of from demo_snapshot.meta where id = 1;
  if v_as_of is null then raise exception 'No demo snapshot — run demo_snapshot_take() first'; end if;

  v_shift := date_trunc('day', now()) - date_trunc('day', v_as_of);
  v_months := (extract(year from now())::int * 12 + extract(month from now())::int)
            - (extract(year from v_as_of)::int * 12 + extract(month from v_as_of)::int);

  execute 'set local session_replication_role = replica';

  foreach t in array public.demo_tables() loop
    execute format('delete from public.%I where true', t);
  end loop;

  foreach t in array public.demo_tables() loop
    select
      string_agg(
        case
          when (t, c.column_name::text) in (('hcps', 'birthdate'), ('products', 'launch_date'))
            then quote_ident(c.column_name)
          when c.data_type like 'timestamp%' then format('%I + $1', c.column_name)
          when c.data_type = 'date' then format('(%I + $1)::date', c.column_name)
          when (t, c.column_name::text) = ('call_targets', 'month')
            then format('to_char(to_date(%1$I, ''YYYY-MM'') + make_interval(months => $2), ''YYYY-MM'')', c.column_name)
          else quote_ident(c.column_name)
        end, ', ' order by c.ordinal_position),
      string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into sel, cols
    from information_schema.columns c
    where c.table_schema = 'demo_snapshot' and c.table_name = t
      and exists (select 1 from information_schema.columns p
                   where p.table_schema = 'public' and p.table_name = t
                     and p.column_name = c.column_name and p.is_generated = 'NEVER');

    execute format('insert into public.%I (%s) select %s from demo_snapshot.%I', t, cols, sel, t)
      using v_shift, v_months;
  end loop;

  execute 'set local session_replication_role = origin';

  delete from public.permissions p
   using public.profiles pr
   where p.target_type = 'user' and p.target_id = pr.id::text
     and pr.is_demo_visitor and pr.created_at <= now() - make_interval(days => public.demo_trial_days());
  with gone as (
    delete from auth.users u using public.profiles p
     where p.id = u.id and p.is_demo_visitor
       and p.created_at <= now() - make_interval(days => public.demo_trial_days())
    returning 1)
  select count(*) into v_expired from gone;
  -- the lead was already emailed to the inbox; the record goes with the account
  delete from demo_ops.visitors v
   where v.user_id is null or not exists (select 1 from public.profiles p where p.id = v.user_id);

  update demo_snapshot.meta set last_reset_at = now() where id = 1;
  return format('reset to %s (+%s days, +%s months); %s visitor accounts expired',
                v_as_of::date, extract(day from v_shift), v_months, v_expired);
end $$;
revoke all on function public.demo_reset() from public, anon, authenticated;
