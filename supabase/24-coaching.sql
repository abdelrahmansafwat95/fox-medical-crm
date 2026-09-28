-- =====================================================================
-- 24 · Field coaching (joint visits)
-- A manager spends a day in the field with a rep, rates seven call skills
-- (1–5), writes strengths, what to improve and an action plan. The rep reads
-- it and acknowledges it with a comment. Managers see progress per skill.
-- =====================================================================

-- Seven skills, each a number 1..5 (a function: CHECK cannot hold subqueries).
create or replace function public.coaching_scores_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and (select count(*) from jsonb_object_keys(p)) = 7
     and coalesce((select bool_and(k in ('planning','opening','product_knowledge','key_message','objection_handling','closing','compliance')
                                   and jsonb_typeof(v) = 'number' and (v::text)::numeric between 1 and 5)
                     from jsonb_each(p) as e(k, v)), false)
$$;

create table if not exists public.coaching_sessions (
  id              uuid primary key default gen_random_uuid(),
  rep_id          uuid not null references public.profiles(id) on delete cascade,
  manager_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  coached_on      date not null default current_date,
  visits_observed integer not null default 1 check (visits_observed between 0 and 30),
  visit_ids       uuid[] not null default '{}',
  -- {planning, opening, product_knowledge, key_message, objection_handling, closing, compliance}: 1..5
  scores          jsonb not null,
  overall         numeric generated always as (
                    round(((coalesce((scores->>'planning')::numeric,0) + coalesce((scores->>'opening')::numeric,0)
                          + coalesce((scores->>'product_knowledge')::numeric,0) + coalesce((scores->>'key_message')::numeric,0)
                          + coalesce((scores->>'objection_handling')::numeric,0) + coalesce((scores->>'closing')::numeric,0)
                          + coalesce((scores->>'compliance')::numeric,0)) / 7.0), 2)) stored,
  strengths       text not null default '',
  improvements    text not null default '',
  action_plan     text not null default '',
  follow_up_on    date,
  rep_comment     text,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint coaching_not_self check (rep_id <> manager_id),
  constraint coaching_scores_valid check (public.coaching_scores_ok(scores))
);
create index if not exists coaching_rep_idx on public.coaching_sessions(rep_id, coached_on desc);
create index if not exists coaching_manager_idx on public.coaching_sessions(manager_id, coached_on desc);
alter table public.coaching_sessions enable row level security;

-- Read: the rep, their management chain, and head office.
drop policy if exists coaching_read on public.coaching_sessions;
create policy coaching_read on public.coaching_sessions for select to authenticated using (
  rep_id = (select auth.uid())
  or rep_id in (select profile_id from public.get_subordinate_ids((select auth.uid())))
  or manager_id = (select auth.uid())
  or (select public.get_user_role()) = any (array['admin','country_manager','sales_director']));

-- Write: a manager, about someone below them, as themselves.
drop policy if exists coaching_insert on public.coaching_sessions;
create policy coaching_insert on public.coaching_sessions for insert to authenticated with check (
  manager_id = (select auth.uid())
  and rep_id <> (select auth.uid())
  and rep_id in (select profile_id from public.get_subordinate_ids((select auth.uid())))
  and acknowledged_at is null and rep_comment is null);

-- The author may correct it until the rep has acknowledged it.
drop policy if exists coaching_update on public.coaching_sessions;
create policy coaching_update on public.coaching_sessions for update to authenticated
  using (manager_id = (select auth.uid()) and acknowledged_at is null)
  with check (manager_id = (select auth.uid()) and acknowledged_at is null and rep_comment is null);
drop policy if exists coaching_delete on public.coaching_sessions;
create policy coaching_delete on public.coaching_sessions for delete to authenticated
  using (manager_id = (select auth.uid()) and acknowledged_at is null);

-- The rep acknowledges (once), optionally with a comment. Nothing else changes.
create or replace function public.coaching_acknowledge(p_id uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.coaching_sessions
     set acknowledged_at = now(), rep_comment = nullif(left(trim(coalesce(p_comment, '')), 2000), '')
   where id = p_id and rep_id = auth.uid() and acknowledged_at is null;
  if not found then raise exception 'Not found, not yours, or already acknowledged' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.coaching_acknowledge(uuid, text) from public, anon;
grant execute on function public.coaching_acknowledge(uuid, text) to authenticated;

-- Progress per rep and skill for a period; runs as the caller, so RLS scopes it.
create or replace function public.coaching_summary(p_from date, p_to date)
returns table (rep_id uuid, sessions bigint, last_on date, overall numeric,
               planning numeric, opening numeric, product_knowledge numeric, key_message numeric,
               objection_handling numeric, closing numeric, compliance numeric, open_acknowledgements bigint)
language sql stable security invoker set search_path = '' as $$
  select c.rep_id, count(*), max(c.coached_on), round(avg(c.overall), 2),
         round(avg((c.scores->>'planning')::numeric), 2), round(avg((c.scores->>'opening')::numeric), 2),
         round(avg((c.scores->>'product_knowledge')::numeric), 2), round(avg((c.scores->>'key_message')::numeric), 2),
         round(avg((c.scores->>'objection_handling')::numeric), 2), round(avg((c.scores->>'closing')::numeric), 2),
         round(avg((c.scores->>'compliance')::numeric), 2),
         count(*) filter (where c.acknowledged_at is null)
    from public.coaching_sessions c
   where c.coached_on between p_from and p_to
   group by c.rep_id
$$;
grant execute on function public.coaching_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Demo: joins the nightly reset.
-- ---------------------------------------------------------------------
create or replace function public.demo_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'products', 'institution_chains', 'institutions', 'hcps', 'hcp_workplaces',
    'call_targets', 'tour_plans', 'visits', 'rep_locations', 'samples_inventory',
    'samples_transactions', 'orders', 'expenses', 'events', 'event_invitees',
    'compliance_alerts', 'notifications', 'whatsapp_messages', 'activity_log',
    'detailing_slides', 'detailing_sessions', 'incentive_plans', 'incentive_payouts', 'sales_data',
    'coaching_sessions'
  ]
$$;
create table if not exists demo_snapshot.coaching_sessions as
  select id, rep_id, manager_id, coached_on, visits_observed, visit_ids, scores, strengths, improvements,
         action_plan, follow_up_on, rep_comment, acknowledged_at, created_at
    from public.coaching_sessions with no data;

-- The rep hears about new feedback in their notifications (bell + push, as other notifications).
-- (Not fired by demo_reset: it restores with session_replication_role = replica.)
create or replace function public.tg_coaching_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link_url, metadata)
  values (new.rep_id, 'task', 'New coaching feedback',
          'Feedback from your joint visits on ' || to_char(new.coached_on, 'DD Mon') || ' is ready. Read it and acknowledge.',
          '/dashboard/coaching', jsonb_build_object('coaching_id', new.id));
  return new;
end $$;
drop trigger if exists coaching_notify on public.coaching_sessions;
create trigger coaching_notify after insert on public.coaching_sessions for each row execute function public.tg_coaching_notify();
