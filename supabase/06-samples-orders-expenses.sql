-- =====================================================================
-- FOX MEDICAL CRM — STEP 7
-- 06-samples-orders-expenses.sql
-- Run AFTER 05-storage.sql.
-- =====================================================================

-- =====================================================================
-- 1. SAMPLES_INVENTORY — current stock per rep per product/batch
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.samples_inventory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_number    text NOT NULL,
  expiry_date     date NOT NULL,
  quantity        int NOT NULL CHECK (quantity >= 0),
  warehouse_issued_qty int NOT NULL DEFAULT 0,
  last_audited_at timestamptz,
  last_audited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rep_id, product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_samples_inv_rep ON public.samples_inventory(rep_id);
CREATE INDEX IF NOT EXISTS idx_samples_inv_expiry ON public.samples_inventory(expiry_date);

CREATE TRIGGER trg_samples_inv_updated_at
  BEFORE UPDATE ON public.samples_inventory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.samples_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "samples_inv_read_scoped" ON public.samples_inventory;
CREATE POLICY "samples_inv_read_scoped" ON public.samples_inventory
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "samples_inv_write_scoped" ON public.samples_inventory;
CREATE POLICY "samples_inv_write_scoped" ON public.samples_inventory
  FOR ALL TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager','district_manager')
  )
  WITH CHECK (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager','district_manager')
  );

-- =====================================================================
-- 2. SAMPLES_TRANSACTIONS — every sample movement (audit trail)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.samples_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN
    ('issued_to_rep','given_to_hcp','returned_to_warehouse','expired','damaged','lost')),
  rep_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hcp_id          uuid REFERENCES public.hcps(id) ON DELETE SET NULL,
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_number    text,
  quantity        int NOT NULL CHECK (quantity > 0),
  expiry_date     date,
  visit_id        uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  hcp_signature_url text,
  hcp_signature_data jsonb,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_samples_tx_rep    ON public.samples_transactions(rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_tx_hcp    ON public.samples_transactions(hcp_id);
CREATE INDEX IF NOT EXISTS idx_samples_tx_visit  ON public.samples_transactions(visit_id);
CREATE INDEX IF NOT EXISTS idx_samples_tx_type   ON public.samples_transactions(transaction_type);

ALTER TABLE public.samples_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "samples_tx_read_scoped" ON public.samples_transactions;
CREATE POLICY "samples_tx_read_scoped" ON public.samples_transactions
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "samples_tx_insert_scoped" ON public.samples_transactions;
CREATE POLICY "samples_tx_insert_scoped" ON public.samples_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() OR
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager','district_manager')
  );

-- =====================================================================
-- 3. ATOMIC RPC: give_sample_to_hcp
-- Decrements inventory, inserts transaction, updates visit summary.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.give_sample_to_hcp(
  _visit_id uuid,
  _product_id uuid,
  _batch_number text,
  _quantity int,
  _signature_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _visit public.visits;
  _stock int;
  _expiry date;
  _new_summary jsonb;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO _visit FROM public.visits WHERE id = _visit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'visit_not_found');
  END IF;
  IF _visit.rep_id <> _uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;

  -- Lock the inventory row
  SELECT quantity, expiry_date INTO _stock, _expiry
    FROM public.samples_inventory
   WHERE rep_id = _uid AND product_id = _product_id AND batch_number = _batch_number
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_stock_for_batch');
  END IF;
  IF _stock < _quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_stock', 'available', _stock);
  END IF;

  -- Decrement inventory
  UPDATE public.samples_inventory
     SET quantity = quantity - _quantity
   WHERE rep_id = _uid AND product_id = _product_id AND batch_number = _batch_number;

  -- Insert transaction
  INSERT INTO public.samples_transactions (
    transaction_type, rep_id, hcp_id, product_id, batch_number,
    quantity, expiry_date, visit_id, hcp_signature_url, created_by
  ) VALUES (
    'given_to_hcp', _uid, _visit.hcp_id, _product_id, _batch_number,
    _quantity, _expiry, _visit_id, _signature_url, _uid
  );

  -- Update visit's samples summary (jsonb merge)
  _new_summary := COALESCE(_visit.samples_given_summary, '{}'::jsonb)
                  || jsonb_build_object(
                       _product_id::text,
                       COALESCE((_visit.samples_given_summary->_product_id::text)::int, 0) + _quantity
                     );
  UPDATE public.visits SET samples_given_summary = _new_summary WHERE id = _visit_id;

  RETURN jsonb_build_object('success', true, 'remaining_stock', _stock - _quantity);
END;
$$;

-- =====================================================================
-- 4. ORDERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    text UNIQUE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  hcp_id          uuid REFERENCES public.hcps(id) ON DELETE SET NULL,
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  visit_id        uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  order_date      date NOT NULL DEFAULT current_date,
  status          text NOT NULL DEFAULT 'submitted'
                  CHECK (status IN
                    ('draft','submitted','approved','dispatched','delivered','paid','cancelled','returned')),
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- items: [{ product_id, qty, unit_price, discount_pct, total }]
  subtotal        numeric NOT NULL DEFAULT 0,
  discount        numeric NOT NULL DEFAULT 0,
  tax             numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'EGP',
  payment_terms   text,
  delivery_address text,
  expected_delivery_date date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_rep_date  ON public.orders(rep_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_inst      ON public.orders(institution_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON public.orders(status);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_read_scoped" ON public.orders;
CREATE POLICY "orders_read_scoped" ON public.orders
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "orders_insert_scoped" ON public.orders;
CREATE POLICY "orders_insert_scoped" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    rep_id = auth.uid()
    OR public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager','district_manager')
  );

DROP POLICY IF EXISTS "orders_update_scoped" ON public.orders;
CREATE POLICY "orders_update_scoped" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

-- Now we can add the FK from visits.order_id back to orders (was deferred)
ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS fk_visits_order;
ALTER TABLE public.visits
  ADD CONSTRAINT fk_visits_order
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- Auto-generate order_number
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' ||
                        lpad(nextval('orders_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS public.orders_seq START 1;

DROP TRIGGER IF EXISTS trg_orders_set_number ON public.orders;
CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- =====================================================================
-- 5. EXPENSES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expense_date    date NOT NULL DEFAULT current_date,
  category        text NOT NULL CHECK (category IN
    ('transport','fuel','meal','parking','toll','phone','accommodation','other')),
  amount          numeric NOT NULL CHECK (amount > 0),
  currency        text NOT NULL DEFAULT 'EGP',
  description     text,
  receipt_photo_url text,
  linked_visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  distance_km     numeric,
  status          text NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('draft','submitted','approved','rejected','paid')),
  approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  paid_at         timestamptz,
  rejection_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_rep_date ON public.expenses(rep_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status   ON public.expenses(status);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_read_scoped" ON public.expenses;
CREATE POLICY "expenses_read_scoped" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    rep_id IN (SELECT profile_id FROM public.get_subordinate_ids(auth.uid()))
    OR public.get_user_role() IN ('admin','country_manager','sales_director')
  );

DROP POLICY IF EXISTS "expenses_insert_self" ON public.expenses;
CREATE POLICY "expenses_insert_self" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (rep_id = auth.uid());

DROP POLICY IF EXISTS "expenses_update_scoped" ON public.expenses;
CREATE POLICY "expenses_update_scoped" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    rep_id = auth.uid()
    OR public.get_user_role() IN ('admin','country_manager','sales_director','regional_manager','district_manager')
  );

-- =====================================================================
-- Storage bucket for expense receipts
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_owner_rw" ON storage.objects;
CREATE POLICY "receipts_owner_rw" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'receipts')
  WITH CHECK (bucket_id = 'receipts');

-- =====================================================================
-- Verification
-- =====================================================================
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('samples_inventory','samples_transactions','orders','expenses')
 ORDER BY table_name;
-- Expected: 4 rows

SELECT proname FROM pg_proc
 WHERE pronamespace='public'::regnamespace
   AND proname IN ('give_sample_to_hcp','set_order_number')
 ORDER BY proname;
-- Expected: 2 rows
