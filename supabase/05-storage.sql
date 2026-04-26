-- =====================================================================
-- FOX MEDICAL CRM — STEP 4 SQL (continued)
-- 05-storage.sql — Storage buckets for visit selfies and signatures.
-- Run AFTER 04-visits-tracking.sql.
-- =====================================================================

-- Visit selfies (public read because they get rendered in <img> on the manager UI)
INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-selfies', 'visit-selfies', true)
ON CONFLICT (id) DO NOTHING;

-- Doctor signatures for sample handover (public read for audit display)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "selfies_authenticated_upload" ON storage.objects;
CREATE POLICY "selfies_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visit-selfies');

DROP POLICY IF EXISTS "selfies_public_read" ON storage.objects;
CREATE POLICY "selfies_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'visit-selfies');

DROP POLICY IF EXISTS "signatures_authenticated_upload" ON storage.objects;
CREATE POLICY "signatures_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures');

DROP POLICY IF EXISTS "signatures_public_read" ON storage.objects;
CREATE POLICY "signatures_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'signatures');

-- Verification
SELECT id, name, public FROM storage.buckets
 WHERE id IN ('visit-selfies','signatures')
 ORDER BY id;
-- Expected: 2 rows, public = true
