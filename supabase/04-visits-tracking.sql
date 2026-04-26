-- =====================================================================
-- FOX MEDICAL CRM — STEP 4 SQL
-- 04-visits-tracking.sql
-- Run AFTER 03-medical-entities.sql.
-- Creates: visits, tour_plans, rep_locations, geofence + RPC functions.
-- =====================================================================

-- =====================================================================
-- 1. TOUR PLANS — rep submits daily/weekly call plan in advance.
-- Manager approves before the day starts.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tour_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_date       date NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected','executed')),
  planned_hcps    uuid[] DEFAULT '{}',          -- ordered list of HCP IDs
  planned_route_geojson jsonb,                  -- optional polyline for the day
  estimated_distance_km numeric,
  notes           text,
  submitted_at    timestamptz,
  approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  manager_notes   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rep_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_tour_plans_rep_date ON public.tour_plans(rep_id, plan_date DESC);
CREATE INDEX IF NOT EXISTS idx_tour_plans_status   ON public.tour_plans(status);

CREATE TRIGGER trg_tour_plans_updated_at
  BEFORE UPDATE ON public.tour_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.tour_plans ENABLE ROW LEVEL SECURITY;

-- Rep sees own + managers see team's (recursive)
DROP POLICY IF EXISTS "tour_plans_read_scoped" ON public.tour_plans;
CREATE POLICY "tour_plans_read_scoped" ON public.tour_plans
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "tour_plans_insert_self" ON public.tour_plans;
CREATE POLICY "tour_plans_insert_self" ON public.tour_plans
  FOR INSERT TO authenticated
  WITH CHECK (rep_id = auth.uid() OR public.get_user_role() <> 'medical_rep');

DROP POLICY IF EXISTS "tour_plans_update_scoped" ON public.tour_plans;
CREATE POLICY "tour_plans_update_scoped" ON public.tour_plans
  FOR UPDATE TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

-- =====================================================================
-- 2. VISITS — Daily Call Report (DCR) — THE core pharma table.
-- Geo-verified check-in is what makes this CRM different from everyone else.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hcp_id          uuid NOT NULL REFERENCES public.hcps(id) ON DELETE RESTRICT,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,

  -- Plan reference
  planned_at      timestamptz,
  plan_id         uuid REFERENCES public.tour_plans(id) ON DELETE SET NULL,

  -- ============= CHECK-IN (the differentiator) =============
  check_in_at         timestamptz,
  check_in_lat        numeric(10,7),
  check_in_lng        numeric(10,7),
  check_in_accuracy_m numeric,
  check_in_distance_m numeric,                -- distance from institution location
  check_in_within_geofence boolean,
  check_in_selfie_url text,

  -- ============= CHECK-OUT =============
  check_out_at        timestamptz,
  check_out_lat       numeric(10,7),
  check_out_lng       numeric(10,7),

  duration_minutes int GENERATED ALWAYS AS (
    CASE
      WHEN check_out_at IS NOT NULL AND check_in_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(EPOCH FROM (check_out_at - check_in_at))::int / 60)
      ELSE NULL
    END
  ) STORED,

  -- ============= VISIT CONTENT =============
  visit_type      text CHECK (visit_type IN
    ('detailing','follow_up','sample_drop','order_visit','courtesy','launch','training')),
  status          text NOT NULL DEFAULT 'planned'
                  CHECK (status IN
                    ('planned','in_progress','completed','missed','cancelled','rejected_by_manager')),

  products_detailed     uuid[] DEFAULT '{}',
  detailing_aid_used    text[] DEFAULT '{}',
  doctor_attitude       text CHECK (doctor_attitude IN ('positive','neutral','skeptical','rejecting')),
  doctor_feedback       text,
  objections            text,
  key_message_delivered text,

  -- Outcomes
  samples_given_summary jsonb DEFAULT '{}'::jsonb,    -- {product_id: qty}
  order_taken           boolean DEFAULT false,
  order_id              uuid,                          -- FK added later when orders table exists
  prescription_commitment text,

  -- Follow-up
  next_action     text,
  next_visit_date date,

  -- AI
  ai_summary           text,
  ai_quality_score     int CHECK (ai_quality_score BETWEEN 1 AND 10),
  ai_coaching_notes    text,
  ai_updated_at        timestamptz,

  -- Manager review
  manager_status  text DEFAULT 'pending'
                  CHECK (manager_status IN ('pending','approved','flagged','rejected')),
  manager_notes   text,
  reviewed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,

  territory_id    uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_rep_date    ON public.visits(rep_id, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_hcp         ON public.visits(hcp_id, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_institution ON public.visits(institution_id);
CREATE INDEX IF NOT EXISTS idx_visits_status      ON public.visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_manager     ON public.visits(manager_status) WHERE manager_status='flagged';
CREATE INDEX IF NOT EXISTS idx_visits_in_progress ON public.visits(rep_id) WHERE status='in_progress';

CREATE TRIGGER trg_visits_updated_at
  BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visits_read_scoped" ON public.visits;
CREATE POLICY "visits_read_scoped" ON public.visits
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "visits_insert_self" ON public.visits;
CREATE POLICY "visits_insert_self" ON public.visits
  FOR INSERT TO authenticated
  WITH CHECK (
    rep_id = auth.uid()
    OR public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager','district_manager')
  );

DROP POLICY IF EXISTS "visits_update_scoped" ON public.visits;
CREATE POLICY "visits_update_scoped" ON public.visits
  FOR UPDATE TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "visits_delete_admin" ON public.visits;
CREATE POLICY "visits_delete_admin" ON public.visits
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin','country_manager'));

COMMENT ON TABLE public.visits IS 'Daily Call Report. Geo-verified via PostGIS distance check.';

-- =====================================================================
-- 3. REP_LOCATIONS — high-volume GPS ping table.
-- Every 30s-2min while rep is active. Keep RLS tight.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.rep_locations (
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  latitude        numeric(10,7) NOT NULL,
  longitude       numeric(10,7) NOT NULL,
  location        geography(POINT, 4326) GENERATED ALWAYS AS
                    (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  accuracy_m      numeric,
  speed_kmh       numeric,
  heading         numeric,
  battery_level   int,
  is_charging     boolean,
  is_working_hours boolean DEFAULT true,
  device_info     jsonb,
  PRIMARY KEY (rep_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_rep_locations_geo
  ON public.rep_locations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_rep_locations_latest
  ON public.rep_locations(rep_id, recorded_at DESC);

ALTER TABLE public.rep_locations ENABLE ROW LEVEL SECURITY;

-- Rep can only insert their own pings
DROP POLICY IF EXISTS "rep_locations_insert_self" ON public.rep_locations;
CREATE POLICY "rep_locations_insert_self" ON public.rep_locations
  FOR INSERT TO authenticated
  WITH CHECK (rep_id = auth.uid());

-- Read: managers see their team's locations (recursive), admins see all
DROP POLICY IF EXISTS "rep_locations_read_scoped" ON public.rep_locations;
CREATE POLICY "rep_locations_read_scoped" ON public.rep_locations
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

COMMENT ON TABLE public.rep_locations IS 'High-volume GPS pings. Archive monthly to keep size manageable.';

-- =====================================================================
-- 4. GEOFENCE FUNCTION — used by the check-in API.
-- Returns: { within: bool, distance_m: numeric, allowed_radius_m: int }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_geofence(
  _institution_id uuid,
  _lat numeric,
  _lng numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  inst_record record;
  distance_m numeric;
BEGIN
  SELECT location, geofence_radius_m, name
    INTO inst_record
    FROM public.institutions
   WHERE id = _institution_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','institution_not_found');
  END IF;

  distance_m := ST_Distance(
    inst_record.location,
    ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography
  );

  RETURN jsonb_build_object(
    'within',           distance_m <= inst_record.geofence_radius_m,
    'distance_m',       round(distance_m::numeric, 1),
    'allowed_radius_m', inst_record.geofence_radius_m,
    'institution_name', inst_record.name
  );
END;
$$;

-- =====================================================================
-- 5. RECORD_CHECK_IN RPC — atomic visit creation with geofence check.
-- Called from /api/tracking/check-in.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_check_in(
  _hcp_id         uuid,
  _institution_id uuid,
  _lat            numeric,
  _lng            numeric,
  _accuracy_m     numeric,
  _selfie_url     text DEFAULT NULL,
  _visit_type     text DEFAULT 'detailing',
  _plan_id        uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  geo  jsonb;
  _within boolean;
  _distance numeric;
  _radius int;
  _visit_id uuid;
  _territory_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error','not_authenticated');
  END IF;

  -- 1. Geofence check
  geo := public.check_geofence(_institution_id, _lat, _lng);
  _within   := (geo->>'within')::boolean;
  _distance := (geo->>'distance_m')::numeric;
  _radius   := (geo->>'allowed_radius_m')::int;

  IF geo ? 'error' THEN
    RETURN jsonb_build_object('success', false, 'error', geo->>'error');
  END IF;

  IF NOT _within THEN
    RETURN jsonb_build_object(
      'success',     false,
      'error',       'outside_geofence',
      'distance_m',  _distance,
      'allowed_radius_m', _radius,
      'message',     format('You are %sm from this institution. Allowed radius: %sm.', _distance, _radius)
    );
  END IF;

  -- 2. Get rep's territory for the visit
  SELECT territory_id INTO _territory_id FROM public.profiles WHERE id = _uid;

  -- 3. Create the visit row
  INSERT INTO public.visits (
    rep_id, hcp_id, institution_id, plan_id,
    visit_type, status,
    check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m,
    check_in_distance_m, check_in_within_geofence, check_in_selfie_url,
    territory_id
  ) VALUES (
    _uid, _hcp_id, _institution_id, _plan_id,
    _visit_type, 'in_progress',
    now(), _lat, _lng, _accuracy_m,
    _distance, true, _selfie_url,
    _territory_id
  )
  RETURNING id INTO _visit_id;

  RETURN jsonb_build_object(
    'success',    true,
    'visit_id',   _visit_id,
    'distance_m', _distance,
    'institution_name', geo->>'institution_name'
  );
END;
$$;

-- =====================================================================
-- 6. RECORD_CHECK_OUT RPC — closes the active visit.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_check_out(
  _visit_id uuid,
  _lat      numeric,
  _lng      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.visits;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error','not_authenticated');
  END IF;

  SELECT * INTO _row FROM public.visits WHERE id = _visit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error','visit_not_found');
  END IF;

  IF _row.rep_id <> _uid THEN
    RETURN jsonb_build_object('success', false, 'error','not_owner');
  END IF;

  IF _row.status <> 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error','not_in_progress');
  END IF;

  UPDATE public.visits
     SET check_out_at  = now(),
         check_out_lat = _lat,
         check_out_lng = _lng,
         status        = 'completed'
   WHERE id = _visit_id;

  RETURN jsonb_build_object('success', true, 'visit_id', _visit_id);
END;
$$;

-- =====================================================================
-- 7. NEAREST INSTITUTIONS RPC — for the check-in UI.
-- "What's the closest clinic to where I'm standing right now?"
-- =====================================================================
CREATE OR REPLACE FUNCTION public.nearest_institutions(
  _lat numeric,
  _lng numeric,
  _limit int DEFAULT 10
) RETURNS TABLE (
  id uuid,
  name text,
  type text,
  distance_m numeric,
  geofence_radius_m int,
  within_geofence boolean,
  latitude numeric,
  longitude numeric,
  district text
)
LANGUAGE sql
STABLE
AS $$
  WITH ref AS (
    SELECT ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography AS p
  )
  SELECT
    i.id,
    i.name,
    i.type,
    round(ST_Distance(i.location, ref.p)::numeric, 1) AS distance_m,
    i.geofence_radius_m,
    ST_Distance(i.location, ref.p) <= i.geofence_radius_m AS within_geofence,
    i.latitude,
    i.longitude,
    i.district
  FROM public.institutions i, ref
  WHERE i.is_active = true
  ORDER BY i.location <-> ref.p
  LIMIT _limit;
$$;

-- =====================================================================
-- VERIFICATION
-- =====================================================================
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('visits','tour_plans','rep_locations')
 ORDER BY table_name;
-- Expected: 3 rows

SELECT proname FROM pg_proc
 WHERE pronamespace='public'::regnamespace
   AND proname IN ('check_geofence','record_check_in','record_check_out','nearest_institutions')
 ORDER BY proname;
-- Expected: 4 rows

-- Test geofence on the seeded Maadi clinic — point exactly there should be "within"
SELECT public.check_geofence(
  (SELECT id FROM public.institutions WHERE name='Maadi Polyclinic Demo'),
  29.9603, 31.2569
);
-- Expected: { within: true, distance_m: ~0, ... }

-- Test nearest from Tahrir-ish coords
SELECT * FROM public.nearest_institutions(30.0444, 31.2357, 5);
-- Expected: 5 rows ordered by distance
