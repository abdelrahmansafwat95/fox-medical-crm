-- ============================================================================
-- 17 · Approval notifications reach the rep (applied live, 2026-09-27)
-- ============================================================================
-- The approvals inbox notifies the rep with type 'tour_plan', 'visit' or
-- 'expense', which the CHECK constraint did not allow: every approve/reject
-- notice failed (400, swallowed by lib/notify.ts), so reps never heard back.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('compliance_alert','task','reminder','approval_request','system','message',
                  'tour_plan','visit','expense'));
