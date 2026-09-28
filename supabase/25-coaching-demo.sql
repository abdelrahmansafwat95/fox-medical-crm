-- Demo coaching history: each rep coached by their district manager every
-- ~3 weeks, scores improving; the latest session of two reps not yet acknowledged.
-- Written to public and (back-dated to the snapshot's as_of) to demo_snapshot.
do $$
declare
  r record; i int; d date; v_id uuid; s jsonb; base numeric; v_shift int;
  notes_s text[] := array[
    'Clear opening; used the doctor''s name and the last visit''s commitment.',
    'Strong product knowledge on dosing and interactions.',
    'Good use of the detailing deck; stayed within three minutes.',
    'Handled the price objection calmly with the patient-benefit message.'];
  notes_i text[] := array[
    'Ask for a specific commitment at the close (which patients, how many).',
    'Prepare two likely objections per doctor before the visit.',
    'Check the call plan the evening before; two A-class doctors were missed.',
    'Let the doctor talk more after the key message; ask an open question.'];
  plans text[] := array[
    'Next two weeks: end every A-class call with one concrete prescription commitment.',
    'Role-play the three most common objections with the district manager on Sunday.',
    'Plan the week in the app by Thursday evening; review coverage on Monday.',
    'Use the efficacy slide first with cardiologists; track time per slide.'];
  comments text[] := array['Agreed. Will focus on the close.', 'Thanks, useful day.', 'Will prepare objections in advance.', null];
begin
  select extract(day from date_trunc('day', now()) - date_trunc('day', as_of))::int into v_shift from demo_snapshot.meta where id = 1;
  for r in select p.id rep, p.line_manager_id mgr, row_number() over (order by p.id) n
             from public.profiles p where p.role like 'medical_rep%' and not p.is_demo_visitor and p.line_manager_id is not null loop
    for i in 0..3 loop
      d := current_date - (70 - i * 21 + (r.n::int % 3)) ;
      if d > current_date - 1 then continue; end if;
      base := 2.4 + i * 0.45 + (r.n % 2) * 0.3;
      s := jsonb_build_object(
        'planning',           least(5, greatest(1, round(base + 0.2))),
        'opening',            least(5, greatest(1, round(base + 0.5))),
        'product_knowledge',  least(5, greatest(1, round(base + 0.8))),
        'key_message',        least(5, greatest(1, round(base + 0.3))),
        'objection_handling', least(5, greatest(1, round(base - 0.4))),
        'closing',            least(5, greatest(1, round(base - 0.6))),
        'compliance',         least(5, greatest(1, round(base + 1.2))));
      v_id := gen_random_uuid();
      insert into public.coaching_sessions (id, rep_id, manager_id, coached_on, visits_observed, visit_ids, scores,
                                            strengths, improvements, action_plan, follow_up_on, rep_comment, acknowledged_at, created_at)
      select v_id, r.rep, r.mgr, d, greatest(1, least(8, count(v.id)::int)), coalesce(array_agg(v.id) filter (where v.id is not null), '{}'),
             s, notes_s[1 + (i + r.n::int) % 4], notes_i[1 + (i + r.n::int) % 4], plans[1 + (i + r.n::int) % 4], d + 21,
             case when i = 3 and r.n <= 2 then null else comments[1 + (i + r.n::int) % 4] end,
             case when i = 3 and r.n <= 2 then null else (d + 1)::timestamptz + interval '9 hours' end,
             d::timestamptz + interval '17 hours'
        from (select id from public.visits where rep_id = r.rep and planned_at::date = d limit 8) v;
    end loop;
  end loop;

  insert into demo_snapshot.coaching_sessions
  select id, rep_id, manager_id, coached_on - v_shift, visits_observed, visit_ids, scores, strengths, improvements,
         action_plan, follow_up_on - v_shift, rep_comment, acknowledged_at - make_interval(days => v_shift), created_at - make_interval(days => v_shift)
    from public.coaching_sessions c
   where not exists (select 1 from demo_snapshot.coaching_sessions x where x.id = c.id);
end $$;

select count(*) sessions, count(*) filter (where acknowledged_at is null) open, round(avg(overall), 2) avg_overall,
       (select count(*) from demo_snapshot.coaching_sessions) snap from public.coaching_sessions;
