-- =====================================================================
-- FOX MEDICAL CRM — STEP 1 / FILE 1 of 3
-- 00-setup.sql — Extensions + reusable helpers
-- Run this FIRST in Supabase SQL Editor
-- =====================================================================

-- Enable PostGIS for geofencing & spatial queries.
-- Required for visit check-ins, territory polygons, and the live map.
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgcrypto powers gen_random_uuid(). Usually already on in Supabase, but be safe.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- (Optional but recommended later) TimescaleDB for the rep_locations
-- high-volume table. Supabase doesn't enable this by default; skip for MVP,
-- add via Supabase Dashboard → Database → Extensions when scaling.
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------
-- Reusable updated_at trigger function. Attach to any table that has
-- an updated_at column to keep it fresh on every UPDATE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.touch_updated_at()
  IS 'Generic trigger fn — set updated_at = now() on UPDATE.';

-- ---------------------------------------------------------------------
-- Helper: the current authenticated user's profile row.
-- Many RLS policies and helper functions read from profiles, so cache it.
-- ---------------------------------------------------------------------
-- (defined later in 01-org-structure.sql once profiles table exists)

-- Verification:
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname IN ('postgis', 'pgcrypto')
ORDER BY extname;
-- Expected: 2 rows. If postgis is missing, enable it in Supabase Dashboard
-- → Database → Extensions → search "postgis" → toggle on, then re-run.
