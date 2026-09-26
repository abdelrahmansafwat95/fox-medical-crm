-- ============================================================================
-- 12 · Self-serve public demo (applied live as migration demo_visitors,
--      2026-09-26)
-- ============================================================================
-- foxsystemstech.com's "Try the live demo" form → website /api/demo-request →
-- Edge Function demo-signup (supabase/functions/demo-signup) with the shared
-- secret in demo_ops.config → a GoTrue user whose profile is a
-- country_manager flagged is_demo_visitor → one-time link to /demo/enter.
--
-- Everything a visitor must not do is refused HERE, not just hidden in the UI.
-- Live Tracking and the AI Assistant are switched off per visitor with user
-- overrides in `permissions` (the Mapbox / Anthropic keys are not configured).
--
-- Every night demo_reset() restores the sample data from schema demo_snapshot
-- with dates moved forward so the demo looks current, and removes visitor
-- accounts older than seven days. With no visitors, nothing here changes how
-- the app behaves.

alter table public.profiles
  add column if not exists is_demo_visitor boolean not null default false;

create or replace function public.is_demo_visitor()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_demo_visitor from public.profiles where id = auth.uid()), false) $$;
revoke all on function public.is_demo_visitor() from public, anon;
grant execute on function public.is_demo_visitor() to authenticated;

-- ---- profile guard (from 11) + visitors may not edit any profile -----------
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

  if public.is_demo_visitor() then
    raise exception 'Not available in the demo' using errcode = '42501';
  end if;

  if new.is_demo_visitor is distinct from old.is_demo_visitor then
    raise exception 'The demo flag can only be set by the server' using errcode = '42501';
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

-- Visitors never see each other, and staff lists stay clean.
drop policy if exists demo_visitors_hidden on public.profiles;
create policy demo_visitors_hidden on public.profiles
  as restrictive for select to authenticated
  using (id = auth.uid() or not is_demo_visitor);

-- No deleting anything.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('drop policy if exists demo_visitor_no_delete on public.%I', t);
    execute format('create policy demo_visitor_no_delete on public.%I as restrictive for delete to authenticated using (not public.is_demo_visitor())', t);
  end loop;
end $$;

-- Configuration is read-only: permissions, branches, territories.
do $$
declare t text;
begin
  foreach t in array array['permissions', 'branches', 'territories'] loop
    execute format('drop policy if exists demo_visitor_no_insert on public.%I', t);
    execute format('drop policy if exists demo_visitor_no_update on public.%I', t);
    execute format('create policy demo_visitor_no_insert on public.%I as restrictive for insert to authenticated with check (not public.is_demo_visitor())', t);
    execute format('create policy demo_visitor_no_update on public.%I as restrictive for update to authenticated using (not public.is_demo_visitor())', t);
  end loop;
end $$;

-- No uploads (selfies, signatures, receipts would be hosted on our storage).
drop policy if exists demo_visitor_no_upload on storage.objects;
create policy demo_visitor_no_upload on storage.objects
  as restrictive for insert to authenticated with check (not public.is_demo_visitor());
drop policy if exists demo_visitor_no_update on storage.objects;
create policy demo_visitor_no_update on storage.objects
  as restrictive for update to authenticated using (not public.is_demo_visitor());

-- ---- sign-up log and secret: outside public, server-only --------------------
create schema if not exists demo_ops;
revoke all on schema demo_ops from public, anon, authenticated;

create table if not exists demo_ops.config (key text primary key, value text not null);
insert into demo_ops.config(key, value)
values ('signup_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create table if not exists demo_ops.visitors (
  id bigint generated by default as identity primary key,
  user_id uuid,
  email text,
  full_name text not null,
  phone text not null,
  phone_normalized text not null,
  contact_email text,
  company text,
  team_size text,
  language text,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_demo_visitors_phone on demo_ops.visitors(phone_normalized, created_at desc);

-- Called by the demo-signup Edge Function (service role) only.
create or replace function public.demo_signup_prepare(p_secret text, p_phone text, p_ip text)
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
  -- the clock runs from the account's FIRST sign-up; a revisit does not extend it
  select dv.user_id, dv.email into v
    from demo_ops.visitors dv
    join public.profiles p on p.id = dv.user_id and p.is_demo_visitor
   where dv.phone_normalized = p_phone
     and (select min(f.created_at) from demo_ops.visitors f where f.user_id = dv.user_id) > now() - interval '7 days'
   order by dv.created_at desc limit 1;
  return jsonb_build_object('ok', true,
    'existing', case when v.user_id is null then null else jsonb_build_object('user_id', v.user_id, 'email', v.email) end);
end $$;

-- Turns the profile handle_new_user just made into a demo visitor, hides the
-- two features whose keys are not configured, and logs the sign-up.
create or replace function public.demo_signup_record(
  p_user_id uuid, p_email text, p_display_name text,
  p_full_name text, p_phone text, p_phone_normalized text, p_contact_email text,
  p_company text, p_team_size text, p_lang text, p_ip text, p_new boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_new then
    update public.profiles
       set role = 'country_manager', is_demo_visitor = true, full_name = p_display_name
     where id = p_user_id;
    insert into public.permissions(target_type, target_id, resource, action, scope, granted)
    values ('user', p_user_id::text, 'tracking', 'view', 'all', false),
           ('user', p_user_id::text, 'assistant', 'view', 'all', false);
  end if;
  insert into demo_ops.visitors(user_id, email, full_name, phone, phone_normalized,
                                contact_email, company, team_size, language, ip)
  values (p_user_id, p_email, p_full_name, p_phone, p_phone_normalized,
          nullif(p_contact_email, ''), nullif(p_company, ''), nullif(p_team_size, ''), p_lang, p_ip);
end $$;

revoke all on function public.demo_signup_prepare(text, text, text),
  public.demo_signup_record(uuid, text, text, text, text, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.demo_signup_prepare(text, text, text),
  public.demo_signup_record(uuid, text, text, text, text, text, text, text, text, text, text, boolean)
  to service_role;

-- ---- snapshot + nightly reset ----------------------------------------------
create schema if not exists demo_snapshot;
revoke all on schema demo_snapshot from public, anon, authenticated;
create table if not exists demo_snapshot.meta (
  id integer primary key default 1 check (id = 1),
  as_of timestamptz not null,
  taken_at timestamptz not null default now(),
  last_reset_at timestamptz
);

-- The sample data. People (profiles), configuration (permissions, branches,
-- territories) and per-device push subscriptions are not in it.
create or replace function public.demo_tables()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'products', 'institution_chains', 'institutions', 'hcps', 'hcp_workplaces',
    'call_targets', 'tour_plans', 'visits', 'rep_locations', 'samples_inventory',
    'samples_transactions', 'orders', 'expenses', 'events', 'event_invitees',
    'compliance_alerts', 'notifications', 'whatsapp_messages', 'activity_log'
  ]
$$;

create or replace function public.demo_snapshot_take(p_as_of timestamptz)
returns text language plpgsql security invoker set search_path = '' as $$
declare t text;
begin
  foreach t in array public.demo_tables() loop
    execute format('drop table if exists demo_snapshot.%I', t);
    execute format('create table demo_snapshot.%I as select * from public.%I', t, t);
  end loop;
  insert into demo_snapshot.meta (id, as_of, taken_at) values (1, p_as_of, now())
  on conflict (id) do update set as_of = excluded.as_of, taken_at = excluded.taken_at;
  return format('snapshot of %s tables, dated %s', array_length(public.demo_tables(), 1), p_as_of::date);
end $$;

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

  -- No FK checks, cascades or triggers (codes, activity log, approval
  -- authority) while the data is swapped. The SET statement form is the one
  -- Supabase allows; set_config() is refused.
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

  -- Visitor logins last seven days. Their rows were just replaced.
  delete from public.permissions p
   using public.profiles pr
   where p.target_type = 'user' and p.target_id = pr.id::text
     and pr.is_demo_visitor and pr.created_at < now() - interval '7 days';
  with gone as (
    delete from auth.users u using public.profiles p
     where p.id = u.id and p.is_demo_visitor and p.created_at < now() - interval '7 days'
    returning 1)
  select count(*) into v_expired from gone;

  update demo_snapshot.meta set last_reset_at = now() where id = 1;
  return format('reset to %s (+%s days, +%s months); %s visitor accounts expired',
                v_as_of::date, extract(day from v_shift), v_months, v_expired);
end $$;

revoke all on function public.demo_snapshot_take(timestamptz) from public, anon, authenticated;
revoke all on function public.demo_reset() from public, anon, authenticated;
revoke all on function public.demo_tables() from public, anon, authenticated;

-- The snapshot was taken once, by hand. Most sample data was seeded on
-- 2026-04-26; events and invitees on 2026-08-17, so they are moved back in the
-- snapshot to keep their place relative to the rest:
--   select public.demo_snapshot_take('2026-04-26 12:00+00');
--   update demo_snapshot.events / demo_snapshot.event_invitees
--      set every timestamptz/date column = column - interval '113 days';
-- Re-take it after any deliberate change to the sample data, or the next
-- reset will quietly undo the change.
select cron.schedule('demo-reset', '0 0 * * *', 'select public.demo_reset()');
