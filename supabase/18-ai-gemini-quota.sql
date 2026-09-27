-- ============================================================================
-- 18 · AI on Gemini, behind a real sign-in and a daily cap (applied live, 2026-09-27)
-- ============================================================================
-- The AI routes moved from Anthropic (invalid key) to Google Gemini, on the free
-- key the real estate CRM uses. Those routes only checked that a request SAID
-- "Bearer …", so anyone could spend the key. lib/aiGuard.ts now verifies the
-- session and takes one unit of today's allowance here first: 25 calls a day
-- for a demo visitor, 200 for staff.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Africa/Cairo')::date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;   -- no policies: only the function below touches it

create or replace function public.ai_quota_take() returns boolean
language plpgsql security definer set search_path = public as $$
declare cap int; used int;
begin
  if auth.uid() is null then return false; end if;
  select case when p.is_demo_visitor then 25 else 200 end into cap
    from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  if cap is null then return false; end if;
  insert into public.ai_usage(user_id, calls) values (auth.uid(), 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into used;
  return used <= cap;
end $$;
revoke all on function public.ai_quota_take() from public, anon;
grant execute on function public.ai_quota_take() to authenticated;

-- Visitors get the AI assistant back now that it has a working provider.
create or replace function public.demo_signup_record(
  p_user_id uuid, p_email text, p_display_name text,
  p_full_name text, p_phone text, p_phone_normalized text, p_contact_email text,
  p_company text, p_team_size text, p_lang text, p_ip text, p_new boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_new then
    update public.profiles
       set role = 'country_manager', is_demo_visitor = true, full_name = p_display_name
     where id = p_user_id;
  end if;
  insert into demo_ops.visitors(user_id, email, full_name, phone, phone_normalized,
                                contact_email, company, team_size, language, ip)
  values (p_user_id, p_email, p_full_name, p_phone, p_phone_normalized,
          nullif(p_contact_email, ''), nullif(p_company, ''), nullif(p_team_size, ''), p_lang, p_ip);
end $$;

delete from public.permissions p
 using public.profiles pr
 where p.target_type = 'user' and p.target_id = pr.id::text and pr.is_demo_visitor
   and p.resource = 'assistant' and p.granted = false;
