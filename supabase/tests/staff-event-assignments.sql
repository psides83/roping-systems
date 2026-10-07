begin;
do $$
declare actor uuid; tenant uuid; selected_event uuid; other_event uuid;
begin
  select id into strict actor from auth.users where lower(email)='psides83@hotmail.com';
  select id,producer_id into strict selected_event,tenant from public.events
    where id='0405a4f6-bdf6-49d6-af75-7f665006308b';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.assign_staff_event(tenant,selected_event,actor,true);
  perform public.assign_staff_event(tenant,selected_event,actor,true);
  if (select count(*) from public.staff_event_assignments where producer_id=tenant and event_id=selected_event and user_id=actor)<>1 then
    raise exception 'Assignment is not idempotent';
  end if;
  other_event := gen_random_uuid();
  begin
    perform public.assign_staff_event(tenant,other_event,actor,true);
    raise exception 'Invalid event accepted';
  exception when others then
    if sqlerrm <> 'Choose an event and staff member from this producer.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.assign_staff_event(tenant,selected_event,actor,false);
    raise exception 'Unauthorized assignment mutation accepted';
  exception when others then
    if sqlerrm <> 'Event assignments require an owner or administrator.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.assign_staff_event(tenant,selected_event,actor,false);
  if exists(select 1 from public.staff_event_assignments where producer_id=tenant and event_id=selected_event and user_id=actor) then
    raise exception 'Assignment removal failed';
  end if;
end;
$$;
rollback;
