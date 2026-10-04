begin;
create temporary table draft_checks (result text);
do $$
declare
  producer uuid;
  manager uuid;
  template uuid;
  saved uuid;
  blocked boolean := false;
begin
  select p.id, staff.user_id into strict producer, manager
  from public.producers p join public.producer_staff staff on staff.producer_id = p.id
  where p.slug = 'ultimate-calf-roping' and staff.role = 'owner' limit 1;
  perform set_config('request.jwt.claim.sub', manager::text, true);
  select id into strict template from public.roping_templates where producer_id = producer and competition_format <> 'four_d' limit 1;
  saved := public.save_payout_schedule_draft(producer, null, 'Draft safeguard test', '', 0, 10000, 2000, 0, 0, false, 'standard', null,
    '[{"stageType":"go_round","minimumEntries":1,"maximumEntries":null,"places":[{"place":1,"percentageBasisPoints":5000},{"place":2,"percentageBasisPoints":0}]}]'::jsonb);
  if not exists(select 1 from public.payout_schedules where id = saved and go_rounds_basis_points = 2000) then raise exception 'Draft did not preserve its unfinished allocation'; end if;
  if not exists(select 1 from public.payout_schedule_places p join public.payout_schedule_brackets b on b.id = p.payout_bracket_id where b.payout_schedule_id = saved and p.percentage_basis_points = 0) then raise exception 'Draft did not preserve the unfinished paid place'; end if;
  insert into draft_checks values ('PASS: unfinished allocations, missing stages and zero percentages saved');
  begin
    update public.roping_templates set payout_schedule_id = saved where id = template;
  exception when raise_exception then
    if sqlerrm not like 'Payout schedule is incomplete:%' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Incomplete draft was incorrectly accepted'; end if;
  insert into draft_checks values ('PASS: incomplete draft cannot be assigned');
  perform public.save_payout_schedule_draft(producer, saved, 'Draft safeguard test', '', 0, 10000, 10000, 0, 0, false, 'standard', null,
    '[{"stageType":"go_round","minimumEntries":1,"maximumEntries":null,"places":[{"place":1,"percentageBasisPoints":10000}]}]'::jsonb);
  update public.roping_templates set payout_schedule_id = saved where id = template;
  insert into draft_checks values ('PASS: completed draft saves and becomes assignable');
  perform public.save_payout_schedule_draft(producer, saved, 'Draft safeguard test', '', 0, 10000, 10000, 0, 0, false, 'four_d',
    '{"splitSeconds":0.5,"brackets":[{"minimumEntries":1,"maximumEntries":null,"activeDivisions":4,"purseBasisPoints":[0,0,0,0],"placesByDivision":[0,0,0,0]}]}'::jsonb, '[]'::jsonb);
  insert into draft_checks values ('PASS: unfinished 4D settings saved');
end;
$$;
select * from draft_checks;
rollback;
