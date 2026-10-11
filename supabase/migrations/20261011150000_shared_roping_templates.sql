alter table public.roping_templates add column available_division_ids uuid[] not null default '{}';
update public.roping_templates set available_division_ids=array[division_id];

create function public.validate_shared_template_divisions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if cardinality(new.available_division_ids)=0 then new.available_division_ids:=array[new.division_id]; end if;
  if new.division_id is null or not new.division_id=any(new.available_division_ids)
    or exists(select 1 from unnest(new.available_division_ids) selected(id) where selected.id is null or not exists(
      select 1 from public.divisions d where d.id=selected.id and d.producer_id=new.producer_id))
    or cardinality(new.available_division_ids)<>(select count(distinct id) from unnest(new.available_division_ids) id) then
    raise exception 'Choose at least one distinct division belonging to this producer';
  end if;
  if new.competition_format='handicap' and exists(select 1 from unnest(new.available_division_ids) d where not exists(
    select 1 from jsonb_array_elements(new.handicap_rules) rule join public.classifications c on c.id=(rule->>'classificationId')::uuid
    where c.producer_id=new.producer_id and c.division_id=d and c.is_active and c.handicap_adjustment_seconds is not null)) then
    raise exception 'Select at least one handicap classification for each available division';
  end if;
  return new;
end $$;
revoke all on function public.validate_shared_template_divisions() from public,anon,authenticated;
create trigger validate_shared_divisions before insert or update on public.roping_templates
for each row execute function public.validate_shared_template_divisions();

create or replace function public.apply_division_classification_settings() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.roping_templates%rowtype; selected_division uuid;
begin
  if new.roping_template_id is null then return new; end if;
  select * into t from public.roping_templates where id=new.roping_template_id and producer_id=new.producer_id;
  if t.id is null then raise exception 'Template not available in this producer'; end if;
  if new.classification_id is not null then
    select division_id into selected_division from public.classifications where id=new.classification_id
      and producer_id=new.producer_id and is_active;
  else selected_division:=new.division_id; end if;
  if selected_division is null or not selected_division=any(t.available_division_ids) then
    raise exception 'Choose a division available in this template';
  end if;
  new.division_id:=selected_division;
  if new.competition_format<>'handicap' and new.classification_id is null then
    raise exception 'Choose an active classification for this scheduled roping';
  end if;
  return new;
end $$;

do $$ declare original text; updated text; fn record; begin
  original:=pg_get_functiondef('public.add_roping_to_event(uuid,uuid,uuid,date,public.class_schedule_type,timestamp without time zone,text,text,integer,boolean)'::regprocedure);
  updated:=replace(original,'  if template_record.competition_format = ''handicap'' then',
    '  if target_classification_id is not null then
    select division_id into template_record.division_id from public.classifications
      where id=target_classification_id and producer_id=event_record.producer_id and is_active
        and division_id=any(template_record.available_division_ids);
    if template_record.division_id is null then raise exception ''Choose a classification from an available template division''; end if;
  end if;
  if template_record.competition_format = ''handicap'' then');
  -- The inserted selection block occurs twice; both resolve to the same division.
  updated:=replace(updated,'select * from jsonb_array_elements(template_record.handicap_rules)',
    'select rule from jsonb_array_elements(template_record.handicap_rules) rule
      join public.classifications c on c.id=(rule->>''classificationId'')::uuid
      where c.division_id=template_record.division_id');
  if updated=original then raise exception 'Add-roping template selection changed'; end if;
  execute updated;

  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_roping_with_schedule' loop
    original:=pg_get_functiondef(fn.oid);
    updated:=replace(original,'and division_id = template_record.division_id','and division_id = any(template_record.available_division_ids)');
    updated:=replace(updated,'    insert into public.event_ropings (','    template_record.division_id := classification_record.division_id;
    insert into public.event_ropings (');
    -- Incentive classifications must stay in the actual scheduled division.
    updated:=replace(updated,'and division_id = any(template_record.available_division_ids)
            and is_active','and division_id = classification_record.division_id
            and is_active');
    if updated=original then raise exception 'Event template creation changed'; end if;
    execute updated;
  end loop;

  original:=pg_get_functiondef('public.duplicate_division_template(uuid,uuid)'::regprocedure);
  updated:=replace(original,'  return duplicated_template_id;',
    '  update public.roping_templates set available_division_ids=source_template.available_division_ids where id=duplicated_template_id;
  return duplicated_template_id;');
  if updated=original then raise exception 'Template duplication changed'; end if;
  execute updated;

  original:=pg_get_functiondef('public.event_roping_template_snapshot(uuid,boolean)'::regprocedure);
  updated:=replace(original,'  if from_template then','  if from_template then
    format_json:=jsonb_set(format_json,''{division_id}'',to_jsonb(r.division_id));');
  updated:=replace(updated,'c.division_id = t.division_id','c.division_id = r.division_id');
  execute updated;
  original:=pg_get_functiondef('public.confirm_event_roping_template_update(uuid,uuid,uuid,text,boolean,boolean)'::regprocedure);
  updated:=replace(original,'if t.division_id is distinct from r.division_id then','if not r.division_id=any(t.available_division_ids) then');
  if updated=original then raise exception 'Template refresh division guard changed'; end if;
  execute updated;
end $$;
