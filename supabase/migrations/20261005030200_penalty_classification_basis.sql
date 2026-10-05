alter table public.producer_penalty_rules add column classification_basis text not null default 'roping'
check (classification_basis in ('roping','member'));

-- Standalone ropings use their entered class; combined handicap ropings use the member class.
do $$
declare definition text;
  class_expression text := '(case when p.classification_basis=''member'' then member_class else coalesce(r.roping_classification_id,member_class) end)';
begin
  definition := pg_get_functiondef('public.applicable_run_penalties(uuid)'::regprocedure);
  if strpos(definition,'roping.scheduled_date,entry.membership_id')=0
    or strpos(definition,'member_class=any(p.classification_ids)')=0 then
    raise exception 'Unexpected penalty eligibility function definition';
  end if;
  definition := replace(definition,'roping.scheduled_date,entry.membership_id',
    'roping.classification_id as roping_classification_id,roping.scheduled_date,entry.membership_id');
  definition := replace(definition,'member_class is not null',class_expression || ' is not null');
  definition := replace(definition,'member_class=any(p.classification_ids)',class_expression || '=any(p.classification_ids)');
  execute definition;
end;
$$;
