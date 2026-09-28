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
  option_record public.online_entry_request_options%rowtype;
  new_entry_id uuid;
  entries_created integer := 0;
begin
  select * into request_record from public.online_entry_requests where id = target_request_id for update;
  if request_record.id is null or not public.can_manage_organization(request_record.organization_id) then raise exception 'You do not have permission to review this request'; end if;
  if request_record.status <> 'pending' then raise exception 'This request has already been reviewed'; end if;
  if review_decision not in ('accepted', 'declined') then raise exception 'Choose accepted or declined'; end if;
  if review_decision = 'accepted' then
    selected_person_id := request_record.person_id;
    if selected_person_id is null then select id into selected_person_id from public.people where lower(email) = lower(request_record.email) limit 1; end if;
    if selected_person_id is null then insert into public.people (first_name, last_name, email, phone) values (request_record.first_name, request_record.last_name, request_record.email, request_record.phone) returning id into selected_person_id; end if;
    for item_record in select * from public.online_entry_request_items where request_id = request_record.id order by created_at
    loop
      for entry_index in 1..item_record.quantity
      loop
        new_entry_id := public.create_event_entry(item_record.roping_division_id, selected_person_id, 'online'::public.entry_source, 'unpaid'::public.payment_status);
        for option_record in select * from public.online_entry_request_options where request_item_id = item_record.id
        loop
          perform public.add_entry_option(new_entry_id, option_record.roping_fee_id);
        end loop;
        entries_created := entries_created + 1;
      end loop;
    end loop;
    update public.online_entry_requests set person_id = selected_person_id where id = request_record.id;
  end if;
  update public.online_entry_requests set status = review_decision, review_note = nullif(trim(entered_review_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = request_record.id;
  return entries_created;
end;
$$;

create or replace function public.record_run_result_multi(
  target_run_id uuid,
  entered_timer_readings numeric[],
  entered_penalty numeric,
  entered_status public.run_status
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.runs%rowtype;
  division_record public.roping_divisions%rowtype;
  resolved_time numeric(8, 3);
begin
  select * into run_record from public.runs where id = target_run_id;
  if run_record.id is null or not public.can_manage_organization(run_record.organization_id) then
    raise exception 'You do not have permission to record this run';
  end if;
  select * into division_record from public.roping_divisions where id = run_record.roping_division_id;
  if entered_status = 'complete' then
    if coalesce(array_length(entered_timer_readings, 1), 0) <> division_record.timer_count then
      raise exception 'Enter a reading from every configured timer';
    end if;
    if exists (select 1 from unnest(entered_timer_readings) reading where reading is null or reading < 0) then
      raise exception 'Timer readings must be valid positive times';
    end if;
    if division_record.timer_resolution = 'best' then
      select min(reading) into resolved_time from unnest(entered_timer_readings) reading;
    elsif division_record.timer_resolution = 'longest' then
      select max(reading) into resolved_time from unnest(entered_timer_readings) reading;
    else
      select round(avg(reading), 3) into resolved_time from unnest(entered_timer_readings) reading;
    end if;
  end if;

  delete from public.run_timer_readings where run_id = target_run_id;
  if entered_status = 'complete' then
    for timer_index in 1..division_record.timer_count loop
      insert into public.run_timer_readings (organization_id, run_id, timer_number, time_seconds, entered_by)
      values (run_record.organization_id, target_run_id, timer_index, entered_timer_readings[timer_index], auth.uid());
    end loop;
  end if;

  update public.runs
  set raw_time_seconds = case when entered_status = 'complete' then resolved_time else null end,
      penalty_seconds = case when entered_status = 'complete' then coalesce(entered_penalty, 0) else 0 end,
      status = entered_status,
      recorded_by = auth.uid(),
      recorded_at = now()
  where id = target_run_id;
  return resolved_time;
end;
$$;
