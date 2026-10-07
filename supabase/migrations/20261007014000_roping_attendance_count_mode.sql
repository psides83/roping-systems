alter table public.roping_templates add column attendance_count_mode text not null default 'once_per_roping'
  check (attendance_count_mode in ('once_per_roping','per_entry'));
alter table public.event_ropings add column attendance_count_mode text not null default 'once_per_roping'
  check (attendance_count_mode in ('once_per_roping','per_entry'));

-- Extend the existing copy workflows without replacing their permission checks.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.duplicate_division_template(uuid,uuid)'::regprocedure);
  if position('source_template.cattle_draw_enabled' in definition)=0 then raise exception 'Unexpected template copy definition'; end if;
  definition:=replace(definition,E'    cattle_draw_enabled\n',E'    attendance_count_mode, cattle_draw_enabled\n');
  definition:=replace(definition,'source_template.cattle_draw_enabled','source_template.attendance_count_mode, source_template.cattle_draw_enabled');
  execute definition;

  definition:=pg_get_functiondef('public.add_roping_to_event(uuid,uuid,uuid,date,public.class_schedule_type,timestamp without time zone,text,text,integer,boolean)'::regprocedure);
  if position('template_record.cattle_draw_enabled,' in definition)=0 then raise exception 'Unexpected roping copy definition'; end if;
  definition:=replace(definition,'cattle_draw_enabled, timer_count','attendance_count_mode, cattle_draw_enabled, timer_count');
  definition:=replace(definition,'template_record.cattle_draw_enabled,','template_record.attendance_count_mode, template_record.cattle_draw_enabled,');
  execute definition;

  definition:=pg_get_functiondef('public.event_roping_template_snapshot(uuid,boolean)'::regprocedure);
  if position('''later_round_ordering'',''cattle_draw_enabled''' in definition)=0 then raise exception 'Unexpected template snapshot definition'; end if;
  definition:=replace(definition,'''later_round_ordering'',''cattle_draw_enabled''','''later_round_ordering'',''cattle_draw_enabled'',''attendance_count_mode''');
  execute definition;

  definition:=pg_get_functiondef('public.confirm_event_roping_template_update(uuid,uuid,uuid,text,boolean,boolean)'::regprocedure);
  if position('cattle_draw_enabled = t.cattle_draw_enabled,' in definition)=0 then raise exception 'Unexpected template update definition'; end if;
  definition:=replace(definition,'cattle_draw_enabled = t.cattle_draw_enabled,','cattle_draw_enabled = t.cattle_draw_enabled, attendance_count_mode = t.attendance_count_mode,');
  execute definition;

  definition:=pg_get_functiondef('public.public_season_standings_source(text,uuid)'::regprocedure);
  if position('r.standing_class, r.scheduled_date, r.division_id, r.competition_format,' in definition)=0
    or position('jsonb_agg(e.id) as entry_ids, e.event_id' in definition)=0 then raise exception 'Unexpected standings source definition'; end if;
  definition:=replace(definition,'r.standing_class, r.scheduled_date, r.division_id, r.competition_format,','r.standing_class, r.scheduled_date, r.division_id, r.competition_format, r.attendance_count_mode,');
  definition:=replace(definition,'jsonb_agg(e.id) as entry_ids, e.event_id','jsonb_agg(e.id) as entry_ids, e.event_id, case when bool_or(e.attendance_count_mode=''per_entry'') then count(*)::integer else 1 end as attendance_count');
  definition:=replace(definition,'''entryIds'',entry_ids,''eventId'',event_id','''entryIds'',entry_ids,''eventId'',event_id,''attendanceCount'',attendance_count');
  execute definition;
end;
$$;
