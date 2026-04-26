-- =====================================================================
-- FOX MEDICAL CRM — STEP 1 / FILE 2 of 3
-- 01-org-structure.sql — profiles, branches, territories
-- Run AFTER 00-setup.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- BRANCHES: HR/office structure (head office, regional office, etc.).
-- Optional — most pharma cos use Territories for the sales hierarchy and
-- Branches just for HR reporting. Created first because Profiles & Territories
-- both reference it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  name_ar         text,
  description     text,
  manager_id      uuid,                -- FK added later (avoids circular dep)
  city            text,
  governorate     text,
  phone           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.branches IS 'Office / HR structure (e.g. Head Office Cairo, Alexandria Branch).';

-- ---------------------------------------------------------------------
-- TERRITORIES: geographic SALES structure. This is the pharma-critical
-- one — every HCP, institution, visit, and rep is tied to a territory.
-- Hierarchical: country → region → district → brick.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.territories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  name_ar         text,
  type            text NOT NULL CHECK (type IN ('country','region','district','brick')),
  parent_id       uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  manager_id      uuid,                -- FK added later
  governorate     text,
  cities          text[] DEFAULT '{}',

  -- PostGIS polygon defining the territory boundary on a map.
  -- Used for "is this rep inside their assigned territory?" checks.
  geo_polygon     geography(POLYGON, 4326),

  -- Approximate center for map zoom defaults.
  center_lat      numeric(10,7),
  center_lng      numeric(10,7),

  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_territories_parent ON public.territories(parent_id);
CREATE INDEX IF NOT EXISTS idx_territories_geo ON public.territories USING GIST(geo_polygon);

CREATE TRIGGER trg_territories_updated_at
  BEFORE UPDATE ON public.territories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.territories IS 'Geographic sales structure. Hierarchical via parent_id.';
COMMENT ON COLUMN public.territories.geo_polygon IS 'PostGIS polygon. Used to validate visits-in-territory.';

-- ---------------------------------------------------------------------
-- PROFILES: extends auth.users with role + hierarchy fields.
-- Pharma roles baked in: admin → country_manager → sales_director →
-- regional_manager → district_manager → senior_rep → medical_rep.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  full_name       text,
  full_name_ar    text,
  email           text,
  phone           text,
  avatar_url      text,
  employee_id     text UNIQUE,
  hire_date       date,

  -- Role & hierarchy
  role            text NOT NULL DEFAULT 'medical_rep'
                  CHECK (role IN (
                    'admin',
                    'country_manager',
                    'sales_director',
                    'regional_manager',
                    'district_manager',
                    'medical_rep_senior',
                    'medical_rep'
                  )),

  -- Reporting hierarchy
  line_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Org placement
  branch_id       uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  territory_id    uuid REFERENCES public.territories(id) ON DELETE SET NULL,

  -- Pharma-specific
  product_line    text,        -- e.g. "Cardio", "Derma", "Pediatrics"
  is_active       boolean NOT NULL DEFAULT true,

  -- Tracking consent (PDPL compliance — Egypt Law 151/2020)
  tracking_consent_at        timestamptz,
  tracking_consent_version   text,

  -- Working hours config (for tracking window)
  working_days    int[] DEFAULT '{0,1,2,3,4}',  -- Sun-Thu (Egypt week)
  working_time_from time DEFAULT '08:00',
  working_time_to   time DEFAULT '17:00',

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role          ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_line_manager  ON public.profiles(line_manager_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch        ON public.profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_territory     ON public.profiles(territory_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active        ON public.profiles(is_active) WHERE is_active = true;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.profiles IS 'Application user. 1:1 with auth.users.';
COMMENT ON COLUMN public.profiles.tracking_consent_at IS 'PDPL: rep must consent to GPS tracking. Null = not consented.';

-- ---------------------------------------------------------------------
-- Now we can safely add the deferred FKs back to profiles.
-- ---------------------------------------------------------------------
ALTER TABLE public.branches
  ADD CONSTRAINT fk_branches_manager
  FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.territories
  ADD CONSTRAINT fk_territories_manager
  FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Auto-create a profile row when a new auth.users row is created.
-- This is the standard Supabase pattern.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- Cached helper: the current user's profile.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

-- =====================================================================
-- ROW LEVEL SECURITY (basic — refined in 02-rbac.sql)
-- =====================================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

-- Profiles: every authenticated user can see their own + admins see all.
-- (Manager-sees-team logic is added in 02-rbac.sql to avoid recursion now.)
DROP POLICY IF EXISTS "profile_self_read" ON public.profiles;
CREATE POLICY "profile_self_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profile_self_update" ON public.profiles;
CREATE POLICY "profile_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Branches & territories: readable by all authenticated users (org-wide reference data).
DROP POLICY IF EXISTS "branches_read_all" ON public.branches;
CREATE POLICY "branches_read_all" ON public.branches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "territories_read_all" ON public.territories;
CREATE POLICY "territories_read_all" ON public.territories
  FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- Verification queries
-- =====================================================================
-- 1. Tables exist
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('profiles','branches','territories')
 ORDER BY table_name;
-- Expected: 3 rows

-- 2. RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname='public' AND tablename IN ('profiles','branches','territories');
-- Expected: rowsecurity = true for all 3
