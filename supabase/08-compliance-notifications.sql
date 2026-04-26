-- =====================================================================
-- FOX MEDICAL CRM — STEP 10 / 11
-- 08-compliance-notifications.sql
-- =====================================================================

-- =====================================================================
-- 1. COMPLIANCE_ALERTS — anomaly detection results
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.compliance_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type      text NOT NULL CHECK (alert_type IN (
    'check_in_outside_geofence',
    'impossible_travel_speed',
    'duplicate_visit',
    'visit_too_short',
    'no_movement_during_hours',
    'sample_discrepancy',
    'after_hours_check_in',
    'off_territory'
  )),
  severity        text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  related_visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  evidence        jsonb,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','reviewing','resolved','false_positive')),
  detected_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  resolution_notes text
);

CREATE INDEX IF NOT EXISTS idx_compliance_rep      ON public.compliance_alerts(rep_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_status   ON public.compliance_alerts(status);
CREATE INDEX IF NOT EXISTS idx_compliance_severity ON public.compliance_alerts(severity);

ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

-- Reps see their own alerts; managers see team's; senior roles see all
DROP POLICY IF EXISTS "compliance_read_scoped" ON public.compliance_alerts;
CREATE POLICY "compliance_read_scoped" ON public.compliance_alerts
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "compliance_write_managers" ON public.compliance_alerts;
CREATE POLICY "compliance_write_managers" ON public.compliance_alerts
  FOR ALL TO authenticated
  USING (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager'))
  WITH CHECK (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager'));

-- =====================================================================
-- 2. ANOMALY DETECTION FUNCTION
-- Run this on a schedule (Supabase cron) or after each check-in.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.detect_visit_anomalies(_lookback_hours int DEFAULT 24)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  prev record;
  inserted_count int := 0;
  travel_distance_m numeric;
  travel_time_hours numeric;
  travel_speed_kmh numeric;
BEGIN
  FOR v IN
    SELECT * FROM public.visits
     WHERE check_in_at >= now() - (_lookback_hours || ' hours')::interval
       AND status IN ('in_progress','completed')
  LOOP
    -- Anomaly 1: outside geofence
    IF v.check_in_within_geofence = false THEN
      INSERT INTO public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
      VALUES (v.rep_id, 'check_in_outside_geofence', 'high', v.id,
              jsonb_build_object('distance_m', v.check_in_distance_m))
      ON CONFLICT DO NOTHING;
      inserted_count := inserted_count + 1;
    END IF;

    -- Anomaly 2: visit too short (< 3 min)
    IF v.duration_minutes IS NOT NULL AND v.duration_minutes < 3 AND v.status='completed' THEN
      INSERT INTO public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
      VALUES (v.rep_id, 'visit_too_short', 'medium', v.id,
              jsonb_build_object('duration_minutes', v.duration_minutes))
      ON CONFLICT DO NOTHING;
      inserted_count := inserted_count + 1;
    END IF;

    -- Anomaly 3: impossible travel speed (vs previous visit same day)
    SELECT * INTO prev FROM public.visits
     WHERE rep_id = v.rep_id
       AND check_in_at < v.check_in_at
       AND check_in_at::date = v.check_in_at::date
     ORDER BY check_in_at DESC LIMIT 1;

    IF FOUND AND v.check_in_lat IS NOT NULL AND prev.check_in_lat IS NOT NULL THEN
      travel_distance_m := ST_Distance(
        ST_SetSRID(ST_MakePoint(prev.check_in_lng, prev.check_in_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(v.check_in_lng, v.check_in_lat), 4326)::geography
      );
      travel_time_hours := EXTRACT(EPOCH FROM (v.check_in_at - prev.check_in_at)) / 3600;
      IF travel_time_hours > 0 THEN
        travel_speed_kmh := (travel_distance_m / 1000) / travel_time_hours;
        IF travel_speed_kmh > 120 THEN
          INSERT INTO public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
          VALUES (v.rep_id, 'impossible_travel_speed', 'critical', v.id,
                  jsonb_build_object('speed_kmh', round(travel_speed_kmh::numeric,1),
                                     'distance_km', round((travel_distance_m/1000)::numeric, 1),
                                     'time_min', round((travel_time_hours*60)::numeric, 1),
                                     'previous_visit_id', prev.id))
          ON CONFLICT DO NOTHING;
          inserted_count := inserted_count + 1;
        END IF;
      END IF;
    END IF;

    -- Anomaly 4: duplicate visit (same hcp + rep + date)
    IF EXISTS (
      SELECT 1 FROM public.visits v2
       WHERE v2.id <> v.id
         AND v2.rep_id = v.rep_id
         AND v2.hcp_id = v.hcp_id
         AND v2.check_in_at::date = v.check_in_at::date
         AND v2.status='completed'
    ) THEN
      INSERT INTO public.compliance_alerts (rep_id, alert_type, severity, related_visit_id, evidence)
      VALUES (v.rep_id, 'duplicate_visit', 'medium', v.id,
              jsonb_build_object('hcp_id', v.hcp_id, 'date', v.check_in_at::date))
      ON CONFLICT DO NOTHING;
      inserted_count := inserted_count + 1;
    END IF;

    -- Auto-flag visit if any high/critical alert was raised
    IF EXISTS (SELECT 1 FROM public.compliance_alerts
                WHERE related_visit_id = v.id
                  AND severity IN ('high','critical')) THEN
      UPDATE public.visits SET manager_status='flagged' WHERE id = v.id;
    END IF;

  END LOOP;

  RETURN inserted_count;
END;
$$;

-- =====================================================================
-- 3. PUSH_SUBSCRIPTIONS — VAPID push
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_owner" ON public.push_subscriptions;
CREATE POLICY "push_subs_owner" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =====================================================================
-- 4. NOTIFICATIONS — in-app notifications & tasks
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN
    ('compliance_alert','task','reminder','approval_request','system','message')),
  title           text NOT NULL,
  body            text,
  link_url        text,
  is_read         boolean NOT NULL DEFAULT false,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_owner" ON public.notifications;
CREATE POLICY "notifications_owner" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow managers to insert notifications targeted at subordinates
DROP POLICY IF EXISTS "notifications_insert_for_team" ON public.notifications;
CREATE POLICY "notifications_insert_for_team" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    user_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid())) OR
    public.get_user_role() IN ('admin','country_manager','sales_director')
  );

-- =====================================================================
-- 5. WHATSAPP_MESSAGES log
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id          uuid REFERENCES public.hcps(id) ON DELETE SET NULL,
  visit_id        uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  rep_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone           text NOT NULL,
  message         text NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('out','in')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','sending','sent','delivered','read','failed')),
  provider        text DEFAULT 'wa_link',  -- wa_link / ultramsg
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_msgs_hcp ON public.whatsapp_messages(hcp_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_rep ON public.whatsapp_messages(rep_id, created_at DESC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_msgs_read_scoped" ON public.whatsapp_messages;
CREATE POLICY "wa_msgs_read_scoped" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "wa_msgs_insert_self" ON public.whatsapp_messages;
CREATE POLICY "wa_msgs_insert_self" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (rep_id = auth.uid() OR public.get_user_role() <> 'medical_rep');

-- =====================================================================
-- Verification
-- =====================================================================
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('compliance_alerts','push_subscriptions','notifications','whatsapp_messages','call_targets')
 ORDER BY table_name;
-- Expected: 5 rows

SELECT proname FROM pg_proc
 WHERE pronamespace='public'::regnamespace
   AND proname IN ('detect_visit_anomalies')
 ORDER BY proname;
-- Expected: 1 row

-- Test the anomaly detector (will return number of alerts inserted)
SELECT public.detect_visit_anomalies(168);  -- last 7 days
