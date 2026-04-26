-- =====================================================================
-- FOX MEDICAL CRM — STEP 8 / 9
-- 07-targets-reports.sql
-- Run AFTER 06-samples-orders-expenses.sql.
-- =====================================================================

-- =====================================================================
-- 1. CALL_TARGETS — monthly KPI targets per rep
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.call_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month           text NOT NULL,                        -- 'YYYY-MM'
  calls_target    int NOT NULL DEFAULT 0,
  coverage_target int NOT NULL DEFAULT 0,
  -- per-segment frequency: {"A":4,"B":3,"C":2,"D":1}
  frequency_target jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_compliance_target numeric DEFAULT 95.0,        -- %
  order_value_target numeric DEFAULT 0,                 -- EGP
  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rep_id, month)
);

CREATE INDEX IF NOT EXISTS idx_call_targets_month ON public.call_targets(month);

CREATE TRIGGER trg_call_targets_updated_at
  BEFORE UPDATE ON public.call_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.call_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "targets_read_scoped" ON public.call_targets;
CREATE POLICY "targets_read_scoped" ON public.call_targets
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "targets_write_managers" ON public.call_targets;
CREATE POLICY "targets_write_managers" ON public.call_targets
  FOR ALL TO authenticated
  USING (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager'))
  WITH CHECK (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager'));

-- =====================================================================
-- 2. REP_DAILY_STATS view — quick dashboards / leaderboard
-- =====================================================================
CREATE OR REPLACE VIEW public.rep_daily_stats AS
SELECT
  v.rep_id,
  date_trunc('day', v.check_in_at) AS day,
  COUNT(*) FILTER (WHERE v.status='completed')      AS completed_calls,
  COUNT(*) FILTER (WHERE v.check_in_within_geofence=true) AS verified_calls,
  COUNT(*) FILTER (WHERE v.manager_status='flagged') AS flagged_calls,
  COUNT(DISTINCT v.hcp_id)                           AS unique_hcps,
  AVG(v.duration_minutes)                            AS avg_duration_min,
  AVG(v.ai_quality_score)                            AS avg_quality_score,
  SUM(CASE WHEN v.order_taken THEN 1 ELSE 0 END)     AS orders_taken
FROM public.visits v
WHERE v.check_in_at IS NOT NULL
GROUP BY v.rep_id, date_trunc('day', v.check_in_at);

-- =====================================================================
-- 3. REP_MONTHLY_PERFORMANCE — for leaderboard
-- =====================================================================
CREATE OR REPLACE VIEW public.rep_monthly_performance AS
WITH this_month AS (
  SELECT
    v.rep_id,
    to_char(v.check_in_at, 'YYYY-MM') AS month,
    COUNT(*) FILTER (WHERE v.status='completed') AS completed_calls,
    COUNT(*) FILTER (WHERE v.check_in_within_geofence=true) AS verified_calls,
    COUNT(*) FILTER (WHERE v.manager_status='flagged') AS flagged_calls,
    COUNT(DISTINCT v.hcp_id) AS unique_hcps,
    AVG(v.ai_quality_score) AS avg_quality,
    SUM(CASE WHEN v.order_taken THEN 1 ELSE 0 END) AS orders_taken
  FROM public.visits v
  WHERE v.check_in_at >= date_trunc('month', now())
  GROUP BY v.rep_id, to_char(v.check_in_at, 'YYYY-MM')
)
SELECT
  p.id            AS rep_id,
  p.full_name,
  p.role,
  p.product_line,
  COALESCE(tm.month, to_char(now(), 'YYYY-MM')) AS month,
  COALESCE(tm.completed_calls, 0) AS completed_calls,
  COALESCE(tm.verified_calls, 0)  AS verified_calls,
  COALESCE(tm.flagged_calls, 0)   AS flagged_calls,
  COALESCE(tm.unique_hcps, 0)     AS unique_hcps,
  COALESCE(round(tm.avg_quality::numeric, 1), 0) AS avg_quality,
  COALESCE(tm.orders_taken, 0)    AS orders_taken,
  ct.calls_target,
  ct.coverage_target,
  CASE WHEN ct.calls_target > 0
       THEN round((COALESCE(tm.completed_calls,0)::numeric / ct.calls_target) * 100, 1)
       ELSE NULL END AS calls_attainment_pct,
  CASE WHEN ct.coverage_target > 0
       THEN round((COALESCE(tm.unique_hcps,0)::numeric / ct.coverage_target) * 100, 1)
       ELSE NULL END AS coverage_attainment_pct
FROM public.profiles p
LEFT JOIN this_month tm ON tm.rep_id = p.id
LEFT JOIN public.call_targets ct ON ct.rep_id = p.id
                                 AND ct.month = COALESCE(tm.month, to_char(now(), 'YYYY-MM'))
WHERE p.role IN ('medical_rep','medical_rep_senior')
  AND p.is_active = true;

GRANT SELECT ON public.rep_daily_stats        TO authenticated;
GRANT SELECT ON public.rep_monthly_performance TO authenticated;

-- =====================================================================
-- 4. HCP_COVERAGE — last visit per HCP, days since
-- =====================================================================
CREATE OR REPLACE VIEW public.hcp_coverage AS
SELECT
  h.id,
  h.full_name,
  h.specialty,
  h.segment,
  h.assigned_rep_id,
  h.territory_id,
  COUNT(v.id) AS total_visits_last_90d,
  MAX(v.check_in_at) AS last_visit_at,
  EXTRACT(DAY FROM now() - MAX(v.check_in_at))::int AS days_since_last_visit
FROM public.hcps h
LEFT JOIN public.visits v
  ON v.hcp_id = h.id
 AND v.check_in_at >= now() - interval '90 days'
 AND v.status = 'completed'
WHERE h.is_active = true
GROUP BY h.id, h.full_name, h.specialty, h.segment, h.assigned_rep_id, h.territory_id;

GRANT SELECT ON public.hcp_coverage TO authenticated;

-- =====================================================================
-- Verification
-- =====================================================================
SELECT viewname FROM pg_views
 WHERE schemaname='public'
   AND viewname IN ('rep_daily_stats','rep_monthly_performance','hcp_coverage')
 ORDER BY viewname;
-- Expected: 3 rows
