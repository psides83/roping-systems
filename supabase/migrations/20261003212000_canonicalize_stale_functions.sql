-- Rewrite stored procedures that still resolve through legacy compatibility
-- views so they use the canonical producer, roper, division, and event schema.
do $$
declare
  routine regprocedure;
  definition text;
begin
  foreach routine in array array[
    'public.producer_male_exception_applies(uuid,uuid,uuid,date)'::regprocedure,
    'public.event_male_exception_applies(uuid,uuid,uuid)'::regprocedure,
    'public.set_member_classification(uuid,uuid,uuid,date,text,uuid)'::regprocedure,
    'public.update_organization_member(uuid,uuid,text,text,text,text,date,public.competition_gender,text,public.membership_status,date,date,text,jsonb,date,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(routine) into definition;

    definition := replace(definition, 'public.organization_memberships', 'public.memberships');
    definition := replace(definition, 'public.member_classifications', 'public.membership_classification_history');
    definition := replace(definition, 'public.classification_reviews', 'public.membership_classification_reviews');
    definition := replace(definition, 'public.organizations', 'public.producers');
    definition := replace(definition, 'public.disciplines', 'public.divisions');
    definition := replace(definition, 'public.people', 'public.ropers');
    definition := replace(definition, 'public.audit_log', 'public.producer_audit_log');

    definition := regexp_replace(definition, '\morganization_id\M', 'producer_id', 'g');
    definition := regexp_replace(definition, '\mperson_id\M', 'roper_id', 'g');
    definition := regexp_replace(definition, '\mdiscipline_id\M', 'division_id', 'g');
    definition := replace(definition, 'male_classification_discipline_id', 'male_classification_division_id');
    definition := replace(definition, '''people''', '''ropers''');

    execute definition;
  end loop;
end;
$$;

do $$
declare
  routine regprocedure;
  definition text;
begin
  foreach routine in array array[
    'public.update_event_details(uuid,text,text,text,text,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,boolean,uuid,text,integer)'::regprocedure,
    'public.update_event_details(uuid,text,text,text,text,text,text,text,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,text,uuid,text,integer)'::regprocedure
  ]
  loop
    select pg_get_functiondef(routine) into definition;

    definition := replace(definition, 'public.roping_divisions', 'public.event_ropings');
    definition := replace(definition, 'public.roping_fees', 'public.event_fees');
    definition := replace(definition, 'public.ropings', 'public.events');
    definition := replace(definition, 'public.organizations', 'public.producers');
    definition := replace(definition, 'public.entries', 'public.roping_entries');

    definition := regexp_replace(definition, '\morganization_id\M', 'producer_id', 'g');
    definition := regexp_replace(definition, '\mroping_division_id\M', 'event_roping_id', 'g');
    definition := regexp_replace(definition, '\mroping_fee_id\M', 'event_fee_id', 'g');
    definition := regexp_replace(definition, '\mroping_id\M', 'event_id', 'g');
    definition := regexp_replace(definition, '\mperson_id\M', 'roper_id', 'g');
    definition := replace(definition, 'entry.roper_id, null,', 'entry.roper_id, null::uuid,');
    definition := replace(definition, 'entry.roper_id, NULL,', 'entry.roper_id, NULL::uuid,');

    execute definition;
  end loop;
end;
$$;
