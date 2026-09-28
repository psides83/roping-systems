create or replace function public.review_online_entry_request(
  target_request_id uuid,
  review_decision public.entry_request_status,
  entered_review_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.online_entry_requests%rowtype;
  selected_person_id uuid;
  item_record public.online_entry_request_items%rowtype;
  entries_created integer := 0;
begin
  select * into request_record
  from public.online_entry_requests
  where id = target_request_id
  for update;

  if request_record.id is null
    or not public.can_manage_organization(request_record.organization_id) then
    raise exception 'You do not have permission to review this request';
  end if;

  if request_record.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if review_decision not in ('accepted', 'declined') then
    raise exception 'Choose accepted or declined';
  end if;

  if review_decision = 'accepted' then
    selected_person_id := request_record.person_id;

    if selected_person_id is null then
      select id into selected_person_id
      from public.people
      where lower(email) = lower(request_record.email)
      limit 1;
    end if;

    if selected_person_id is null then
      insert into public.people (first_name, last_name, email, phone)
      values (
        request_record.first_name,
        request_record.last_name,
        request_record.email,
        request_record.phone
      ) returning id into selected_person_id;
    end if;

    for item_record in
      select * from public.online_entry_request_items
      where request_id = request_record.id
      order by created_at
    loop
      for entry_index in 1..item_record.quantity
      loop
        perform public.create_event_entry(
          item_record.roping_division_id,
          selected_person_id,
          'online'::public.entry_source,
          'unpaid'::public.payment_status
        );
        entries_created := entries_created + 1;
      end loop;
    end loop;

    update public.online_entry_requests
    set person_id = selected_person_id
    where id = request_record.id;
  end if;

  update public.online_entry_requests
  set
    status = review_decision,
    review_note = nullif(trim(entered_review_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request_record.id;

  return entries_created;
end;
$$;
