alter type public.entry_request_status add value if not exists 'waitlisted';
alter table public.roping_waitlist add column submission_id uuid references public.online_entry_submissions(id) on delete set null;
create index waitlist_submission_idx on public.roping_waitlist(submission_id);

create function public.waitlist_online_submission(target_submission uuid, expected_revision integer) returns integer
language plpgsql security definer set search_path='' as $$
declare s public.online_entry_submissions%rowtype; item public.online_entry_submission_ropings%rowtype;
  r public.event_ropings%rowtype; n integer; result integer:=0; selected_options uuid[];
begin
  select * into s from public.online_entry_submissions where id=target_submission for update;
  if s.id is null or not public.can_enter_event(s.event_id) then raise exception 'Entry office access is required'; end if;
  if s.status<>'pending' or s.revision<>expected_revision then raise exception 'This request changed. Refresh before trying again.'; end if;
  for item in select * from public.online_entry_submission_ropings where submission_id=s.id order by event_roping_id loop
    select * into r from public.event_ropings where id=item.event_roping_id for update;
    if r.event_day_status='completed' then raise exception 'A requested roping is complete'; end if;
    select coalesce(array_agg(event_fee_id),'{}') into selected_options from public.online_entry_submission_fee_options where submission_roping_id=item.id;
    for n in 1..item.quantity loop
      insert into public.roping_waitlist(producer_id,event_id,event_roping_id,roper_id,guest,option_ids,submission_id)
        values(s.producer_id,s.event_id,r.id,s.roper_id,case when s.roper_id is null then jsonb_build_object('firstName',s.first_name,'lastName',s.last_name,'email',s.email,'phone',s.phone,'birthDate',s.birth_date,'competitionGender',s.competition_gender) else null end,selected_options,s.id);
      result:=result+1;
    end loop;
  end loop;
  if result=0 then raise exception 'This request has no entries'; end if;
  update public.online_entry_submissions set status='waitlisted',revision=revision+1,reviewed_by=auth.uid(),reviewed_at=now(),producer_response='Your requested entries are waitlisted. No fees are due until a space is offered and you accept it. Contact the producer to withdraw or discuss an offer.' where id=s.id;
  return result;
end $$;

create function public.sync_waitlisted_submission() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.submission_id is null or new.status=old.status then return new; end if;
  perform 1 from public.online_entry_submissions where id=new.submission_id for update;
  if not exists(select 1 from public.roping_waitlist where submission_id=new.submission_id and status in ('waiting','offered')) then
    update public.online_entry_submissions set status=case when exists(select 1 from public.roping_waitlist where submission_id=new.submission_id and status='accepted') then 'accepted'::public.entry_request_status else 'declined'::public.entry_request_status end,
      revision=revision+1,producer_response=case when exists(select 1 from public.roping_waitlist where submission_id=new.submission_id and status='accepted') then 'Waitlist review is complete. Your confirmed entries and fees are listed separately; some requested spaces may have been declined or cancelled.' else 'Your waitlisted spaces were declined or cancelled. No entries or fees were created.' end
      where id=new.submission_id;
  end if;
  return new;
end $$;
create trigger sync_waitlisted_submission after update on public.roping_waitlist for each row execute function public.sync_waitlisted_submission();
revoke all on function public.waitlist_online_submission(uuid,integer),public.sync_waitlisted_submission() from public,anon;
grant execute on function public.waitlist_online_submission(uuid,integer) to authenticated;
