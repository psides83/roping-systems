begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff
where producer_id='8f96f20f-932b-45ae-ac93-9832818de64d' and role='owner' order by created_at limit 1),true);
do $$
declare sample record; rule_id uuid; options jsonb;
begin
  select run.id,r.producer_id,r.division_id,r.classification_id,h.classification_id member_class
  into sample from public.competition_runs run
  join public.event_ropings r on r.id=run.event_roping_id
  join public.roping_entries entry on entry.id=run.entry_id
  join public.classifications c on c.id=r.classification_id
  join lateral (select assignment.classification_id from public.membership_classification_history assignment
    where assignment.membership_id=entry.membership_id and assignment.division_id=r.division_id
      and assignment.effective_on<=r.scheduled_date and (assignment.ended_on is null or assignment.ended_on>=r.scheduled_date)
    order by assignment.effective_on desc,assignment.created_at desc limit 1) h on true
  where c.name='#11.5' and r.producer_id='8f96f20f-932b-45ae-ac93-9832818de64d'
    and h.classification_id<>r.classification_id limit 1;
  if sample.id is null then raise exception 'Missing enter-down fixture'; end if;
  insert into public.producer_penalty_rules(producer_id,division_id,name,seconds,classification_mode,classification_ids)
  values(sample.producer_id,sample.division_id,'Roping class regression',5,'only',array[sample.classification_id]) returning id into rule_id;
  options:=public.applicable_run_penalties(sample.id);
  if not options @> jsonb_build_array(jsonb_build_object('id',rule_id::text,'seconds',5)) then
    raise exception 'Roping-based penalty followed the member classification';
  end if;
  update public.producer_penalty_rules set classification_ids=array[sample.member_class] where id=rule_id;
  if public.applicable_run_penalties(sample.id) @> jsonb_build_array(jsonb_build_object('id',rule_id::text)) then
    raise exception 'Penalty incorrectly followed the member classification';
  end if;
  update public.producer_penalty_rules set classification_ids=array[sample.classification_id] where id=rule_id;
  if not public.applicable_run_penalties(sample.id) @> jsonb_build_array(jsonb_build_object('id',rule_id::text)) then
    raise exception 'Roping-based penalty did not match the entered roping';
  end if;
end;
$$;
select 'Passed roping-only classification penalty matching' result;
rollback;
