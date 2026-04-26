-- =====================================================================
-- FOX MEDICAL CRM — STEP 2
-- 03-medical-entities.sql
-- Run AFTER 02-rbac.sql.
-- Creates: institution_chains, institutions, hcps, hcp_workplaces, products.
-- =====================================================================

-- =====================================================================
-- 1. INSTITUTION CHAINS
-- Pharmacy/hospital chains (El Ezaby, 19011, Cleopatra, As-Salam, etc.)
-- Lets you treat a chain as a single sales target for HQ-level deals.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.institution_chains (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  name_ar         text,
  type            text CHECK (type IN ('pharmacy_chain','hospital_chain','clinic_chain','distributor_chain')),
  head_office_address    text,
  head_office_phone      text,
  head_office_email      text,
  contact_person         text,
  contact_person_role    text,
  total_branches  int,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_institution_chains_updated_at
  BEFORE UPDATE ON public.institution_chains
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.institution_chains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chains_read_all" ON public.institution_chains;
CREATE POLICY "chains_read_all" ON public.institution_chains
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "chains_write_managers" ON public.institution_chains;
CREATE POLICY "chains_write_managers" ON public.institution_chains
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager'))
  WITH CHECK (public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager'));

COMMENT ON TABLE public.institution_chains IS 'Chain-level grouping for institutions (e.g. all El Ezaby branches).';

-- =====================================================================
-- 2. INSTITUTIONS
-- Clinics, hospitals, pharmacies, distributors — the physical places reps visit.
-- THE GEOFENCE-CRITICAL TABLE: lat/lng + auto-generated PostGIS geography.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.institutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name            text NOT NULL,
  name_ar         text,
  type            text NOT NULL CHECK (type IN (
                    'private_clinic','polyclinic',
                    'hospital_govt','hospital_private','hospital_university','hospital_military',
                    'pharmacy_independent','pharmacy_chain',
                    'distributor','wholesaler','lab','warehouse'
                  )),
  chain_id        uuid REFERENCES public.institution_chains(id) ON DELETE SET NULL,

  -- LOCATION (CRITICAL for geofencing)
  latitude        numeric(10,7) NOT NULL,
  longitude       numeric(10,7) NOT NULL,
  -- Auto-derived PostGIS column. Indexed below for fast spatial queries.
  location        geography(POINT, 4326) GENERATED ALWAYS AS
                    (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  geofence_radius_m  int NOT NULL DEFAULT 100
                     CHECK (geofence_radius_m BETWEEN 25 AND 1000),

  -- Address
  address         text,
  address_ar      text,
  city            text,
  district        text,             -- e.g. "Maadi", "Heliopolis", "Zamalek"
  governorate     text,
  postal_code     text,

  -- Contact
  phone           text,
  fax             text,
  email           text,
  website         text,

  -- Hours (using Sun=0..Sat=6 to match Egypt week)
  working_days    int[] DEFAULT '{0,1,2,3,4}',
  opening_time    time,
  closing_time    time,

  -- Hospital-specific
  bed_count       int,
  departments     text[] DEFAULT '{}',
  tier            text CHECK (tier IN ('teaching','specialty','general','clinic')),

  -- Pharmacy-specific
  license_number  text,

  territory_id    uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  photo_url       text,
  notes           text,

  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the queries that matter:
CREATE INDEX IF NOT EXISTS idx_institutions_geo        ON public.institutions USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_institutions_type       ON public.institutions(type);
CREATE INDEX IF NOT EXISTS idx_institutions_territory  ON public.institutions(territory_id);
CREATE INDEX IF NOT EXISTS idx_institutions_chain      ON public.institutions(chain_id);
CREATE INDEX IF NOT EXISTS idx_institutions_active     ON public.institutions(is_active) WHERE is_active = true;
-- Useful trigram search on name (enable pg_trgm if you want this):
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm ON public.institutions USING GIN(name gin_trgm_ops);

CREATE TRIGGER trg_institutions_updated_at
  BEFORE UPDATE ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ institutions (org-wide reference data).
-- WRITE limited to managers and admins.
DROP POLICY IF EXISTS "institutions_read_all" ON public.institutions;
CREATE POLICY "institutions_read_all" ON public.institutions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "institutions_insert_authorized" ON public.institutions;
CREATE POLICY "institutions_insert_authorized" ON public.institutions
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager','medical_rep_senior'));

DROP POLICY IF EXISTS "institutions_update_authorized" ON public.institutions;
CREATE POLICY "institutions_update_authorized" ON public.institutions
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager'))
  WITH CHECK (public.get_user_role() IN
    ('admin','country_manager','sales_director','regional_manager','district_manager'));

DROP POLICY IF EXISTS "institutions_delete_admin" ON public.institutions;
CREATE POLICY "institutions_delete_admin" ON public.institutions
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin','country_manager'));

COMMENT ON TABLE public.institutions IS 'Physical locations reps visit. location column is the geofence anchor.';
COMMENT ON COLUMN public.institutions.geofence_radius_m IS
  'Per-institution check-in tolerance. 100m default. Increase for big campuses (e.g. Cairo Univ Hospital = 300m).';

-- =====================================================================
-- 3. HCPs (Healthcare Professionals)
-- The doctors, pharmacists, nurses your reps detail to.
-- Includes pharma's signature feature: SEGMENTATION.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  full_name       text NOT NULL,
  full_name_ar    text,
  title           text CHECK (title IN ('Dr.','Prof.','Pharm.D','Pharm.','Nurse','Other')),
  gender          text CHECK (gender IN ('male','female','other')),
  birthdate       date,
  photo_url       text,

  -- Professional
  specialty       text,             -- 'Cardiology', 'Endocrinology', 'GP', etc.
  sub_specialty   text,             -- 'Interventional Cardiology', 'Pediatric Endo'
  qualification   text,             -- 'MD', 'MBBCh', 'PhD'
  license_number  text,
  license_expiry  date,

  -- Contact
  phone           text,
  mobile          text,
  email           text,
  whatsapp        text,
  preferred_language       text DEFAULT 'ar' CHECK (preferred_language IN ('ar','en','both')),
  preferred_visit_day      int CHECK (preferred_visit_day BETWEEN 0 AND 6),
  preferred_visit_time     time,

  -- ============= SEGMENTATION (the pharma essential) =============
  segment text CHECK (segment IN ('A','B','C','D','KOL')),
  decile  int  CHECK (decile BETWEEN 1 AND 10),
  prescribing_potential numeric,           -- estimated monthly Rx count or value
  is_kol boolean NOT NULL DEFAULT false,   -- Key Opinion Leader flag
  segmentation_updated_at timestamptz,
  segmentation_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- AI-driven fields (populated by /api/ai/score-hcp)
  ai_score                int,             -- 1-10 overall priority
  ai_segment_recommendation text,          -- AI's suggested A/B/C/D
  ai_notes                text,
  ai_recommended_products uuid[],          -- top products to detail
  ai_updated_at           timestamptz,

  -- Assignment
  territory_id    uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  assigned_rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  secondary_rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Misc
  notes           text,
  tags            text[] DEFAULT '{}',     -- 'high-prescriber', 'difficult', 'cardio-board'
  is_active       boolean NOT NULL DEFAULT true,

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hcps_assigned_rep    ON public.hcps(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_hcps_secondary_rep   ON public.hcps(secondary_rep_id);
CREATE INDEX IF NOT EXISTS idx_hcps_territory       ON public.hcps(territory_id);
CREATE INDEX IF NOT EXISTS idx_hcps_specialty       ON public.hcps(specialty);
CREATE INDEX IF NOT EXISTS idx_hcps_segment         ON public.hcps(segment);
CREATE INDEX IF NOT EXISTS idx_hcps_kol             ON public.hcps(is_kol) WHERE is_kol = true;
CREATE INDEX IF NOT EXISTS idx_hcps_active          ON public.hcps(is_active) WHERE is_active = true;

CREATE TRIGGER trg_hcps_updated_at
  BEFORE UPDATE ON public.hcps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.hcps ENABLE ROW LEVEL SECURITY;

-- READ: rep sees assigned HCPs; manager sees their team's HCPs (recursive); senior roles see all.
DROP POLICY IF EXISTS "hcps_read_scoped" ON public.hcps;
CREATE POLICY "hcps_read_scoped" ON public.hcps
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin','country_manager','sales_director')
    OR assigned_rep_id  IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR secondary_rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
  );

-- INSERT: any role with create-rights (controlled by app-level has_permission for finer grain)
DROP POLICY IF EXISTS "hcps_insert_authorized" ON public.hcps;
CREATE POLICY "hcps_insert_authorized" ON public.hcps
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('hcps','create'));

-- UPDATE: rep can edit their own assigned HCPs; managers edit team's; admins edit all.
DROP POLICY IF EXISTS "hcps_update_scoped" ON public.hcps;
CREATE POLICY "hcps_update_scoped" ON public.hcps
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin','country_manager','sales_director')
    OR assigned_rep_id  IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','country_manager','sales_director')
    OR assigned_rep_id  IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
  );

-- DELETE: only admin / country manager
DROP POLICY IF EXISTS "hcps_delete_admin" ON public.hcps;
CREATE POLICY "hcps_delete_admin" ON public.hcps
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('admin','country_manager'));

COMMENT ON TABLE public.hcps IS 'Doctors, pharmacists, nurses — the people reps detail to.';
COMMENT ON COLUMN public.hcps.segment IS 'A=top prescriber, B=mid, C=low, D=minimal, KOL=opinion leader.';

-- =====================================================================
-- 4. HCP_WORKPLACES (many-to-many between hcps and institutions)
-- An Egyptian doctor typically practices at hospital + private clinic + pharmacy consult.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcp_workplaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id          uuid NOT NULL REFERENCES public.hcps(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  position        text,             -- "Head of Cardiology", "Resident", "Consultant"
  days_available  int[] DEFAULT '{}',   -- [1,2,3] = Mon, Tue, Wed at this place
  time_from       time,
  time_to         time,
  is_primary      boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hcp_id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_workplaces_hcp          ON public.hcp_workplaces(hcp_id);
CREATE INDEX IF NOT EXISTS idx_workplaces_institution  ON public.hcp_workplaces(institution_id);

ALTER TABLE public.hcp_workplaces ENABLE ROW LEVEL SECURITY;

-- Inherit visibility from the parent HCP.
DROP POLICY IF EXISTS "workplaces_inherit_hcp" ON public.hcp_workplaces;
CREATE POLICY "workplaces_inherit_hcp" ON public.hcp_workplaces
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hcps h WHERE h.id = hcp_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hcps h WHERE h.id = hcp_id));
-- (RLS on hcps will already filter visible rows; this just chains the check.)

-- =====================================================================
-- 5. PRODUCTS
-- The drugs/devices being detailed. Key messages stored as JSONB so the
-- detailing screen can render structured talking-points + evidence links.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name            text NOT NULL,             -- internal name
  brand_name      text,                      -- "Concor" (Bisoprolol)
  generic_name    text,                      -- "Bisoprolol Fumarate"
  name_ar         text,
  sku             text UNIQUE,

  -- Classification
  category        text NOT NULL CHECK (category IN ('Rx','OTC','OTX','medical_device','consumable')),
  therapy_area    text,                      -- 'Cardiology', 'Diabetes', 'Antibiotics'
  product_line    text,                      -- maps to profiles.product_line for assignment
  dosage_form     text,                      -- 'Tablet', 'Injection', 'Syrup'
  strength        text,                      -- '5mg', '10ml/100mg'
  pack_size       text,                      -- '30 tablets', '5 ampoules'
  atc_code        text,                      -- WHO ATC classification

  -- Commercial
  list_price      numeric,
  currency        text DEFAULT 'EGP',

  -- Detailing aid
  -- jsonb shape: [{ "title": "...", "message": "...", "evidence_url": "...", "evidence_label": "..." }, ...]
  key_messages    jsonb DEFAULT '[]'::jsonb,
  competitors     text[] DEFAULT '{}',
  e_detailing_deck_url  text,                -- PDF or HTML deck for tablet detailing
  sample_pack_size      text,                -- '5 tablets' — what fits in a sample

  -- Lifecycle
  launch_date     date,
  is_active       boolean NOT NULL DEFAULT true,

  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category      ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_therapy_area  ON public.products(therapy_area);
CREATE INDEX IF NOT EXISTS idx_products_product_line  ON public.products(product_line);
CREATE INDEX IF NOT EXISTS idx_products_active        ON public.products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_messages_gin  ON public.products USING GIN(key_messages);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- All authenticated read (org-wide catalog).
DROP POLICY IF EXISTS "products_read_all" ON public.products;
CREATE POLICY "products_read_all" ON public.products
  FOR SELECT TO authenticated USING (true);

-- Manager+ writes.
DROP POLICY IF EXISTS "products_write_managers" ON public.products;
CREATE POLICY "products_write_managers" ON public.products
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager'))
  WITH CHECK (public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager'));

COMMENT ON TABLE public.products IS 'Drug/device catalog. key_messages JSONB powers the detailing UI.';

-- =====================================================================
-- OPTIONAL — Egypt seed data (delete this whole block if you don't want it)
-- Real Cairo coordinates so you can demo the geofence immediately.
-- =====================================================================

-- Major Egyptian pharmacy chains
INSERT INTO public.institution_chains (name, name_ar, type, total_branches) VALUES
  ('El Ezaby Pharmacies',  'صيدليات العزبي',  'pharmacy_chain', 350),
  ('19011 Pharmacies',     '١٩٠١١',           'pharmacy_chain', 200),
  ('Seif Pharmacies',      'صيدليات سيف',     'pharmacy_chain', 120),
  ('Misr Pharmacies',      'صيدليات مصر',     'pharmacy_chain',  80),
  ('Pharmacie Misr',       'فارماسي مصر',     'pharmacy_chain',  60)
ON CONFLICT (name) DO NOTHING;

-- Major hospital chains
INSERT INTO public.institution_chains (name, name_ar, type, total_branches) VALUES
  ('Cleopatra Hospitals Group', 'مجموعة مستشفيات كليوباترا', 'hospital_chain', 7),
  ('As-Salam International',    'السلام الدولي',             'hospital_chain', 3),
  ('Dar Al Fouad Hospital',     'دار الفؤاد',                'hospital_chain', 2),
  ('Saudi German Hospital',     'المستشفى السعودي الألماني', 'hospital_chain', 4)
ON CONFLICT (name) DO NOTHING;

-- A few demo institutions in Cairo (real-ish coords).
-- These let you test the GPS check-in flow on day 1.
INSERT INTO public.institutions (name, name_ar, type, latitude, longitude, address, district, governorate, geofence_radius_m, working_days, opening_time, closing_time)
VALUES
  ('Maadi Polyclinic Demo',          'بوليكلينيك المعادي',       'polyclinic',         29.9603, 31.2569, 'Road 9, Maadi', 'Maadi', 'Cairo', 100, '{0,1,2,3,4}', '09:00', '20:00'),
  ('Heliopolis Cardiac Center Demo', 'مركز القلب بمصر الجديدة',  'private_clinic',     30.0808, 31.3236, 'Korba, Heliopolis', 'Heliopolis', 'Cairo', 100, '{0,1,2,3,4}', '10:00', '22:00'),
  ('Zamalek Family Clinic Demo',     'عيادة الزمالك',            'private_clinic',     30.0626, 31.2197, '26th of July St, Zamalek', 'Zamalek', 'Cairo', 80,  '{0,1,2,3,4}', '14:00', '22:00'),
  ('Nasr City Hospital Demo',        'مستشفى مدينة نصر',         'hospital_private',   30.0608, 31.3450, 'Abbas El Akkad, Nasr City', 'Nasr City', 'Cairo', 200, '{0,1,2,3,4,5,6}', '00:00', '23:59'),
  ('New Cairo Medical Tower Demo',   'برج التجمع الطبي',         'polyclinic',         30.0271, 31.4970, '90th St, 5th Settlement', 'New Cairo', 'Cairo', 150, '{0,1,2,3,4}', '09:00', '22:00')
ON CONFLICT DO NOTHING;

-- A couple of demo products
INSERT INTO public.products (name, brand_name, generic_name, name_ar, category, therapy_area, dosage_form, strength, pack_size, list_price, currency, key_messages)
VALUES
  ('Fox-Cardia 5',  'Cardia', 'Bisoprolol Fumarate', 'كارديا',  'Rx', 'Cardiology', 'Tablet', '5mg', '30 tablets', 85.00, 'EGP',
    '[
       {"title":"Proven efficacy",  "message":"Reduces resting HR by avg 12 bpm at 4 weeks.", "evidence_label":"CIBIS-II"},
       {"title":"Once daily",       "message":"Single morning dose — better adherence than BID alternatives."},
       {"title":"Safety profile",   "message":"Cardio-selective β1; minimal pulmonary side effects."}
     ]'::jsonb),
  ('Fox-Glycoz 1000','Glycoz',  'Metformin HCl',       'جلايكوز','Rx', 'Diabetes',   'Tablet', '1000mg','60 tablets', 65.00, 'EGP',
    '[
       {"title":"First-line therapy","message":"Recommended initial Rx for T2DM per ADA 2024 guidelines."},
       {"title":"Weight neutral",    "message":"Unlike sulfonylureas, no weight gain."},
       {"title":"CV benefit",        "message":"Reduces CV mortality in overweight T2DM (UKPDS 34)."}
     ]'::jsonb),
  ('Fox-Amox 500',  'Amox',    'Amoxicillin',          'أموكس', 'Rx', 'Antibiotics','Capsule','500mg','21 capsules', 45.00, 'EGP',
    '[
       {"title":"Broad spectrum","message":"Effective against most common URTI/LRTI pathogens."},
       {"title":"Pediatric-friendly","message":"Available in suspension; well-tolerated in children >6kg."}
     ]'::jsonb)
ON CONFLICT (sku) DO NOTHING;

-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- 1. Tables exist
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('institution_chains','institutions','hcps','hcp_workplaces','products')
 ORDER BY table_name;
-- Expected: 5 rows

-- 2. PostGIS column populated correctly
SELECT name, latitude, longitude, ST_AsText(location::geometry) AS geo
  FROM public.institutions LIMIT 5;
-- Expected: geo column shows POINT(longitude latitude)

-- 3. Geofence test — distance from Maadi clinic to a point ~150m away
SELECT
  i.name,
  ROUND(ST_Distance(
    i.location,
    ST_SetSRID(ST_MakePoint(31.2585, 29.9610), 4326)::geography
  )::numeric, 1) AS distance_m,
  i.geofence_radius_m,
  ROUND(ST_Distance(
    i.location,
    ST_SetSRID(ST_MakePoint(31.2585, 29.9610), 4326)::geography
  )::numeric, 1) <= i.geofence_radius_m AS within_geofence
FROM public.institutions i
WHERE i.name = 'Maadi Polyclinic Demo';
-- Expected: ~155m, within_geofence = false (test point is just outside the 100m radius)

-- 4. RLS check — should see all seeded products as authenticated
SELECT COUNT(*) FROM public.products;
-- Expected: 3 (the seeded products)

-- 5. RBAC sanity
SELECT public.has_permission('hcps','view') AS can_view_hcps;
-- Expected: true (assuming you logged in as the admin you set up)
