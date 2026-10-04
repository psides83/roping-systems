-- Some supporting tables still use their pre-domain-cleanup column names.
-- Keep canonical tables in the procedures while addressing those columns
-- explicitly until their own physical rename migration is completed.
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.set_member_classification(uuid,uuid,uuid,date,text,uuid)'::regprocedure
  ) into definition;
  definition := replace(definition, 'select division_id into target_discipline_id', 'select discipline_id into target_discipline_id');
  definition := replace(definition, 'and producer_id = target_organization_id', 'and organization_id = target_organization_id');
  execute definition;

  select pg_get_functiondef(
    'public.update_organization_member(uuid,uuid,text,text,text,text,date,public.competition_gender,text,public.membership_status,date,date,text,jsonb,date,text)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'and producer_id = target_organization_id' || chr(10) || '        and division_id = target_discipline_id' || chr(10) || '        and eligibility_type',
    'and organization_id = target_organization_id' || chr(10) || '        and discipline_id = target_discipline_id' || chr(10) || '        and eligibility_type'
  );
  execute definition;

  select pg_get_functiondef(
    'public.event_male_exception_applies(uuid,uuid,uuid)'::regprocedure
  ) into definition;
  definition := replace(definition, 'division_record.male_classification_division_id', 'division_record.male_classification_discipline_id');
  execute definition;

  select pg_get_functiondef(
    'public.update_event_details(uuid,text,text,text,text,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,boolean,uuid,text,integer)'::regprocedure
  ) into definition;
  definition := replace(definition, 'public.entry_charges where event_fee_id', 'public.entry_charges where roping_fee_id');
  definition := replace(
    definition,
    'producer_id, event_id, roper_id, entry_id, event_fee_id,',
    'organization_id, roping_id, person_id, entry_id, roping_fee_id,'
  );
  execute definition;
end;
$$;
