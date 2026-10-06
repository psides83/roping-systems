do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.public_season_standings_source(text,uuid)'::regprocedure);
  if position('coalesce(sum(a.payout_cents),0)::bigint as cents' in definition)=0
    or position('from entrants e left join awards a on a.entry_id=e.id and a.event_roping_id=e.event_roping_id' in definition)=0
    or position('group by e.roper_id,e.standing_class,e.event_roping_id,e.scheduled_date' in definition)=0
    or position('''official'',true,''winningsCents'',cents' in definition)=0 then
    raise exception 'Unexpected standings source definition; migration not applied';
  end if;
  definition := replace(definition,
    'coalesce(sum(a.payout_cents),0)::bigint as cents',
    '0::bigint as cents, jsonb_agg(e.id) as entry_ids, e.event_id');
  definition := replace(definition,
    'from entrants e left join awards a on a.entry_id=e.id and a.event_roping_id=e.event_roping_id',
    'from entrants e');
  definition := replace(definition,
    'group by e.roper_id,e.standing_class,e.event_roping_id,e.scheduled_date',
    'group by e.roper_id,e.standing_class,e.event_roping_id,e.scheduled_date,e.event_id');
  definition := replace(definition,
    '''official'',true,''winningsCents'',cents',
    '''official'',true,''winningsCents'',cents,''entryIds'',entry_ids,''eventId'',event_id');
  execute definition;
end;
$$;
