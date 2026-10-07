create function public.can_manage_event(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target_event and
    (public.can_manage_organization(e.producer_id) or exists(
      select 1 from public.producer_staff s join public.staff_event_assignments a
        on a.producer_id=s.producer_id and a.user_id=s.user_id
      where s.producer_id=e.producer_id and s.user_id=auth.uid()
        and s.role='event_manager' and a.event_id=e.id)));
$$;
create function public.can_manage_event_roping(target_roping uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.event_ropings r where r.id=target_roping and public.can_manage_event(r.event_id));
$$;
create function public.can_manage_finances(target_producer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_manage_organization(target_producer) or exists(
    select 1 from public.producer_staff where producer_id=target_producer and user_id=auth.uid() and role='treasurer');
$$;
create function public.can_finance_event(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target_event and public.can_manage_finances(e.producer_id));
$$;
create function public.can_collect_event(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_manage_event(target_event) or public.can_finance_event(target_event) or public.can_enter_event(target_event);
$$;
create function public.can_adjust_event_finances(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_manage_event(target_event) or public.can_finance_event(target_event);
$$;
revoke all on function public.can_manage_event(uuid),public.can_manage_event_roping(uuid),public.can_manage_finances(uuid),public.can_finance_event(uuid),public.can_collect_event(uuid) from public,anon;
grant execute on function public.can_manage_event(uuid),public.can_manage_event_roping(uuid),public.can_manage_finances(uuid),public.can_finance_event(uuid),public.can_collect_event(uuid) to authenticated;
revoke all on function public.can_adjust_event_finances(uuid) from public,anon;
grant execute on function public.can_adjust_event_finances(uuid) to authenticated;

-- Only explicitly named workflows gain these permissions; broad producer access is unchanged.
do $$
declare rule record; fn record; original text; updated text;
begin
  for rule in select * from (values
    ('copy_event_day_schedule','public.can_manage_event(target_event_id)'),
    ('reorder_event_ropings','public.can_manage_event(target_event_id)'),
    ('confirm_event_roping_template_update','public.can_manage_event(target_event_id)'),
    ('update_event_details','public.can_manage_event(target_roping_id)'),
    ('set_event_arena_count','public.can_manage_event(target_roping_id)'),
    ('add_roping_to_event','public.can_manage_event(target_roping_id)'),
    ('save_event_cattle','public.can_manage_event(target_roping_id)'),
    ('set_roping_in_progress','public.can_manage_event(target_roping_id)'),
    ('finalize_roping_results','public.can_manage_event(target_roping_id)'),
    ('remove_roping_from_event','public.can_manage_event_roping(target_roping_division_id)'),
    ('set_division_entry_spacing','public.can_manage_event_roping(target_roping_division_id)'),
    ('set_division_round_ordering','public.can_manage_event_roping(target_roping_division_id)'),
    ('draw_round_cattle','public.can_manage_event_roping(target_roping_division_id)'),
    ('update_class_event_day_status','public.can_manage_event_roping(target_roping_division_id)'),
    ('save_roping_schedule','public.can_manage_event_roping(target_roping_division_id)'),
    ('save_class_schedule','public.can_manage_event_roping(target_roping_division_id)'),
    ('generate_division_draw','public.can_manage_event_roping(target_roping_division_id)'),
    ('set_division_draw_order','public.can_manage_event_roping(target_roping_division_id)'),
    ('seed_short_round','public.can_manage_event_roping(target_roping_division_id)'),
    ('manage_short_round_qualifier','public.can_manage_event_roping(target_roping_division_id)'),
    ('lock_short_round_field','public.can_manage_event_roping(target_roping_division_id)'),
    ('complete_roping_round','public.can_manage_event_roping(target_roping_division_id)'),
    ('save_roping_qualification_check','public.can_manage_event_roping(target_roping_id)'),
    ('create_event_entry_with_eligibility_override','public.can_manage_event_roping(target_roping_division_id)'),
    ('create_guest_event_entry','public.can_manage_event_roping(target_roping_division_id)'),
    ('create_guest_event_entry_v2_with_eligibility_override','public.can_manage_event_roping(target_roping_division_id)'),
    ('review_online_entry_request_with_eligibility_override','public.can_manage_event(request_record.event_id)'),
    ('transfer_event_entry','public.can_manage_event(entry_record.event_id)'),
    ('withdraw_event_entry','public.can_manage_event(entry_record.event_id)'),
    ('reinstate_event_entry','public.can_manage_event(entry_record.event_id)'),
    ('set_event_contestant_check_in','public.can_manage_event(event_record.id)'),
    ('set_contestant_event_payment_status','public.can_adjust_event_finances(target_roping_id)'),
    ('set_entry_charge_waiver','public.can_adjust_event_finances(charge_record.event_id)'),
    ('void_event_cash_payment','public.can_adjust_event_finances(payment_record.event_id)'),
    ('manage_producer_fund','public.can_manage_finances(target_producer_id)'),
    ('record_fund_transaction','public.can_manage_finances(fund.producer_id)'),
    ('save_roping_funding','public.can_finance_event(r.event_id)'),
    ('set_roping_sponsor_policy','public.can_finance_event(r.event_id)'),
    ('finalize_roping_payouts','public.can_finance_event(r.event_id)'),
    ('record_roper_payout','public.can_finance_event(target_event_id)'),
    ('update_payout_receipt','public.can_finance_event(receipt.event_id)'),
    ('initialize_roping_payout_plans','(public.can_manage_event(target_roping_id) or public.can_finance_event(target_roping_id))'),
    ('copy_payout_schedule_to_event','(exists(select 1 from public.event_ropings scoped where scoped.id=target_division_id and scoped.event_id=target_roping_id and scoped.producer_id=target_organization_id) and (public.can_manage_event(target_roping_id) or public.can_finance_event(target_roping_id)))')
  ) as rules(name,permission) loop
    for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=rule.name loop
      original := pg_get_functiondef(fn.oid);
      updated := regexp_replace(original,'public\.can_manage_organization\([^)]*\)',rule.permission,'g');
      -- Delegating overloads already call the guarded implementation.
      if updated<>original then execute updated; end if;
    end loop;
  end loop;
  original := pg_get_functiondef('public.can_time_event(uuid)'::regprocedure);
  execute replace(original,'public.can_manage_organization(e.producer_id)','public.can_manage_event(e.id)');
  original := pg_get_functiondef('public.can_enter_event(uuid)'::regprocedure);
  execute replace(original,'public.can_manage_organization(e.producer_id)','public.can_manage_event(e.id)');
  original := pg_get_functiondef('public.record_event_cash_payment(uuid,uuid,integer,text)'::regprocedure);
  execute replace(original,'public.can_enter_event(event_record.id)','public.can_collect_event(event_record.id)');
  original := pg_get_functiondef('public.enforce_entry_classification_eligibility()'::regprocedure);
  execute replace(original,'public.can_manage_organization(new.producer_id)','public.can_manage_event(new.event_id)');
  original := pg_get_functiondef('public.protect_producer_staff_roles()'::regprocedure);
  updated := replace(original,'''operator'',''viewer'',''timing_staff'',''entry_office''','''operator'',''viewer'',''timing_staff'',''entry_office'',''event_manager'',''treasurer''');
  if updated=original then raise exception 'Invitation role check not found'; end if;
  execute updated;
end;
$$;

create function public.set_event_publication(target_event uuid,target_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_manage_event(target_event) then raise exception 'Event management access is required'; end if;
  if target_state is null or target_state not in ('draft','published','unpublished') then raise exception 'Choose a publication state'; end if;
  update public.events set publication_state=target_state,is_public=target_state='published' where id=target_event;
end;
$$;
revoke all on function public.set_event_publication(uuid,text) from public,anon;
grant execute on function public.set_event_publication(uuid,text) to authenticated;
