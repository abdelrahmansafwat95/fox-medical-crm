-- ============================================================================
-- 19 · API keys and webhooks (applied live, 2026-09-27)
-- ============================================================================
-- The "API access and webhooks" the plans promise; same design as the real
-- estate CRM.
--
-- API keys
--   * created by an admin or country manager (never a demo visitor) with a
--     name and scopes such as 'hcps:read', 'orders:write'; the plaintext key
--     is returned ONCE (fox_md_<40 hex>) and only its SHA-256 is stored
--   * the public-api Edge Function looks a key up by its hash, checks the
--     scope, and takes one unit of a 120-requests-a-minute allowance
-- Webhooks
--   * an https URL (never a private or internal address) subscribed to events;
--     each has its own secret
--   * triggers on hcps / institutions / visits / orders / expenses / tour
--     plans / events / compliance alerts queue one
--     delivery per subscribed webhook; pg_cron sends them every minute with
--     pg_net, signed X-Fox-Signature: sha256=HMAC(secret, timestamp + "." + body),
--     and retries failures after 1, 5, 30, 120 and 600 minutes, then gives up
--   * every attempt is kept in webhook_deliveries for the Integrations page

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

-- ---- who may manage integrations ----------------------------------------
create or replace function public.can_manage_integrations() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role in ('admin', 'country_manager') and coalesce(p.is_active, true) and not coalesce(p.is_demo_visitor, false)
                     from public.profiles p where p.id = auth.uid()), false)
$$;

-- ---- API keys -------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  prefix text not null,                      -- the first characters, to recognise a key in a list
  key_hash text not null unique,             -- sha256 of the whole key, hex
  scopes text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  request_count bigint not null default 0,
  revoked_at timestamptz
);
alter table public.api_keys enable row level security;
drop policy if exists api_keys_admin_read on public.api_keys;
create policy api_keys_admin_read on public.api_keys for select using (public.can_manage_integrations());
revoke insert, update, delete on public.api_keys from anon, authenticated;

create table if not exists public.api_key_usage (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  minute timestamptz not null,
  calls int not null default 0,
  primary key (key_id, minute)
);
alter table public.api_key_usage enable row level security;   -- service role only

create or replace function public.api_scopes_catalog() returns text[]
language sql immutable as $$
  select array['hcps:read', 'hcps:write', 'institutions:read', 'institutions:write', 'orders:read', 'orders:write',
               'products:read', 'visits:read', 'events:read', 'expenses:read', 'tour_plans:read']
$$;

create or replace function public.api_key_create(p_name text, p_scopes text[]) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text; bad text; row public.api_keys;
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can create API keys'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the key a name'; end if;
  select string_agg(s, ', ') into bad from unnest(coalesce(p_scopes, '{}')) s where not (s = any(public.api_scopes_catalog()));
  if bad is not null then raise exception 'Unknown scope: %', bad; end if;
  if cardinality(coalesce(p_scopes, '{}')) = 0 then raise exception 'Choose at least one permission'; end if;
  k := 'fox_md_' || encode(gen_random_bytes(20), 'hex');
  insert into public.api_keys(name, prefix, key_hash, scopes, created_by)
  values (left(trim(p_name), 80), left(k, 14), encode(digest(k, 'sha256'), 'hex'), p_scopes, auth.uid())
  returning * into row;
  return jsonb_build_object('id', row.id, 'name', row.name, 'prefix', row.prefix, 'scopes', row.scopes,
                            'created_at', row.created_at, 'key', k);   -- the only time the key is ever shown
end $$;

create or replace function public.api_key_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can revoke API keys'; end if;
  update public.api_keys set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

-- Used by the Edge Function (service role): the key's id, owner and scopes if
-- it is live, and one call counted against its minute. null = refuse.
create or replace function public.api_key_check(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k public.api_keys; used int; m timestamptz := date_trunc('minute', now());
begin
  select * into k from public.api_keys where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and revoked_at is null;
  if k.id is null then return null; end if;
  insert into public.api_key_usage(key_id, minute, calls) values (k.id, m, 1)
  on conflict (key_id, minute) do update set calls = api_key_usage.calls + 1 returning calls into used;
  delete from public.api_key_usage where minute < now() - interval '1 hour';
  update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = k.id;
  return jsonb_build_object('id', k.id, 'created_by', k.created_by, 'scopes', k.scopes, 'limited', used > 120);
end $$;
revoke all on function public.api_key_check(text) from public, anon, authenticated;

-- ---- webhooks -------------------------------------------------------------
create or replace function public.webhook_events_catalog() returns text[]
language sql immutable as $$
  select array['hcp.created', 'hcp.updated', 'institution.created', 'visit.completed', 'order.created',
               'order.status_changed', 'expense.submitted', 'tour_plan.submitted', 'event.created', 'compliance.alert']
$$;

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  events text[] not null,
  secret text not null,
  active boolean not null default true,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_status int,
  last_delivery_at timestamptz
);
alter table public.webhooks enable row level security;
drop policy if exists webhooks_admin_read on public.webhooks;
create policy webhooks_admin_read on public.webhooks for select using (public.can_manage_integrations());
revoke insert, update, delete on public.webhooks from anon, authenticated;

create table if not exists public.webhook_deliveries (
  id bigint generated by default as identity primary key,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  request_id bigint,
  response_status int,
  response_body text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists webhook_deliveries_due on public.webhook_deliveries (status, next_attempt_at);
alter table public.webhook_deliveries enable row level security;
drop policy if exists webhook_deliveries_admin_read on public.webhook_deliveries;
create policy webhook_deliveries_admin_read on public.webhook_deliveries for select using (public.can_manage_integrations());
revoke insert, update, delete on public.webhook_deliveries from anon, authenticated;

-- https only, and never an address inside a private network or the platform
create or replace function public.webhook_url_ok(p_url text) returns boolean
language sql immutable as $$
  select p_url ~* '^https://[a-z0-9.-]+(:\d+)?(/.*)?$'
     and substring(lower(p_url) from '^https://([^/:]+)') !~ '^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)'
     and substring(lower(p_url) from '^https://([^/:]+)') !~ '(\.local|\.internal|\.localhost|supabase\.co|supabase\.in)$'
     and substring(lower(p_url) from '^https://([^/:]+)') ~ '\.'
$$;

create or replace function public.webhook_save(p_id uuid, p_url text, p_events text[], p_active boolean, p_description text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bad text; w public.webhooks; new_secret text;
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can manage webhooks'; end if;
  if not public.webhook_url_ok(trim(p_url)) then
    raise exception 'The URL must start with https:// and be a public address';
  end if;
  select string_agg(e, ', ') into bad from unnest(coalesce(p_events, '{}')) e where not (e = any(public.webhook_events_catalog()));
  if bad is not null then raise exception 'Unknown event: %', bad; end if;
  if cardinality(coalesce(p_events, '{}')) = 0 then raise exception 'Choose at least one event'; end if;
  if p_id is null then
    new_secret := 'whsec_' || encode(gen_random_bytes(24), 'hex');
    insert into public.webhooks(url, events, secret, active, description, created_by)
    values (trim(p_url), p_events, new_secret, coalesce(p_active, true), nullif(trim(coalesce(p_description, '')), ''), auth.uid())
    returning * into w;
    return to_jsonb(w);                        -- the secret is shown on creation
  end if;
  update public.webhooks set url = trim(p_url), events = p_events, active = coalesce(p_active, active),
         description = nullif(trim(coalesce(p_description, '')), '')
   where id = p_id returning * into w;
  if w.id is null then raise exception 'Webhook not found'; end if;
  return to_jsonb(w) - 'secret';
end $$;

create or replace function public.webhook_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can manage webhooks'; end if;
  delete from public.webhooks where id = p_id;
end $$;

-- the secret again, for an admin who lost it
create or replace function public.webhook_secret(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can see webhook secrets'; end if;
  return (select secret from public.webhooks where id = p_id);
end $$;

-- queue one event for every active webhook subscribed to it
create or replace function public.webhook_emit(p_event text, p_data jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.webhook_deliveries(webhook_id, event, payload)
  select w.id, p_event,
         jsonb_build_object('id', gen_random_uuid(), 'event', p_event, 'created_at', now(), 'data', p_data)
    from public.webhooks w where w.active and p_event = any(w.events)
$$;

create or replace function public.webhook_test(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can manage webhooks'; end if;
  insert into public.webhook_deliveries(webhook_id, event, payload)
  select id, 'ping', jsonb_build_object('id', gen_random_uuid(), 'event', 'ping', 'created_at', now(),
                                        'data', jsonb_build_object('message', 'Test delivery from Fox Medical CRM'))
    from public.webhooks where id = p_id;
end $$;

-- the table triggers: what happened, as the API would return it
create or replace function public.tg_webhook_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.webhooks where active) then return null; end if;
  if tg_table_name = 'hcps' then
    perform public.webhook_emit(case tg_op when 'INSERT' then 'hcp.created' else 'hcp.updated' end, to_jsonb(new));
  elsif tg_table_name = 'institutions' and tg_op = 'INSERT' then
    perform public.webhook_emit('institution.created', to_jsonb(new) - 'location');
  elsif tg_table_name = 'visits' then
    if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
      perform public.webhook_emit('visit.completed', to_jsonb(new) - 'check_in_selfie_url');
    end if;
  elsif tg_table_name = 'orders' then
    if tg_op = 'INSERT' then perform public.webhook_emit('order.created', to_jsonb(new));
    elsif new.status is distinct from old.status then
      perform public.webhook_emit('order.status_changed', to_jsonb(new) || jsonb_build_object('previous_status', old.status));
    end if;
  elsif tg_table_name = 'expenses' then
    if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      perform public.webhook_emit('expense.submitted', to_jsonb(new) - 'receipt_photo_url');
    end if;
  elsif tg_table_name = 'tour_plans' then
    if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      perform public.webhook_emit('tour_plan.submitted', to_jsonb(new));
    end if;
  elsif tg_table_name = 'events' and tg_op = 'INSERT' then
    perform public.webhook_emit('event.created', to_jsonb(new));
  elsif tg_table_name = 'compliance_alerts' and tg_op = 'INSERT' then
    perform public.webhook_emit('compliance.alert', to_jsonb(new));
  end if;
  return null;
end $$;

drop trigger if exists webhook_events on public.hcps;
create trigger webhook_events after insert or update on public.hcps for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.institutions;
create trigger webhook_events after insert on public.institutions for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.visits;
create trigger webhook_events after insert or update on public.visits for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.orders;
create trigger webhook_events after insert or update on public.orders for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.expenses;
create trigger webhook_events after insert or update on public.expenses for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.tour_plans;
create trigger webhook_events after insert or update on public.tour_plans for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.events;
create trigger webhook_events after insert on public.events for each row execute function public.tg_webhook_events();
drop trigger if exists webhook_events on public.compliance_alerts;
create trigger webhook_events after insert on public.compliance_alerts for each row execute function public.tg_webhook_events();

-- ---- delivery -------------------------------------------------------------
-- Every minute: settle what pg_net answered, then send what is due.
create or replace function public.webhook_dispatch() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare d record; body text; ts text; sig text; rid bigint;
  backoff int[] := array[1, 5, 30, 120, 600];
begin
  -- 1. answers to earlier sends
  for d in select wd.id, wd.webhook_id, wd.attempts, r.status_code, r.content, r.timed_out, r.error_msg
             from public.webhook_deliveries wd join net._http_response r on r.id = wd.request_id
            where wd.status = 'sending' loop
    if d.status_code between 200 and 299 then
      update public.webhook_deliveries set status = 'sent', response_status = d.status_code,
             response_body = left(d.content, 500), delivered_at = now() where id = d.id;
    else
      update public.webhook_deliveries
         set status = case when d.attempts >= 6 then 'failed' else 'pending' end,
             response_status = d.status_code,
             response_body = left(coalesce(d.error_msg, d.content, case when d.timed_out then 'timed out' end), 500),
             next_attempt_at = now() + make_interval(mins => backoff[least(d.attempts, 5)])
       where id = d.id;
    end if;
    update public.webhooks set last_status = d.status_code, last_delivery_at = now() where id = d.webhook_id;
  end loop;
  -- a send pg_net never answered (lost) goes back in the queue after 10 minutes
  update public.webhook_deliveries set status = 'pending'
   where status = 'sending' and next_attempt_at < now() - interval '10 minutes'
     and not exists (select 1 from net._http_response r where r.id = request_id);

  -- 2. send what is due (50 a minute is plenty for one company)
  for d in select wd.id, wd.event, wd.payload, w.url, w.secret
             from public.webhook_deliveries wd join public.webhooks w on w.id = wd.webhook_id
            where wd.status = 'pending' and wd.next_attempt_at <= now() and w.active
            order by wd.id limit 50 loop
    body := d.payload::text;
    ts := extract(epoch from now())::bigint::text;
    sig := encode(hmac(ts || '.' || body, d.secret, 'sha256'), 'hex');
    select net.http_post(url := d.url, body := d.payload,
             headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'FoxSystems-Webhooks/1',
                          'X-Fox-Event', d.event, 'X-Fox-Delivery', d.id::text, 'X-Fox-Timestamp', ts,
                          'X-Fox-Signature', 'sha256=' || sig),
             timeout_milliseconds := 10000) into rid;
    update public.webhook_deliveries set status = 'sending', request_id = rid, attempts = attempts + 1,
           next_attempt_at = now() where id = d.id;
  end loop;
  delete from public.webhook_deliveries where created_at < now() - interval '30 days';
end $$;
revoke all on function public.webhook_dispatch() from public, anon, authenticated;

select cron.unschedule('webhook-dispatch') where exists (select 1 from cron.job where jobname = 'webhook-dispatch');
select cron.schedule('webhook-dispatch', '* * * * *', 'select public.webhook_dispatch()');

revoke all on function public.api_key_create(text, text[]), public.api_key_revoke(uuid), public.webhook_save(uuid, text, text[], boolean, text),
  public.webhook_delete(uuid), public.webhook_secret(uuid), public.webhook_test(uuid), public.webhook_emit(text, jsonb) from public, anon;
grant execute on function public.api_key_create(text, text[]), public.api_key_revoke(uuid), public.webhook_save(uuid, text, text[], boolean, text),
  public.webhook_delete(uuid), public.webhook_secret(uuid), public.webhook_test(uuid) to authenticated;
revoke execute on function public.webhook_emit(text, jsonb) from authenticated;
