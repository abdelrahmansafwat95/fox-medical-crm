-- =====================================================================
-- 23 — demo content for e-detailing, incentives and sales (2026-09-28).
-- Idempotent: clears and re-seeds only these demo rows, then writes the
-- same rows into demo_snapshot (dates moved back to the snapshot's as_of so
-- the nightly reset moves them forward again like everything else).
-- =====================================================================
do $$
declare
  app text := 'https://fox-medical-crm.vercel.app/detailing-demo/';
  decks jsonb := '[
    {"product":"7ac1a797-9fcc-42a8-ba75-8d49147bf541","slug":"cardia-5","titles":["Cardia 5 mg","Why Cardia?","Cardia in practice"]},
    {"product":"8d922152-9e04-47f5-9fb3-1f92e62b07cd","slug":"glucova-500","titles":["Glucova 500 mg","Why Glucova?","Glucova in practice"]},
    {"product":"9e23205d-8a7b-4159-b486-1628c4344417","slug":"augmexa-1g","titles":["Augmexa 1 g","Why Augmexa?","Augmexa in practice"]},
    {"product":"0c536b47-861e-4874-b03b-22c0eafac3f6","slug":"lipidor-20","titles":["Lipidor 20 mg","Why Lipidor?","Lipidor in practice"]}]';
  d jsonb; i int;
  v_as_of timestamptz; v_shift interval; v_months int;
  batch uuid := '5a1e5000-0000-4000-8000-000000000001';
begin
  -- slides
  delete from public.detailing_slides where image_url like app || '%';
  for d in select * from jsonb_array_elements(decks) loop
    for i in 1..3 loop
      insert into public.detailing_slides (product_id, position, title, image_url, key_message, created_by)
      values ((d->>'product')::uuid, i, d->'titles'->>(i - 1), app || (d->>'slug') || '-' || i || '.jpg',
              case i when 1 then 'Open with the indication and ask about their current first choice.'
                     when 2 then 'Pause on the key messages; ask which matters most for their patients.'
                     else 'Close: agree a next step (samples, a trial on 3 patients, a follow-up date).' end, null);
    end loop;
  end loop;

  -- the incentive plan
  delete from public.incentive_plans where name = 'Standard field incentive';
  insert into public.incentive_plans (name, effective_from, created_by) values ('Standard field incentive', date '2026-01-01', null);

  -- detailing sessions on ~40% of recent GPS-verified visits
  delete from public.detailing_sessions ds using public.detailing_slides s
   where s.product_id = ds.product_id and s.image_url like app || '%';
  insert into public.detailing_sessions (visit_id, rep_id, hcp_id, product_id, started_at, total_seconds, slides)
  select v.id, v.rep_id, v.hcp_id, pick.product_id, v.check_in_at + interval '4 minutes',
         (select sum((e->>'seconds')::int) from jsonb_array_elements(sl.slides) e), sl.slides
    from public.visits v
    cross join lateral (
      select (decks->(abs(hashtext(v.id::text)) % 4)->>'product')::uuid product_id) pick
    cross join lateral (
      select jsonb_agg(jsonb_build_object('slide_id', s.id,
               'seconds', 8 + abs(hashtext(v.id::text || s.id::text)) % (case s.position when 2 then 45 else 25 end))
             order by s.position) slides
        from public.detailing_slides s where s.product_id = pick.product_id) sl
   where v.status = 'completed' and v.check_in_within_geofence and v.hcp_id is not null
     and v.check_in_at >= now() - interval '60 days'
     and exists (select 1 from demo_snapshot.visits sv where sv.id = v.id)   -- sample visits only, never a visitor's own
     and abs(hashtext('d' || v.id::text)) % 10 < 4;

  -- three months of sales, heavier where reps call more
  delete from public.sales_data where batch_id = batch;
  insert into public.sales_data (month, product_id, product_name, institution_id, customer_name, units, value, currency, source, batch_id, created_by)
  select to_char(m, 'YYYY-MM'), p.id, p.name, ins.id, ins.name, u.units, round(u.units * coalesce(p.list_price, 60), 2), 'EGP',
         'Distributor sales (demo)', batch, null
    from generate_series(date_trunc('month', now()) - interval '2 months', date_trunc('month', now()), interval '1 month') m
    cross join public.institutions ins
    cross join public.products p
    cross join lateral (
      select (10 + abs(hashtext(to_char(m, 'YYYYMM') || ins.id::text || p.id::text)) % 60
              + 6 * (select count(*) from public.visits vv where vv.institution_id = ins.id and vv.status = 'completed'
                                                            and vv.check_in_at >= m - interval '1 month' and vv.check_in_at < m + interval '1 month'))::numeric units) u
   where p.is_active and p.name <> 'Concor 5mg'
     and abs(hashtext(ins.id::text || p.id::text)) % 3 <> 0;

  -- ---- write the same rows into the snapshot, in the snapshot's own dates ----
  select as_of into v_as_of from demo_snapshot.meta where id = 1;
  v_shift  := date_trunc('day', now()) - date_trunc('day', v_as_of);
  v_months := (extract(year from now())::int * 12 + extract(month from now())::int)
            - (extract(year from v_as_of)::int * 12 + extract(month from v_as_of)::int);

  delete from demo_snapshot.detailing_slides;   insert into demo_snapshot.detailing_slides   select * from public.detailing_slides;
  delete from demo_snapshot.incentive_plans;    insert into demo_snapshot.incentive_plans    select * from public.incentive_plans;
  update demo_snapshot.detailing_slides   set created_at = created_at - v_shift;
  update demo_snapshot.incentive_plans    set created_at = created_at - v_shift;   -- effective_from is a date: moved too, like every date
  update demo_snapshot.incentive_plans    set effective_from = (effective_from - v_shift)::date;

  delete from demo_snapshot.detailing_sessions;
  insert into demo_snapshot.detailing_sessions select * from public.detailing_sessions;
  update demo_snapshot.detailing_sessions set started_at = started_at - v_shift, created_at = created_at - v_shift;

  delete from demo_snapshot.sales_data;
  insert into demo_snapshot.sales_data select * from public.sales_data where batch_id = batch;
  update demo_snapshot.sales_data
     set month = to_char(to_date(month, 'YYYY-MM') - make_interval(months => v_months), 'YYYY-MM'),
         created_at = created_at - v_shift;

  delete from demo_snapshot.incentive_payouts;

  -- the snapshot's visits get the same "detailed" marks the trigger put on the live ones
  update demo_snapshot.visits sv
     set products_detailed  = array(select distinct unnest(coalesce(sv.products_detailed, '{}'::uuid[]) || array[ds.product_id])),
         detailing_aid_used = array(select distinct unnest(coalesce(sv.detailing_aid_used, '{}'::text[]) || array['e-detailing']))
    from demo_snapshot.detailing_sessions ds
   where ds.visit_id = sv.id;
end $$;
