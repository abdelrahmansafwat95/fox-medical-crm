-- ============================================================================
-- 15 · Live Tracking in the public demo (applied live, 2026-09-27)
-- ============================================================================
-- The map works now (MapLibre + the MapTiler key already on Vercel), so demo
-- visitors get Live Tracking back; only the AI assistant stays hidden until
-- its provider is decided (the Anthropic key on Vercel is invalid).
--
-- The nightly reset moves sample data forward by whole days, so pings seeded
-- in the evening land later than "now" and showed "-659m ago". Every 15
-- minutes: pull future pings back a day, and give each rep's latest ping a
-- time in the last 25 minutes, so the demo map shows a believable mix of
-- active and idle reps all day. Demo-only: this project is the showcase.

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
    -- only the AI assistant is hidden now
    insert into public.permissions(target_type, target_id, resource, action, scope, granted)
    values ('user', p_user_id::text, 'assistant', 'view', 'all', false);
  end if;
  insert into demo_ops.visitors(user_id, email, full_name, phone, phone_normalized,
                                contact_email, company, team_size, language, ip)
  values (p_user_id, p_email, p_full_name, p_phone, p_phone_normalized,
          nullif(p_contact_email, ''), nullif(p_company, ''), nullif(p_team_size, ''), p_lang, p_ip);
end $$;

-- visitors already signed up get Live Tracking back too
delete from public.permissions p
 using public.profiles pr
 where p.target_type = 'user' and p.target_id = pr.id::text and pr.is_demo_visitor
   and p.resource = 'tracking' and p.action = 'view' and p.granted = false;

create or replace function public.demo_liven_tracking() returns void
language sql security definer set search_path = public as $$
  update public.rep_locations set recorded_at = recorded_at - interval '1 day' where recorded_at > now();
  with latest as (
    select distinct on (rep_id) rep_id, recorded_at
      from public.rep_locations order by rep_id, recorded_at desc
  )
  update public.rep_locations r
     set recorded_at = now() - random() * interval '25 minutes'
    from latest l
   where r.rep_id = l.rep_id and r.recorded_at = l.recorded_at;
$$;
revoke all on function public.demo_liven_tracking() from public, anon, authenticated;
select cron.schedule('demo-liven-tracking', '*/15 * * * *', 'select public.demo_liven_tracking()');
select public.demo_liven_tracking();
