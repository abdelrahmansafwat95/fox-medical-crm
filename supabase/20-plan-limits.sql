-- Plan limits: API access and audit-history depth, as sold on the pricing page
-- (foxsystemstech.com/pricing). Starter 3 months, Team 12, Growth 24,
-- Business and Complete full history; API keys and webhooks on Business and
-- Complete only.
--
-- One installation is one customer, so the plan is a single row. It lives in
-- its own schema: nothing in the app can write it, the demo resets do not
-- touch it, and it is not exposed through the REST API. Fox Systems sets it
-- when installing or changing a customer's plan:
--
--   update fox_plan.config set plan = 'team', updated_at = now();
--
-- Going down a plan never deletes keys or webhooks: they stop working (the
-- API answers 403, nothing is queued or sent) and can still be revoked or
-- deleted, and they work again if the plan goes back up. Audit rows older
-- than the plan's window are removed by the nightly 'audit-prune' job.
create schema if not exists fox_plan;
revoke all on schema fox_plan from public, anon, authenticated;

create table if not exists fox_plan.config (
  id boolean primary key default true check (id),
  plan text not null default 'complete' check (plan in ('starter', 'team', 'growth', 'business', 'complete')),
  updated_at timestamptz not null default now()
);
insert into fox_plan.config(id) values (true) on conflict do nothing;

create or replace function fox_plan.current() returns text
language sql stable security definer set search_path to 'fox_plan' as $$
  select coalesce((select plan from fox_plan.config where id), 'complete')
$$;
create or replace function fox_plan.api_enabled() returns boolean
language sql stable security definer set search_path to 'fox_plan' as $$
  select fox_plan.current() in ('business', 'complete')
$$;
-- null = keep everything
create or replace function fox_plan.audit_months() returns int
language sql stable security definer set search_path to 'fox_plan' as $$
  select case fox_plan.current() when 'starter' then 3 when 'team' then 12 when 'growth' then 24 end
$$;
grant usage on schema fox_plan to authenticated, service_role;
revoke all on all functions in schema fox_plan from public, anon;
grant execute on function fox_plan.current(), fox_plan.api_enabled(), fox_plan.audit_months() to authenticated, service_role;

-- What the settings pages show: which plan, whether the API is included, and
-- how far back the history goes.
create or replace function public.plan_info() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('plan', fox_plan.current(), 'api_enabled', fox_plan.api_enabled(),
                            'audit_months', fox_plan.audit_months())
$$;
revoke all on function public.plan_info() from public, anon;
grant execute on function public.plan_info() to authenticated;

create or replace function fox_plan.audit_prune() returns int
language plpgsql security definer set search_path to 'public' as $$
declare m int := fox_plan.audit_months(); n int;
begin
  if m is null then return 0; end if;
  delete from public.activity_log where created_at < now() - make_interval(months => m);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function fox_plan.audit_prune() from public, anon, authenticated;

select cron.unschedule('audit-prune') where exists (select 1 from cron.job where jobname = 'audit-prune');
select cron.schedule('audit-prune', '17 1 * * *', 'select fox_plan.audit_prune()');

-- The API and webhook functions, each with only the plan gate added.
CREATE OR REPLACE FUNCTION public.api_key_create(p_name text, p_scopes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k text; bad text; row public.api_keys;
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can create API keys'; end if;
  if not fox_plan.api_enabled() then raise exception 'API access and webhooks are part of the Business and Complete plans'; end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.webhook_save(p_id uuid, p_url text, p_events text[], p_active boolean, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare bad text; w public.webhooks; new_secret text;
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can manage webhooks'; end if;
  if not fox_plan.api_enabled() then raise exception 'API access and webhooks are part of the Business and Complete plans'; end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.webhook_test(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_integrations() then raise exception 'Only an administrator can manage webhooks'; end if;
  if not fox_plan.api_enabled() then raise exception 'API access and webhooks are part of the Business and Complete plans'; end if;
  insert into public.webhook_deliveries(webhook_id, event, payload)
  select id, 'ping', jsonb_build_object('id', gen_random_uuid(), 'event', 'ping', 'created_at', now(),
                                        'data', jsonb_build_object('message', 'Test delivery from Fox Medical CRM'))
    from public.webhooks where id = p_id;
end $function$;
CREATE OR REPLACE FUNCTION public.api_key_check(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k public.api_keys; used int; m timestamptz := date_trunc('minute', now());
begin
  select * into k from public.api_keys where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and revoked_at is null;
  if k.id is null then return null; end if;
  insert into public.api_key_usage(key_id, minute, calls) values (k.id, m, 1)
  on conflict (key_id, minute) do update set calls = api_key_usage.calls + 1 returning calls into used;
  delete from public.api_key_usage where minute < now() - interval '1 hour';
  update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = k.id;
  return jsonb_build_object('id', k.id, 'created_by', k.created_by, 'scopes', k.scopes, 'limited', used > 120, 'plan_api', fox_plan.api_enabled());
end $function$;
CREATE OR REPLACE FUNCTION public.webhook_emit(p_event text, p_data jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.webhook_deliveries(webhook_id, event, payload)
  select w.id, p_event,
         jsonb_build_object('id', gen_random_uuid(), 'event', p_event, 'created_at', now(), 'data', p_data)
    from public.webhooks w where w.active and p_event = any(w.events) and fox_plan.api_enabled()
$function$;
CREATE OR REPLACE FUNCTION public.webhook_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare d record; body text; ts text; sig text; rid bigint;
  backoff int[] := array[1, 5, 30, 120, 600];
begin
  if not fox_plan.api_enabled() then return; end if;
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
end $function$;
