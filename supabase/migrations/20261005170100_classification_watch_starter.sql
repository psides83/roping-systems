create function public.add_ucr_watch_starter(target_division_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare p uuid; total integer;
begin
  select producer_id into p from public.divisions where id=target_division_id;
  if p is null or auth.uid() is null or not public.can_manage_organization(p) then
    raise exception 'You do not have permission to configure this division'; end if;
  perform 1 from public.divisions where id=target_division_id for update;
  insert into public.classification_watch_rules(producer_id,division_id,classification_id,name,
    threshold_seconds,inclusive,review_count,time_basis,proposed_classification_id)
  select p,target_division_id,c.id,c.name || ' fast-time watch',v.threshold,v.inclusive,3,'final',
    (select next.id from public.classifications next where next.producer_id=p and next.division_id=target_division_id
      and next.eligibility_type='skill' and next.rank=v.next_number and next.is_active order by next.created_at limit 1)
  from (values (12::numeric,10::numeric,true,11.5::numeric),
    (11.5,10.25,false,11),(11,9,true,10),(10,8,true,9)) v(number,threshold,inclusive,next_number)
  join public.classifications c on c.producer_id=p and c.division_id=target_division_id
    and c.eligibility_type='skill' and c.rank=v.number and c.is_active
  where not exists(select 1 from public.classification_watch_rules w where w.producer_id=p and w.classification_id=c.id);
  get diagnostics total = row_count;
  return total;
end;
$$;
revoke all on function public.add_ucr_watch_starter(uuid) from public,anon;
grant execute on function public.add_ucr_watch_starter(uuid) to authenticated;
