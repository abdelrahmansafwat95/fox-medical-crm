-- ============================================================================
-- 10 · log_activity(): stop it blocking every HCP / institution / product write
--      (applied live as migration fix_log_activity_field_resolution, 2026-09-26)
-- ============================================================================
-- The version added on 2026-07-22 picked the display name with
--   CASE TG_TABLE_NAME WHEN 'hcps' THEN NEW.full_name
--                      WHEN 'institutions' THEN NEW.name ... END
-- PL/pgSQL resolves every record field in that expression against the row's
-- actual type, so it raised "record has no field" on all three tables. The
-- trigger is BEFORE nothing / AFTER the write but in the same transaction, so
-- the error rolled back every insert, update and delete on hcps, institutions
-- and products — HCP edits, bulk-assign, the key-messages editor and imports
-- all failed — and activity_log never received a single row.
--
-- Reading the name through to_jsonb() lets a missing key simply be NULL.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _action text;
  _eid uuid;
  _row jsonb;
  _summary text;
begin
  if tg_op = 'INSERT' then _action := 'created'; _eid := new.id;
  elsif tg_op = 'UPDATE' then _action := 'updated'; _eid := new.id;
  else _action := 'deleted'; _eid := old.id;
  end if;

  if tg_table_name = 'visits' then
    if tg_op = 'UPDATE' and new.manager_status is distinct from old.manager_status then
      _summary := 'Visit ' || new.manager_status;
    elsif tg_op = 'INSERT' then
      _summary := 'Visit logged';
    else
      return new; -- ignore other visit updates (trust score, etc.)
    end if;
  else
    _row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
    _summary := initcap(_action) || ' ' || tg_table_name || ' “' ||
                coalesce(_row ->> 'full_name', _row ->> 'name', '') || '”';
  end if;

  insert into public.activity_log (actor_id, entity_type, entity_id, action, summary)
  values (auth.uid(), tg_table_name, _eid, _action, _summary);
  return coalesce(new, old);
end;
$function$;
revoke all on function public.log_activity() from public, anon, authenticated;
