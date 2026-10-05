create temporary table test_ropings (
  event_id uuid, roping_id uuid primary key, template_id uuid, template_name text,
  format text, day integer
) on commit drop;

do $$
declare
  fixture_producer uuid := current_setting('test.producer_id')::uuid;
  producer_timezone text;
  weekend integer;
  event_uuid uuid;
  event_slug text;
  event_date date;
  office_fee uuid;
  template_record record;
  class_uuid uuid;
  roping_uuid uuid;
  roping_record record;
  member_record record;
  fee_record record;
  run_record record;
  plan_record record;
  entry_uuid uuid;
  target_roper uuid;
  last_entry uuid;
  copied_fees integer;
  entry_total integer;
  member_index integer;
  run_index integer;
  repeat_index integer;
  round_index integer;
  seeded integer;
  raw_seconds numeric;
  expected_seconds numeric;
  penalty numeric;
  readings numeric[];
  outcome public.run_status;
  rejected boolean;
  expected_bracket jsonb;
  expected_short integer;
  expected_pool bigint;
  actual_pool bigint;
  td_division uuid;
  selected_class record;
begin
  select timezone into producer_timezone from public.producers where id = fixture_producer;
  select division_id into td_division from public.classifications
  where producer_id = fixture_producer and rank = 11.5 and is_active limit 1;
  perform pg_temp.check_test(exists(select 1 from public.roping_templates where producer_id=fixture_producer and is_active and competition_format='four_d'), '4-D template exists');
  perform pg_temp.check_test(exists(select 1 from public.roping_templates where producer_id=fixture_producer and is_active and competition_format='handicap'), 'Handicap template exists');

  for weekend in 1..2 loop
    event_date := case weekend when 1 then '2026-11-07'::date else '2026-11-21'::date end;
    event_slug := case when current_setting('test.retain') = 'true' then 'test-suite-v2-weekend-' || weekend
      else 'automation-' || gen_random_uuid() end;
    select id into event_uuid from public.events where producer_id=fixture_producer and slug=event_slug;
    if event_uuid is not null then
      insert into test_report(scenario,detail) values('Existing fixtures preserved',jsonb_build_object('eventId',event_uuid,'weekend',weekend));
      continue;
    end if;
    insert into public.events(producer_id,title,slug,venue_name,venue_city,venue_state,starts_at,ends_at,status,arena_count,publication_state,is_public)
    values(fixture_producer,'TEST Classification Weekend ' || weekend,event_slug,'Test Arena','Granbury','TX',
      (event_date + time '08:00') at time zone producer_timezone,
      (event_date + 1 + time '20:00') at time zone producer_timezone,'draft',2,'unpublished',false)
    returning id into event_uuid;
    insert into public.event_fees(producer_id,event_id,title,amount_cents,scope,is_required,contributes_to_payout,included_in_entry_price,kind)
    values(fixture_producer,event_uuid,'Test Weekend Office Charge',2000,'contestant_event',true,false,false,'standard') returning id into office_fee;

    for template_record in
      with classes as (
        select c.*,row_number() over(partition by division_id order by rank desc,name,id) as class_ordinal
        from public.classifications c where producer_id=fixture_producer and is_active and standalone_enabled
      ), candidates as (
        select t.*,d.test_day,c.id as test_class_id,coalesce(c.class_ordinal,1) as class_ordinal,
          row_number() over(partition by d.test_day,t.division_id,c.id,t.competition_format order by t.name,t.id) as format_choice,
          count(*) over(partition by d.test_day,t.division_id,c.id,t.competition_format) as format_count
        from public.roping_templates t cross join generate_series(1,2) as d(test_day)
        left join classes c on c.division_id=t.division_id and t.competition_format<>'handicap'
          and case when t.name ilike '%open%' or t.competition_format='four_d'
            then c.name='Open' else c.eligibility_type in ('skill','age') end
        where t.producer_id=fixture_producer and t.is_active
          and (t.competition_format='handicap' or c.id is not null)
      )
      select * from candidates
      where format_choice=1+mod(class_ordinal+weekend+test_day-3,format_count)
      order by test_day,name,test_class_id
    loop
      class_uuid := template_record.test_class_id;
      roping_uuid := public.add_roping_to_event(event_uuid,template_record.id,class_uuid,
        event_date + template_record.test_day - 1,(case when exists(select 1 from test_ropings tr join public.event_ropings er on er.id=tr.roping_id where tr.event_id=event_uuid and tr.day=template_record.test_day and er.arena_name=case when template_record.division_id=td_division then 'Arena 1' else 'Arena 2' end) then 'follows_previous' else 'fixed' end)::public.class_schedule_type,
        event_date + template_record.test_day - 1 + time '09:00',
        'Automated test fixture using ' || template_record.name,
        case when template_record.division_id=td_division then 'Arena 1' else 'Arena 2' end,
        template_record.main_round_count,template_record.cattle_draw_enabled);
      insert into test_ropings values(event_uuid,roping_uuid,template_record.id,template_record.name,template_record.competition_format,template_record.test_day);
      perform pg_temp.check_test(public.event_roping_template_snapshot(roping_uuid,false)=public.event_roping_template_snapshot(roping_uuid,true),
        'New roping matches template: ' || template_record.name);
      select count(*) into copied_fees from public.event_fees where event_roping_id=roping_uuid;
      perform pg_temp.check_test(copied_fees=(select count(*) from public.roping_template_fees where roping_template_id=template_record.id), 'All template fees copied');
      if template_record.payout_schedule_id is null then
        insert into test_report(scenario,detail) values('Configuration warning',jsonb_build_object('template',template_record.name,'warning','No payout schedule selected; payout amounts cannot be tested for this template.'));
      end if;
    end loop;
    perform pg_temp.check_test(not exists(
      select 1 from public.event_ropings where event_id=event_uuid
      group by scheduled_date,division_id,classification_id,competition_format having count(*)>1
    ),'Only one roping per classification and format per division per day');

    for roping_record in
      select r.*, t.template_name from public.event_ropings r join test_ropings t on t.roping_id=r.id where r.event_id=event_uuid order by r.sort_order
    loop
      select * into selected_class from public.classifications where id=roping_record.classification_id;
      member_index := 0;
      for member_record in select * from test_members
        where case when roping_record.division_id=td_division then ordinal<=48 else ordinal>48 end
          and (roping_record.classification_id is null or selected_class.eligibility_type<>'skill' or td_rank=selected_class.rank
            or ordinal=(select min(ordinal) from test_members where ordinal<=48 and td_rank>selected_class.rank))
          and (selected_class.eligibility_type is distinct from 'age' or ordinal%6=0)
        order by (td_rank=selected_class.rank) desc nulls last,ordinal
      loop
        member_index := member_index+1;
        for repeat_index in 1..case when member_index<=case weekend when 1 then 4 else 12 end then coalesce(roping_record.max_entries_per_roper,1) else 1 end loop
          entry_uuid := public.create_event_entry_with_eligibility_override(roping_record.id,member_record.roper_id,'office','paid_cash',null);
          update public.roping_entries set entered_at=event_date::timestamp at time zone producer_timezone
            + (member_index * 10 + repeat_index) * interval '1 second' where id=entry_uuid;
          for fee_record in select * from public.event_fees where event_roping_id=roping_record.id and not is_required loop
            if (fee_record.kind='insurance' and member_record.ordinal%3=0)
              or (fee_record.kind<>'insurance' and member_record.ordinal%2=0) then
              perform public.add_entry_option(entry_uuid,fee_record.id);
            end if;
          end loop;
          if roping_record.competition_format='handicap' then
            perform pg_temp.check_test((select handicap_time_credit_seconds from public.roping_entries where id=entry_uuid)=
              (select handicap_adjustment_seconds from public.classifications where id=member_record.ba_classification_id), 'Handicap credit follows the member classification');
          end if;
        end loop;
        if member_index=1 then target_roper:=member_record.roper_id; end if;
      end loop;
      if selected_class.eligibility_type='skill' then
        perform pg_temp.check_test((select count(*) from public.roping_entries e join test_members m on m.roper_id=e.roper_id where e.event_roping_id=roping_record.id and m.td_rank=selected_class.rank)
          >=4*(select count(*) from public.roping_entries e join test_members m on m.roper_id=e.roper_id where e.event_roping_id=roping_record.id and m.td_rank<>selected_class.rank),'At least 80 percent of numbered entries match the roping classification');
      end if;
      rejected:=false;
      begin
        perform public.create_event_entry_with_eligibility_override(roping_record.id,target_roper,'office','paid_cash',null);
      exception when others then
        if sqlerrm not like '%reached the entry limit%' then raise; end if;
        rejected:=true;
      end;
      perform pg_temp.check_test(rejected,'Maximum entries enforced');
      if selected_class.eligibility_type='skill' and roping_record.competition_format='standard'
        and exists(select 1 from test_members where ordinal<=48 and td_rank<selected_class.rank) then
        select roper_id into target_roper from test_members where ordinal<=48 and td_rank<selected_class.rank limit 1;
        rejected:=false;
        begin
          perform public.create_event_entry_with_eligibility_override(roping_record.id,target_roper,'office','paid_cash',null);
        exception when others then
          if sqlerrm not like '%cannot enter%' then raise; end if;
          rejected:=true;
        end;
        perform pg_temp.check_test(rejected,'Numbered ropers can enter down but not up');
      end if;
    end loop;
    perform pg_temp.check_test(not exists(select 1 from public.entry_charges where event_fee_id=office_fee group by roper_id having count(*)<>1),
      'Office charge occurs once per contestant for the whole weekend');
    update public.events set status='in_progress',publication_state='published' where id=event_uuid;

    for roping_record in
      select r.*, t.template_name from public.event_ropings r join test_ropings t on t.roping_id=r.id where r.event_id=event_uuid order by r.sort_order
    loop
      select count(*) into entry_total from public.roping_entries where event_roping_id=roping_record.id;
      for round_index in 1..roping_record.main_round_count loop
        perform pg_temp.check_test(public.generate_division_draw(roping_record.id,round_index)=entry_total,'Draw includes every entry');
        perform public.generate_division_draw(roping_record.id,round_index);
        if round_index=1 then
          select id into last_entry from public.roping_entries where event_roping_id=roping_record.id order by entered_at desc limit 1;
          perform pg_temp.check_test((select entry_id from public.competition_runs where event_roping_id=roping_record.id and round_number=1 and draw_position=1)=last_entry,'Last entry ropes first');
        elsif round_index=2 and roping_record.second_round_ordering='reverse_first' then
          perform pg_temp.check_test((select entry_id from public.competition_runs where event_roping_id=roping_record.id and round_number=2 and draw_position=1)=
            (select entry_id from public.competition_runs where event_roping_id=roping_record.id and round_number=1 order by draw_position desc limit 1),'Second round starts in reverse first-round order');
        end if;
        run_index:=0;
        for run_record in select * from public.competition_runs where event_roping_id=roping_record.id and round_number=round_index order by draw_position loop
          run_index:=run_index+1;
          raw_seconds:=case when roping_record.division_id=td_division then 8 + ((run_index*run_index*17 + run_index*37 + round_index*19 + weekend*11)%541)*0.01
            else 2 + ((run_index-1)%4)*0.5 + ((run_index*17 + round_index*7 + weekend*3)%43)*0.01 end;
          penalty:=case when run_index%17=0 then 5 else 0 end;
          outcome:=case when run_index%13=0 then 'no_time' else 'complete' end;
          readings:=array_fill(raw_seconds,array[roping_record.timer_count]);
          if roping_record.timer_count>1 then readings[2]:=raw_seconds+0.01; end if;
          if run_index=2 then
            perform public.record_run_result_multi(run_record.id,'{}'::numeric[],0,'rerun');
            perform public.schedule_run_rerun(run_record.id,'immediate','Automated immediate rerun');
          end if;
          expected_seconds:=case roping_record.timer_resolution when 'best' then raw_seconds
            when 'longest' then (select max(x) from unnest(readings) x)
            else (select round(avg(x),2) from unnest(readings) x) end;
          perform public.record_run_result_multi(run_record.id,readings,penalty,outcome);
          if outcome='complete' then
            perform pg_temp.check_test((select raw_time_seconds from public.competition_runs where id=run_record.id)=expected_seconds,'Official timer result rounds to hundredths');
          end if;
          if run_index=1 then
            if roping_record.timer_count>1 then
              update public.event_ropings set timer_resolution='best' where id=roping_record.id;
              perform pg_temp.check_test(public.correct_run_result_multi(run_record.id,readings,penalty,outcome,'Automated best timer test')=raw_seconds,'Best timer selects the lowest reading');
              update public.event_ropings set timer_resolution='longest' where id=roping_record.id;
              perform pg_temp.check_test(public.correct_run_result_multi(run_record.id,readings,penalty,outcome,'Automated longest timer test')=(select max(x) from unnest(readings) x),'Longest timer selects the highest reading');
              update public.event_ropings set timer_resolution=roping_record.timer_resolution where id=roping_record.id;
            end if;
            perform public.correct_run_result_multi(run_record.id,readings,penalty,outcome,'Automated correction attribution test');
            perform pg_temp.check_test(exists(select 1 from public.competition_runs where id=run_record.id and corrected_by=auth.uid()),'Corrections retain actor attribution');
          end if;
        end loop;
        perform public.complete_roping_round(roping_record.id,round_index);
      end loop;

      if roping_record.short_round_enabled then
        select b.comeback_count into expected_short from public.event_roping_short_round_brackets b
        where b.event_roping_id=roping_record.id and entry_total>=b.minimum_entries and (b.maximum_entries is null or entry_total<=b.maximum_entries)
        order by b.minimum_entries desc limit 1;
        seeded:=public.seed_short_round(roping_record.id);
        perform pg_temp.check_test(seeded>=least(expected_short,entry_total),'Short round brackets and cutoff ties qualify the field');
        perform pg_temp.check_test(not exists(
          select 1 from public.competition_runs short_run
          where short_run.event_roping_id=roping_record.id and short_run.round_number=roping_record.main_round_count+1
            and (select count(*) from public.competition_runs main_run where main_run.entry_id=short_run.entry_id
              and main_run.round_number<=roping_record.main_round_count and main_run.status='complete' and not main_run.is_excluded)<>roping_record.main_round_count
        ),'Short round excludes entries without complete qualified main rounds');
        for run_record in select * from public.competition_runs where event_roping_id=roping_record.id and round_number=roping_record.main_round_count+1 order by draw_position loop
          perform public.record_run_result_multi(run_record.id,array_fill(10+run_record.draw_position*0.01,array[roping_record.timer_count]),0,'complete');
        end loop;
        perform public.complete_roping_round(roping_record.id,roping_record.main_round_count+1);
      end if;

      if roping_record.competition_format='four_d' then
        select b into expected_bracket from jsonb_array_elements(roping_record.four_d_settings->'brackets') b
        where entry_total >= (b->>'minimumEntries')::integer and (nullif(b->>'maximumEntries','') is null or entry_total<=(b->>'maximumEntries')::integer)
        order by (b->>'minimumEntries')::integer desc limit 1;
        perform pg_temp.check_test(expected_bracket is not null,'4-D payout schedule copied into the roping');
        perform pg_temp.check_test((select count(distinct d_number) from public.calculate_four_d_results(roping_record.id))=4,'All four D bands populated');
        perform pg_temp.check_test(not exists(select 1 from public.calculate_four_d_results(roping_record.id) r
          where r.places_paid<>(expected_bracket->'placesByDivision'->>(r.d_number-1))::integer),'4-D paid places follow the entry-count bracket');
        perform pg_temp.check_test(not exists(
          select 1 from public.calculate_four_d_results(roping_record.id) r
          where r.d_number<>least((expected_bracket->>'activeDivisions')::integer,
            floor((r.final_time_seconds-(select min(final_time_seconds) from public.calculate_four_d_results(roping_record.id))) /
              (roping_record.four_d_settings->>'splitSeconds')::numeric)::integer+1)
        ),'4-D bands use final-time boundaries');
      end if;

      for plan_record in select * from public.event_roping_payout_plans where event_roping_id=roping_record.id loop
        select max(pool_cents) into actual_pool from public.calculate_roping_payouts(plan_record.id);
        select coalesce(sum(c.amount_cents),0) into expected_pool from public.entry_charges c
        join public.event_fees f on f.id=c.event_fee_id
        where c.entry_id in (select id from public.roping_entries where event_roping_id=roping_record.id)
          and c.waived_at is null and case when plan_record.pool_type='main' then f.contributes_to_payout and f.kind not in ('side_pot','insurance')
            else f.id=plan_record.event_fee_id end;
        expected_pool:=floor(expected_pool*plan_record.payback_basis_points/10000.0)+plan_record.added_money_cents;
        perform pg_temp.check_test(actual_pool=expected_pool,'Purse excludes production/office charges and includes only selected pots');
        perform pg_temp.check_test((select coalesce(sum(payout_cents),0) from public.calculate_roping_payout_results(plan_record.id))<=actual_pool,'Payouts never exceed the purse');
        if plan_record.pool_type='main' and actual_pool>0 and roping_record.competition_format<>'four_d' then
          perform pg_temp.check_test(exists(select 1 from public.calculate_roping_payout_results(plan_record.id) where payout_cents>0),
            'A funded main jackpot pays its qualified winners');
          if exists(
            select 1 from (values ('go_round'::public.payout_stage_type,plan_record.go_rounds_basis_points),
              ('aggregate'::public.payout_stage_type,plan_record.aggregate_basis_points),
              ('short_round'::public.payout_stage_type,plan_record.short_round_basis_points)) stage(kind,share)
            where stage.share>0 and not exists(select 1 from public.event_roping_payout_brackets b
              join public.event_roping_payout_places p on p.payout_bracket_id=b.id
              where b.payout_plan_id=plan_record.id and b.stage_type=stage.kind
                and entry_total>=b.minimum_entries and (b.maximum_entries is null or entry_total<=b.maximum_entries))
          ) then
            insert into test_report(scenario,detail) values('Configuration warning',jsonb_build_object(
              'template',roping_record.template_name,'entries',entry_total,
              'warning','A funded payout stage has no applicable place-percentage range. Full-purse distribution cannot be validated until the schedule covers this entry count.'));
          else
            perform pg_temp.check_test((select sum(payout_cents) from public.calculate_roping_payout_results(plan_record.id))=actual_pool,
              'The main jackpot distributes the full purse across go rounds, aggregate, and short round');
          end if;
        elsif plan_record.pool_type='main' and roping_record.competition_format='four_d' then
          if not exists(select 1 from public.calculate_four_d_payout_breakdown(plan_record.id)) then
            insert into test_report(scenario,detail) values('Configuration warning',jsonb_build_object(
              'template',roping_record.template_name,'entries',entry_total,
              'warning','No applicable 4-D paid-place percentages for this entry count. D rankings are tested, but dollar payouts are blocked by schedule configuration.'));
          else
            perform pg_temp.check_test((select sum(payout_cents) from public.calculate_four_d_payout_breakdown(plan_record.id))=actual_pool,
              '4-D payout shares allocate the whole purse');
            perform pg_temp.check_test((select sum(payout_cents) from public.calculate_four_d_payout_results(plan_record.id))=actual_pool,
              '4-D winners receive the whole purse, including tied places');
            perform pg_temp.check_test(not exists(
              select 1 from public.calculate_four_d_payout_results(plan_record.id)
              group by d_number,performance_seconds having max(payout_cents)-min(payout_cents)>1
            ),'4-D ties split combined paid places');
          end if;
        end if;
        perform pg_temp.check_test(not exists(
          select 1 from public.calculate_roping_payout_results(plan_record.id)
          group by section_type,round_number,performance_seconds having max(payout_cents)-min(payout_cents)>1
        ),'Tied contestants split combined places with at most a one-cent remainder');
        if plan_record.event_fee_id is not null then
          perform pg_temp.check_test(not exists(
            select 1 from public.calculate_roping_payout_results(plan_record.id) paid
            where not exists(select 1 from public.entry_charges c where c.entry_id=paid.entry_id and c.event_fee_id=plan_record.event_fee_id and c.waived_at is null)
          ),'Optional pot winners must have selected the pot');
          if (select kind from public.event_fees where id=plan_record.event_fee_id)='insurance' then
            perform pg_temp.check_test(not exists(
              select 1 from public.calculate_roping_payout_results(plan_record.id) insurance
              join public.event_roping_payout_plans main_plan on main_plan.event_roping_id=roping_record.id and main_plan.pool_type='main'
              cross join lateral public.calculate_roping_payout_results(main_plan.id) main_winner
              where main_winner.entry_id=insurance.entry_id and main_winner.section_type=insurance.section_type
                and main_winner.round_number is not distinct from insurance.round_number
            ),'Insurance excludes main-jackpot winners in the same round or aggregate');
          end if;
        end if;
      end loop;
      perform pg_temp.check_test((select count(*) from public.public_aggregate_results where event_roping_id=roping_record.id)=entry_total,'Public aggregate includes all recorded entries');
      perform pg_temp.check_test(not exists(
        select 1 from public.public_aggregate_results result
        cross join lateral (
          select bool_or(run.status in ('no_time','scratch')) as no_time,
            sum(greatest(run.raw_time_seconds+run.penalty_seconds-entry.handicap_time_credit_seconds,0))
              filter(where run.status='complete') as total
          from public.competition_runs run join public.roping_entries entry on entry.id=run.entry_id
          where run.entry_id=result.result_id
        ) expected
        where result.event_roping_id=roping_record.id
          and result.aggregate_time_seconds is distinct from expected.total
      ),'Public aggregate is the sum of adjusted qualified runs, not a mathematical mean');
      insert into test_report(scenario,detail) values('Event-day template passed',jsonb_build_object('weekend',weekend,'template',roping_record.template_name,
        'format',roping_record.competition_format,'classification',roping_record.name,'day',roping_record.scheduled_date,'entries',entry_total,
        'mainRounds',roping_record.main_round_count,'shortRound',roping_record.short_round_enabled,'ropingId',roping_record.id));
      update public.event_ropings set event_day_status='completed' where id=roping_record.id;
    end loop;
    update public.events set status='completed',publication_state='published',is_public=true where id=event_uuid;
    insert into test_report(scenario,detail) values('Completed test weekend',jsonb_build_object('eventId',event_uuid,'slug',event_slug,
      'entries',(select count(*) from public.roping_entries where event_id=event_uuid),
      'runs',(select count(*) from public.competition_runs r join public.event_ropings e on e.id=r.event_roping_id where e.event_id=event_uuid)));
  end loop;
end;
$$;
