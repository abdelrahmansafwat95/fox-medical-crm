-- ============================================================================
-- 13 · permissions: accept every resource and action the app offers
--      (applied live as migration permissions_catalog_checks, 2026-09-27)
-- ============================================================================
-- The CHECK constraints still listed the 12 resources and 7 actions from the
-- original schema, while lib/permissions.ts RESOURCES (what the admin
-- Permissions page renders) grew to 26 resources and 10 actions. Saving an
-- override for any of the rest — Approval Inbox, Compliance, Coverage, AI
-- Assistant, Leaderboard, Targets, Import, … or the actions issue /
-- distribute / manage — was refused by the database. Found when the demo
-- sign-up tried to switch off `assistant` for visitors.
--
-- Keep these lists in step with RESOURCES (plus `whatsapp`, which the
-- role defaults in the same file use).

alter table public.permissions drop constraint if exists permissions_resource_check;
alter table public.permissions add constraint permissions_resource_check check (resource = any (array[
  'dashboard', 'my_day', 'visits', 'check_in', 'tour_plans', 'events', 'notifications',
  'hcps', 'institutions', 'coverage', 'frequency', 'products', 'samples', 'orders',
  'expenses', 'assistant', 'inbox', 'tracking', 'reports', 'leaderboard', 'targets',
  'compliance', 'team', 'import', 'settings', 'permissions', 'whatsapp'
]));

alter table public.permissions drop constraint if exists permissions_action_check;
alter table public.permissions add constraint permissions_action_check check (action = any (array[
  'view', 'create', 'edit', 'delete', 'export', 'assign', 'approve', 'issue', 'distribute', 'manage'
]));
