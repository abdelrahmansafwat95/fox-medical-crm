-- ============================================================================
-- 16 · Compliance scan: one alert per visit and kind (applied live, 2026-09-27)
-- ============================================================================
-- detect_visit_anomalies() relied on ON CONFLICT DO NOTHING, but nothing was
-- unique, so every "Run scan" inserted the same alerts again (907 rows, ~430
-- real) and reported them all as "new". It also counted attempts, not inserts,
-- and re-flagged visits a manager had already approved.

-- keep the earliest copy of each (visit, kind), in the live table and the demo snapshot
delete from public.compliance_alerts a
 using public.compliance_alerts b
 where a.related_visit_id = b.related_visit_id and a.alert_type = b.alert_type
   and (a.detected_at, a.id) > (b.detected_at, b.id);
delete from demo_snapshot.compliance_alerts a
 using demo_snapshot.compliance_alerts b
 where a.related_visit_id = b.related_visit_id and a.alert_type = b.alert_type
   and (a.detected_at, a.id) > (b.detected_at, b.id);

create unique index if not exists compliance_alerts_visit_type_uniq
  on public.compliance_alerts (related_visit_id, alert_type);

create or replace function public.detect_visit_anomalies(_lookback_hours integer default 24)
returns integer language plpgsql security definer
set search_path to 'public', 'extensions' as $function$
declare
  v record;
  prev record;
  inserted_count int := 0;
  n int;
  travel_distance_m numeric;
  travel_time_hours numeric;
  travel_speed_kmh numeric;
begin
  for v in
    select * from public.visits
     where check_in_at >= now() - (_lookback_hours || ' hours')::interval
       and status in ('in_progress','completed')
  loop
    if v.check_in_within_geofence = false then
      insert into public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
      values (v.rep_id, 'check_in_outside_geofence', 'high', v.id,
              jsonb_build_object('distance_m', v.check_in_distance_m))
      on conflict (related_visit_id, alert_type) do nothing;
      get diagnostics n = row_count; inserted_count := inserted_count + n;
    end if;

    if v.duration_minutes is not null and v.duration_minutes < 3 and v.status = 'completed' then
      insert into public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
      values (v.rep_id, 'visit_too_short', 'medium', v.id,
              jsonb_build_object('duration_minutes', v.duration_minutes))
      on conflict (related_visit_id, alert_type) do nothing;
      get diagnostics n = row_count; inserted_count := inserted_count + n;
    end if;

    select * into prev from public.visits
     where rep_id = v.rep_id
       and check_in_at < v.check_in_at
       and check_in_at::date = v.check_in_at::date
     order by check_in_at desc limit 1;

    if found and v.check_in_lat is not null and prev.check_in_lat is not null then
      travel_distance_m := ST_Distance(
        ST_SetSRID(ST_MakePoint(prev.check_in_lng, prev.check_in_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(v.check_in_lng, v.check_in_lat), 4326)::geography
      );
      travel_time_hours := extract(epoch from (v.check_in_at - prev.check_in_at)) / 3600;
      if travel_time_hours > 0 then
        travel_speed_kmh := (travel_distance_m / 1000) / travel_time_hours;
        if travel_speed_kmh > 120 then
          insert into public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
          values (v.rep_id, 'impossible_travel_speed', 'critical', v.id,
                  jsonb_build_object('speed_kmh', round(travel_speed_kmh::numeric, 1),
                                     'distance_km', round((travel_distance_m / 1000)::numeric, 1),
                                     'time_min', round((travel_time_hours * 60)::numeric, 1),
                                     'previous_visit_id', prev.id))
          on conflict (related_visit_id, alert_type) do nothing;
          get diagnostics n = row_count; inserted_count := inserted_count + n;
        end if;
      end if;
    end if;

    if exists (
      select 1 from public.visits v2
       where v2.id <> v.id
         and v2.rep_id = v.rep_id
         and v2.hcp_id = v.hcp_id
         and v2.check_in_at::date = v.check_in_at::date
         and v2.status = 'completed'
    ) then
      insert into public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
      values (v.rep_id, 'duplicate_visit', 'medium', v.id,
              jsonb_build_object('hcp_id', v.hcp_id, 'date', v.check_in_at::date))
      on conflict (related_visit_id, alert_type) do nothing;
      get diagnostics n = row_count; inserted_count := inserted_count + n;
    end if;

    if exists (select 1 from public.compliance_alerts
                where related_visit_id = v.id
                  and severity in ('high','critical')) then
      update public.visits set manager_status = 'flagged'
       where id = v.id and manager_status = 'pending';  -- a manager's decision stands on rescans
    end if;
  end loop;
  return inserted_count;
end;
$function$;
