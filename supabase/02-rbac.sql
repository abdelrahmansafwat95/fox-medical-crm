-- =====================================================================
-- FOX MEDICAL CRM — STEP 1 / FILE 3 of 3
-- 02-rbac.sql — Permissions matrix + helper functions
-- Run AFTER 01-org-structure.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- PERMISSIONS: granular per-resource × action × scope matrix.
-- Resources, actions, and scopes are pharma-tuned (vs. Fox RE's set).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who the rule applies to:
  --   role       → applies to anyone with that role
  --   user       → applies to a specific profile
  --   territory  → applies to all reps in a territory (rare; kept for flexibility)
  target_type     text NOT NULL CHECK (target_type IN ('role','user','territory')),
  target_id       text NOT NULL,    -- role name OR profile_id OR territory_id (as text)

  -- What it controls
  resource        text NOT NULL CHECK (resource IN (
                    'hcps','institutions','products','visits','samples',
                    'orders','tracking','reports','team','settings','expenses','tour_plans'
                  )),
  action          text NOT NULL CHECK (action IN (
                    'view','create','edit','delete','export','assign','approve'
                  )),
  scope           text NOT NULL CHECK (scope IN ('own','team','territory','all')),

  granted         boolean NOT NULL DEFAULT true,
  granted_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (target_type, target_id, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_permissions_target
  ON public.permissions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource
  ON public.permissions(resource, action);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write the permissions table itself.
DROP POLICY IF EXISTS "permissions_admin_only" ON public.permissions;
CREATE POLICY "permissions_admin_only" ON public.permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles
                       WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------
-- HELPER: get_user_role()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role(_uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _uid;
$$;

-- ---------------------------------------------------------------------
-- HELPER: get_subordinate_ids()
-- Returns the set of profile IDs that the given user manages,
-- recursively walking the line_manager_id tree. Includes self.
-- This is what every "team scope" RLS policy uses.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_subordinate_ids(_uid uuid DEFAULT auth.uid())
RETURNS TABLE(profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.profiles WHERE id = _uid
    UNION
    SELECT p.id
      FROM public.profiles p
      JOIN tree t ON p.line_manager_id = t.id
  )
  SELECT id FROM tree;
$$;

COMMENT ON FUNCTION public.get_subordinate_ids(uuid)
  IS 'Recursive: returns _uid plus everyone reporting under them at any depth.';

-- ---------------------------------------------------------------------
-- HELPER: has_permission()
-- Checks role-level, user-level, and territory-level rules in that order.
-- Admin always returns true.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(
  _resource text,
  _action   text,
  _uid      uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role         text;
  _territory_id uuid;
  _granted      boolean;
BEGIN
  SELECT role, territory_id INTO _role, _territory_id
    FROM public.profiles WHERE id = _uid;

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  -- Admin = unconditional yes.
  IF _role = 'admin' THEN
    RETURN true;
  END IF;

  -- 1. User-level override (most specific).
  SELECT granted INTO _granted
    FROM public.permissions
   WHERE target_type='user'
     AND target_id = _uid::text
     AND resource = _resource
     AND action   = _action
   LIMIT 1;
  IF FOUND THEN RETURN _granted; END IF;

  -- 2. Territory-level.
  IF _territory_id IS NOT NULL THEN
    SELECT granted INTO _granted
      FROM public.permissions
     WHERE target_type='territory'
       AND target_id = _territory_id::text
       AND resource = _resource
       AND action   = _action
     LIMIT 1;
    IF FOUND THEN RETURN _granted; END IF;
  END IF;

  -- 3. Role-level (default).
  SELECT granted INTO _granted
    FROM public.permissions
   WHERE target_type='role'
     AND target_id = _role
     AND resource = _resource
     AND action   = _action
   LIMIT 1;
  IF FOUND THEN RETURN _granted; END IF;

  -- No rule found = deny by default.
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------
-- HELPER: get_permission_scope()
-- Returns the scope ('own','team','territory','all') for a given action,
-- so RLS policies can build the right WHERE clause.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_permission_scope(
  _resource text,
  _action   text,
  _uid      uuid DEFAULT auth.uid()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
  _scope text;
BEGIN
  SELECT role INTO _role FROM public.profiles WHERE id = _uid;
  IF _role = 'admin' THEN RETURN 'all'; END IF;

  -- User override
  SELECT scope INTO _scope
    FROM public.permissions
   WHERE target_type='user' AND target_id=_uid::text
     AND resource=_resource AND action=_action AND granted=true
   LIMIT 1;
  IF FOUND THEN RETURN _scope; END IF;

  -- Role default
  SELECT scope INTO _scope
    FROM public.permissions
   WHERE target_type='role' AND target_id=_role
     AND resource=_resource AND action=_action AND granted=true
   LIMIT 1;
  RETURN COALESCE(_scope, 'own');
END;
$$;

-- =====================================================================
-- SEED DEFAULT ROLE PERMISSIONS
-- Standard pharma hierarchy. You can override any of these per-user
-- later via the Permissions admin UI we'll build.
-- =====================================================================

-- Wipe and reseed (idempotent on re-runs)
DELETE FROM public.permissions WHERE target_type='role';

-- Helper macro: do/language block to keep this readable
DO $seed$
DECLARE
  r text;
  res text;
  act text;
  resources text[] := ARRAY['hcps','institutions','products','visits','samples',
                            'orders','tracking','reports','team','settings',
                            'expenses','tour_plans'];
  actions   text[] := ARRAY['view','create','edit','delete','export','assign','approve'];
BEGIN

  -- ============================================================
  -- ADMIN: handled via fast-path in has_permission(), no rows needed.
  -- ============================================================

  -- ============================================================
  -- COUNTRY MANAGER + SALES DIRECTOR: scope='all' on most things.
  -- ============================================================
  FOREACH r IN ARRAY ARRAY['country_manager','sales_director'] LOOP
    FOREACH res IN ARRAY resources LOOP
      FOREACH act IN ARRAY actions LOOP
        -- skip delete on most things; allow approve everywhere
        IF act = 'delete' AND res NOT IN ('tour_plans','expenses') THEN CONTINUE; END IF;
        INSERT INTO public.permissions(target_type,target_id,resource,action,scope,granted)
        VALUES ('role', r, res, act, 'all', true)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  -- ============================================================
  -- REGIONAL MANAGER: scope='team' on most things.
  -- ============================================================
  FOREACH res IN ARRAY resources LOOP
    FOREACH act IN ARRAY ARRAY['view','create','edit','export','assign','approve'] LOOP
      INSERT INTO public.permissions(target_type,target_id,resource,action,scope,granted)
      VALUES ('role','regional_manager', res, act, 'team', true)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- ============================================================
  -- DISTRICT MANAGER: scope='team' (their reps) on most things.
  -- ============================================================
  FOREACH res IN ARRAY resources LOOP
    FOREACH act IN ARRAY ARRAY['view','create','edit','export','assign','approve'] LOOP
      INSERT INTO public.permissions(target_type,target_id,resource,action,scope,granted)
      VALUES ('role','district_manager', res, act, 'team', true)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- ============================================================
  -- SENIOR REP: like medical_rep, can also help on team's HCPs (view-only).
  -- ============================================================
  FOREACH res IN ARRAY ARRAY['hcps','institutions','products','visits','samples',
                             'orders','reports','expenses','tour_plans'] LOOP
    INSERT INTO public.permissions(target_type,target_id,resource,action,scope,granted)
    VALUES ('role','medical_rep_senior', res, 'view', 'team', true),
           ('role','medical_rep_senior', res, 'create','own', true),
           ('role','medical_rep_senior', res, 'edit','own', true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================================
  -- MEDICAL REP: scope='own' on most things, view shared catalogs.
  -- ============================================================
  -- Own actions: visits, samples, orders, expenses, tour_plans
  FOREACH res IN ARRAY ARRAY['visits','samples','orders','expenses','tour_plans'] LOOP
    INSERT INTO public.permissions(target_type,target_id,resource,action,scope,granted)
    VALUES ('role','medical_rep', res, 'view',  'own', true),
           ('role','medical_rep', res, 'create','own', true),
           ('role','medical_rep', res, 'edit',  'own', true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- HCPs/institutions: rep sees those assigned + reads catalog
  INSERT INTO public.permissions(target_type,target_id,resource,action,scope,granted) VALUES
    ('role','medical_rep','hcps',         'view','own',true),
    ('role','medical_rep','hcps',         'edit','own',true),
    ('role','medical_rep','institutions', 'view','territory',true),
    ('role','medical_rep','products',     'view','all',true),
    ('role','medical_rep','reports',      'view','own',true)
  ON CONFLICT DO NOTHING;

END
$seed$;

-- =====================================================================
-- Manager-can-see-team policy on profiles (added now that helpers exist)
-- =====================================================================
DROP POLICY IF EXISTS "profile_manager_read_team" ON public.profiles;
CREATE POLICY "profile_manager_read_team" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

-- =====================================================================
-- Verification queries
-- =====================================================================
-- 1. Permissions seeded
SELECT target_id AS role, COUNT(*) AS rules
  FROM public.permissions
 WHERE target_type='role'
 GROUP BY target_id
 ORDER BY rules DESC;
-- Expected: country_manager/sales_director (~70+), regional/district (~70+),
-- senior_rep (~30), medical_rep (~25). Admin: 0 (handled in code).

-- 2. Helper functions exist
SELECT proname FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('get_user_role','get_subordinate_ids',
                   'has_permission','get_permission_scope','current_profile')
 ORDER BY proname;
-- Expected: 5 rows
