-- =====================================================================
-- 22 — e-detailing, incentives, sales data (2026-09-28)
-- =====================================================================

-- ---------------------------------------------------------------------
-- E-DETAILING: slide decks per product, and what each doctor was shown.
-- ---------------------------------------------------------------------
create table if not exists public.detailing_slides (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  position    integer not null default 0,
  title       text,
  image_url   text not null,          -- public URL (storage bucket "detailing", or /public for demo decks)
  key_message text,                   -- shown to the rep only, as a prompt
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists detailing_slides_product_idx on public.detailing_slides(product_id, position);
alter table public.detailing_slides enable row level security;
drop policy if exists detailing_slides_read on public.detailing_slides;
create policy detailing_slides_read on public.detailing_slides for select to authenticated using (true);
drop policy if exists detailing_slides_write on public.detailing_slides;
create policy detailing_slides_write on public.detailing_slides for all to authenticated
  using ((select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager']))
  with check ((select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager']));

create table if not exists public.detailing_sessions (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references public.visits(id) on delete cascade,
  rep_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  hcp_id        uuid references public.hcps(id) on delete set null,
  product_id    uuid not null references public.products(id) on delete cascade,
  started_at    timestamptz not null default now(),
  total_seconds integer not null default 0 check (total_seconds between 0 and 7200),
  slides        jsonb not null default '[]'::jsonb,   -- [{slide_id, seconds}]
  created_at    timestamptz not null default now()
);
create index if not exists detailing_sessions_visit_idx on public.detailing_sessions(visit_id);
create index if not exists detailing_sessions_product_idx on public.detailing_sessions(product_id, started_at);
alter table public.detailing_sessions enable row level security;
drop policy if exists detailing_sessions_read on public.detailing_sessions;
create policy detailing_sessions_read on public.detailing_sessions for select to authenticated using (
  rep_id in (select profile_id from public.get_subordinate_ids((select auth.uid())))
  or (select public.get_user_role()) = any (array['admin','country_manager','sales_director']));
drop policy if exists detailing_sessions_insert on public.detailing_sessions;
create policy detailing_sessions_insert on public.detailing_sessions for insert to authenticated with check (
  rep_id = (select auth.uid())
  and exists (select 1 from public.visits v where v.id = visit_id and v.rep_id = (select auth.uid())));

-- A detailing session marks the visit: which products were detailed, and that
-- e-detailing was used — so coverage, frequency and reports pick it up.
create or replace function public.tg_detailing_session_visit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.visits v
     set products_detailed  = array(select distinct unnest(coalesce(v.products_detailed, '{}'::uuid[]) || array[new.product_id])),
         detailing_aid_used = array(select distinct unnest(coalesce(v.detailing_aid_used, '{}'::text[]) || array['e-detailing']))
   where v.id = new.visit_id and v.rep_id = new.rep_id;
  return new;
end $$;
drop trigger if exists detailing_session_visit on public.detailing_sessions;
create trigger detailing_session_visit after insert on public.detailing_sessions
  for each row execute function public.tg_detailing_session_visit();

-- Managers upload deck images to a public bucket (slides are promotional
-- material the rep shows anyway; public URLs also cache for offline use).
insert into storage.buckets (id, name, public) values ('detailing', 'detailing', true)
  on conflict (id) do nothing;
drop policy if exists detailing_upload_managers on storage.objects;
create policy detailing_upload_managers on storage.objects for insert to authenticated with check (
  bucket_id = 'detailing' and (select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager']));
drop policy if exists detailing_delete_managers on storage.objects;
create policy detailing_delete_managers on storage.objects for delete to authenticated using (
  bucket_id = 'detailing' and (select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager']));

-- Per product: sessions, average time, and time per slide (manager view).
create or replace function public.detailing_insights(p_from date, p_to date)
returns table (product_id uuid, product_name text, sessions bigint, doctors bigint, avg_seconds numeric,
               slides jsonb)
language sql stable security invoker set search_path = '' as $$
  with s as (
    select d.* from public.detailing_sessions d
     where d.started_at >= p_from and d.started_at < p_to + 1
  ), per_slide as (
    select s.product_id, (e->>'slide_id')::uuid slide_id, avg((e->>'seconds')::numeric) avg_s, count(*) n
      from s, jsonb_array_elements(s.slides) e group by 1, 2
  )
  select p.id, p.name, count(distinct s.id), count(distinct s.hcp_id), round(avg(s.total_seconds), 0),
         coalesce((select jsonb_agg(jsonb_build_object('slide_id', ps.slide_id, 'title', ds.title, 'position', ds.position,
                                                       'avg_seconds', round(ps.avg_s, 1), 'views', ps.n) order by ds.position)
                     from per_slide ps join public.detailing_slides ds on ds.id = ps.slide_id
                    where ps.product_id = p.id), '[]'::jsonb)
    from s join public.products p on p.id = s.product_id
   group by p.id, p.name
   order by count(distinct s.id) desc
$$;

-- ---------------------------------------------------------------------
-- INCENTIVES: a plan (tiers on verified calls and coverage, a quality
-- floor), a monthly statement computed from verified visits, and approved
-- payouts. Only GPS-verified, completed, not-rejected visits count.
-- ---------------------------------------------------------------------
create table if not exists public.incentive_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  effective_from  date not null,
  roles           text[] not null default array['medical_rep','medical_rep_senior'],
  calls_tiers     jsonb not null default '[{"from_pct":80,"amount":1500},{"from_pct":100,"amount":3000},{"from_pct":120,"amount":4500}]',
  coverage_tiers  jsonb not null default '[{"from_pct":90,"amount":1000},{"from_pct":100,"amount":2000}]',
  quality_min     numeric not null default 6,       -- average AI quality score (0-10)
  quality_factor  numeric not null default 0.5,     -- bonus multiplied by this below the floor
  currency        text not null default 'EGP',
  is_active       boolean not null default true,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.incentive_plans enable row level security;
drop policy if exists incentive_plans_read on public.incentive_plans;
create policy incentive_plans_read on public.incentive_plans for select to authenticated using (true);
drop policy if exists incentive_plans_write on public.incentive_plans;
create policy incentive_plans_write on public.incentive_plans for all to authenticated
  using ((select public.get_user_role()) = any (array['admin','country_manager','sales_director']))
  with check ((select public.get_user_role()) = any (array['admin','country_manager','sales_director']));

create table if not exists public.incentive_payouts (
  id           uuid primary key default gen_random_uuid(),
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  rep_id       uuid not null references public.profiles(id) on delete cascade,
  amount       numeric not null,
  currency     text not null default 'EGP',
  breakdown    jsonb not null default '{}'::jsonb,
  status       text not null default 'approved' check (status in ('approved','paid')),
  approved_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  approved_at  timestamptz not null default now(),
  paid_at      timestamptz,
  unique (month, rep_id)
);
alter table public.incentive_payouts enable row level security;
drop policy if exists incentive_payouts_read on public.incentive_payouts;
create policy incentive_payouts_read on public.incentive_payouts for select to authenticated using (
  rep_id in (select profile_id from public.get_subordinate_ids((select auth.uid())))
  or (select public.get_user_role()) = any (array['admin','country_manager','sales_director']));
drop policy if exists incentive_payouts_write on public.incentive_payouts;
create policy incentive_payouts_write on public.incentive_payouts for all to authenticated
  using ((select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager','district_manager']))
  with check ((select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager','district_manager']));

-- tier amount for a percentage: the highest tier reached
create or replace function public.incentive_tier(p_tiers jsonb, p_pct numeric) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(max((t->>'amount')::numeric) filter (where p_pct >= (t->>'from_pct')::numeric), 0)
    from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) t
$$;

-- The month's statement for every rep the caller may see (RLS scopes it).
create or replace function public.incentive_statement(p_month text)
returns table (rep_id uuid, rep_name text, role text, calls_target integer, verified_calls bigint, calls_pct numeric,
               coverage_target integer, hcps_covered bigint, coverage_pct numeric, avg_quality numeric,
               calls_bonus numeric, coverage_bonus numeric, quality_ok boolean, total numeric, currency text,
               plan_name text, payout_status text)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select to_date(p_month, 'YYYY-MM') d0, (to_date(p_month, 'YYYY-MM') + interval '1 month')::date d1
  ), plan as (
    select ip.* from public.incentive_plans ip, bounds b
     where ip.is_active and ip.effective_from < b.d1
     order by ip.effective_from desc, ip.created_at desc limit 1
  ), reps as (
    select pr.id, pr.full_name, pr.role from public.profiles pr, plan
     where pr.is_active and pr.role = any (plan.roles)
  ), v as (
    select vi.rep_id, count(*) calls, count(distinct vi.hcp_id) hcps, avg(vi.ai_quality_score) q
      from public.visits vi, bounds b
     where vi.status = 'completed' and vi.check_in_within_geofence
       and coalesce(vi.manager_status, '') <> 'rejected'
       and vi.check_in_at >= b.d0 and vi.check_in_at < b.d1
     group by vi.rep_id
  ), calc as (
    select r.id, r.full_name, r.role, ct.calls_target, coalesce(v.calls, 0) calls,
           case when coalesce(ct.calls_target, 0) > 0 then round(100.0 * coalesce(v.calls, 0) / ct.calls_target, 1) end calls_pct,
           ct.coverage_target, coalesce(v.hcps, 0) hcps,
           case when coalesce(ct.coverage_target, 0) > 0 then round(100.0 * coalesce(v.hcps, 0) / ct.coverage_target, 1) end cov_pct,
           round(v.q, 1) q
      from reps r
      left join public.call_targets ct on ct.rep_id = r.id and ct.month = p_month
      left join v on v.rep_id = r.id
  )
  select c.id, c.full_name, c.role, c.calls_target, c.calls, c.calls_pct, c.coverage_target, c.hcps, c.cov_pct, c.q,
         public.incentive_tier(plan.calls_tiers, coalesce(c.calls_pct, 0)),
         public.incentive_tier(plan.coverage_tiers, coalesce(c.cov_pct, 0)),
         c.q is null or c.q >= plan.quality_min,
         round((public.incentive_tier(plan.calls_tiers, coalesce(c.calls_pct, 0))
              + public.incentive_tier(plan.coverage_tiers, coalesce(c.cov_pct, 0)))
              * case when c.q is not null and c.q < plan.quality_min then plan.quality_factor else 1 end, 0),
         plan.currency, plan.name,
         (select po.status from public.incentive_payouts po where po.month = p_month and po.rep_id = c.id)
    from calc c, plan
   order by 14 desc, c.full_name
$$;

-- ---------------------------------------------------------------------
-- SALES DATA: distributor / pharmacy sales imported from Excel, set against
-- verified calls. Managers import and see everything; a rep sees their territory.
-- ---------------------------------------------------------------------
create table if not exists public.sales_data (
  id             uuid primary key default gen_random_uuid(),
  month          text not null check (month ~ '^\d{4}-\d{2}$'),
  product_id     uuid references public.products(id) on delete set null,
  product_name   text not null,
  institution_id uuid references public.institutions(id) on delete set null,
  customer_name  text,
  territory_id   uuid references public.territories(id) on delete set null,
  units          numeric not null default 0,
  value          numeric not null default 0,
  currency       text not null default 'EGP',
  source         text,
  batch_id       uuid not null,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists sales_data_month_idx on public.sales_data(month, product_id);
alter table public.sales_data enable row level security;
drop policy if exists sales_data_read on public.sales_data;
create policy sales_data_read on public.sales_data for select to authenticated using (
  (select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager','district_manager'])
  or territory_id = (select pr.territory_id from public.profiles pr where pr.id = (select auth.uid())));
drop policy if exists sales_data_write on public.sales_data;
create policy sales_data_write on public.sales_data for all to authenticated
  using ((select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager','district_manager']))
  with check ((select public.get_user_role()) = any (array['admin','country_manager','sales_director','regional_manager','district_manager']));

-- Sales against verified calls, per product (calls that detailed it) and per
-- customer (calls at that institution), for a month range.
create or replace function public.sales_vs_calls(p_from text, p_to text)
returns table (dimension text, key_id uuid, label text, units numeric, value numeric, verified_calls bigint, value_per_call numeric)
language sql stable security invoker set search_path = '' as $$
  with b as (select to_date(p_from, 'YYYY-MM') d0, (to_date(p_to, 'YYYY-MM') + interval '1 month')::date d1),
  s as (select * from public.sales_data sd where sd.month between p_from and p_to),
  vis as (
    select vi.id, vi.institution_id, vi.products_detailed from public.visits vi, b
     where vi.status = 'completed' and vi.check_in_within_geofence and coalesce(vi.manager_status, '') <> 'rejected'
       and vi.check_in_at >= b.d0 and vi.check_in_at < b.d1
  ),
  prod (dim, k, lbl, u, val, calls) as (
    select 'product'::text, s.product_id, coalesce(p.name, min(s.product_name)), sum(s.units), sum(s.value),
           (select count(*) from vis where s.product_id = any (vis.products_detailed))
      from s left join public.products p on p.id = s.product_id
     group by s.product_id, p.name
  ),
  cust (dim, k, lbl, u, val, calls) as (
    select 'customer'::text, s.institution_id, coalesce(i.name, min(s.customer_name), 'Unmatched'), sum(s.units), sum(s.value),
           (select count(*) from vis where vis.institution_id = s.institution_id)
      from s left join public.institutions i on i.id = s.institution_id
     group by s.institution_id, i.name
  )
  select dim, k, lbl, u, val, calls, case when calls > 0 then round(val / calls, 0) end from prod
  union all
  select dim, k, lbl, u, val, calls, case when calls > 0 then round(val / calls, 0) end from cust
  order by 1, 5 desc
$$;

-- ---------------------------------------------------------------------
-- Demo: the new tables join the nightly reset (visitors' sessions, payouts
-- and imports are wiped; decks and the plan are restored).
-- ---------------------------------------------------------------------
create or replace function public.demo_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'products', 'institution_chains', 'institutions', 'hcps', 'hcp_workplaces',
    'call_targets', 'tour_plans', 'visits', 'rep_locations', 'samples_inventory',
    'samples_transactions', 'orders', 'expenses', 'events', 'event_invitees',
    'compliance_alerts', 'notifications', 'whatsapp_messages', 'activity_log',
    'detailing_slides', 'detailing_sessions', 'incentive_plans', 'incentive_payouts', 'sales_data'
  ]
$$;

-- demo_reset: month-text columns of the new tables move with the calendar,
-- like call_targets.month (only this one condition changes).
do $$
declare d text := pg_get_functiondef('public.demo_reset()'::regprocedure);
        a text := $a$when (t, c.column_name::text) = ('call_targets', 'month')$a$;
        b text := $b$when (t, c.column_name::text) in (('call_targets', 'month'), ('sales_data', 'month'), ('incentive_payouts', 'month'))$b$;
begin
  if position(b in d) > 0 then return; end if;          -- already applied
  if position(a in d) = 0 then raise exception 'demo_reset changed shape; update this migration'; end if;
  execute replace(d, a, b);
end $$;

-- The reset restores every demo table from demo_snapshot, so each new table
-- needs a snapshot copy before the next scheduled reset (filled by 23-...).
create table if not exists demo_snapshot.detailing_slides   as select * from public.detailing_slides   with no data;
create table if not exists demo_snapshot.detailing_sessions as select * from public.detailing_sessions with no data;
create table if not exists demo_snapshot.incentive_plans    as select * from public.incentive_plans    with no data;
create table if not exists demo_snapshot.incentive_payouts  as select * from public.incentive_payouts  with no data;
create table if not exists demo_snapshot.sales_data         as select * from public.sales_data         with no data;
