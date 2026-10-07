create function public.can_enter_event(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target_event and
    (public.can_manage_organization(e.producer_id) or exists(
      select 1 from public.producer_staff s join public.staff_event_assignments a
        on a.producer_id=s.producer_id and a.user_id=s.user_id
      where s.producer_id=e.producer_id and s.user_id=auth.uid()
        and s.role='entry_office' and a.event_id=e.id)));
$$;
create function public.can_enter_roping(target_roping uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.event_ropings r where r.id=target_roping and public.can_enter_event(r.event_id));
$$;
revoke all on function public.can_enter_event(uuid),public.can_enter_roping(uuid) from public,anon;
grant execute on function public.can_enter_event(uuid),public.can_enter_roping(uuid) to authenticated;
do $$
declare fn record; original text; updated text;
begin
  for fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('create_event_entry_with_eligibility_override','add_entry_option','set_entry_options','record_event_cash_payment','set_event_contestant_check_in') loop
    original := pg_get_functiondef(fn.oid);
    if fn.proname='create_event_entry_with_eligibility_override' then
      updated := replace(original,'public.can_manage_organization(division_record.producer_id)','public.can_enter_roping(division_record.id)');
      updated := replace(updated,'if entered_override_reason is not null',
        'if not public.can_manage_organization(division_record.producer_id) and (entered_override_reason is not null or initial_payment_status <> ''unpaid'' or entry_origin <> ''office'') then raise exception ''Entry Office cannot approve exceptions or bypass the cash ledger''; end if; if entered_override_reason is not null');
    elsif fn.proname in ('add_entry_option','set_entry_options') then
      updated := replace(original,'public.can_manage_organization(entry_record.producer_id)','public.can_enter_event(entry_record.event_id)');
    else
      updated := replace(original,'public.can_manage_organization(event_record.producer_id)','public.can_enter_event(event_record.id)');
    end if;
    if updated=original then raise exception 'Entry authorization check not found in %',fn.proname; end if;
    execute updated;
  end loop;
  original := pg_get_functiondef('public.protect_producer_staff_roles()'::regprocedure);
  updated := replace(original,'''operator'',''viewer'',''timing_staff''','''operator'',''viewer'',''timing_staff'',''entry_office''');
  if updated=original then raise exception 'Invitation role check not found'; end if;
  execute updated;
end;
$$;
