-- The canonical engine needs every competitor for pass-down and repeat limits.
-- Keep its complete source internal and anonymize other identities at the boundary.
do $$
declare definition text; original text;
begin
  select pg_get_functiondef('public.finals_qualification_source(text,uuid)'::regprocedure) into original;
  definition:=replace(original,'public.finals_qualification_source(', 'public.portal_finals_source_internal(');
  definition:=replace(definition,'(public.has_organization_access(q.producer_id) or (e.is_public and e.publication_state=''published''))','true');
  if position('public.has_organization_access(q.producer_id)' in definition)>0 then raise exception 'Portal source visibility replacement failed'; end if;
  execute definition;
end;
$$;
revoke all on function public.portal_finals_source_internal(text,uuid) from public,anon,authenticated;

create function public.anonymize_portal_finals_source(source jsonb, target_member uuid)
returns jsonb language plpgsql volatile set search_path='' as $$
declare members jsonb; entries jsonb; result jsonb; decisions jsonb;
begin
  select coalesce(jsonb_object_agg(id,case when id=target_member::text then id else gen_random_uuid()::text end),'{}'::jsonb) into members
  from (select distinct id from (
    select x->>'memberId' id from jsonb_array_elements(source->'finishes') x
    union select x->>'memberId' from jsonb_array_elements(source->'manual') x
    union select x->>'memberId' from jsonb_array_elements(coalesce(source->'moves','[]'::jsonb)) x
    union select c->>1 from jsonb_array_elements(coalesce(source->'decisions','[]'::jsonb)) d cross join lateral jsonb_array_elements(d->'context') c
  ) ids where id is not null) ids;
  select coalesce(jsonb_object_agg(id,case when owned then id else gen_random_uuid()::text end),'{}'::jsonb) into entries
  from (select id,bool_or(owned) owned from (
    select x->>'entryId' id,x->>'memberId'=target_member::text owned from jsonb_array_elements(source->'finishes') x
    union all select c->>0,c->>1=target_member::text from jsonb_array_elements(coalesce(source->'decisions','[]'::jsonb)) d cross join lateral jsonb_array_elements(d->'context') c
    union all select x#>>'{}',false from jsonb_array_elements(coalesce(source->'decisions','[]'::jsonb)) d cross join lateral jsonb_array_elements(d->'entryIds') x
  ) ids where id is not null group by id) ids;
  select coalesce(jsonb_agg(d || jsonb_build_object(
    'entryIds',(select jsonb_agg(entries->>(x#>>'{}') order by n) from jsonb_array_elements(d->'entryIds') with ordinality a(x,n)),
    'context',(select jsonb_agg(jsonb_build_array(entries->>(x->>0),members->>(x->>1),x->2) order by entries->>(x->>0)) from jsonb_array_elements(d->'context') with ordinality a(x,n))
  ) order by n),'[]'::jsonb) into decisions from jsonb_array_elements(coalesce(source->'decisions','[]'::jsonb)) with ordinality a(d,n);
  result:=jsonb_build_object('rules',source->'rules','profiles','[]'::jsonb,'decisions',decisions);
  result:=result || jsonb_build_object(
    'finishes',(select coalesce(jsonb_agg(x || jsonb_build_object('memberId',members->>(x->>'memberId'),'entryId',entries->>(x->>'entryId')) order by n),'[]'::jsonb) from jsonb_array_elements(source->'finishes') with ordinality a(x,n)),
    'manual',(select coalesce(jsonb_agg(x || jsonb_build_object('memberId',members->>(x->>'memberId')) order by n),'[]'::jsonb) from jsonb_array_elements(source->'manual') with ordinality a(x,n)),
    'moves',(select coalesce(jsonb_agg(x || jsonb_build_object('memberId',members->>(x->>'memberId')) order by n),'[]'::jsonb) from jsonb_array_elements(coalesce(source->'moves','[]'::jsonb)) with ordinality a(x,n))
  );
  return result;
end;
$$;
revoke all on function public.anonymize_portal_finals_source(jsonb,uuid) from public,anon,authenticated;

create function public.my_roper_bonus_positions(target_membership_id uuid, target_season_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships%rowtype; producer public.producers%rowtype; season public.producer_seasons%rowtype; source jsonb;
begin
  select m.* into member from public.memberships m join public.ropers r on r.id=m.roper_id where m.id=target_membership_id and r.auth_user_id=auth.uid();
  if member.id is null then raise exception 'This membership is not linked to your account'; end if;
  select * into producer from public.producers where id=member.producer_id;
  select * into season from public.producer_seasons where producer_id=member.producer_id and (target_season_id is null or id=target_season_id)
    order by ((now() at time zone producer.timezone)::date between starts_on and ends_on) desc,starts_on desc,id limit 1;
  if target_season_id is not null and season.id is null then raise exception 'Choose a season belonging to this producer'; end if;
  if season.id is not null then source:=public.portal_finals_source_internal(producer.slug,season.id); end if;
  return jsonb_build_object('memberId',member.id,'producerId',producer.id,'today',(now() at time zone producer.timezone)::date,
    'season',case when season.id is not null then jsonb_build_object('id',season.id,'name',season.name,'startsOn',season.starts_on,'endsOn',season.ends_on) else null end,
    'seasons',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.starts_on desc,s.id),'[]'::jsonb) from public.producer_seasons s where s.producer_id=producer.id),
    'source',case when source is not null then public.anonymize_portal_finals_source(source,member.id) else null end,
    'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'award_key',a.award_key,'position_number',a.position_number,'event_roping_id',a.event_roping_id,'assigned_class_key',a.assigned_class_key,'assigned_at',a.assigned_at,'reason','')),'[]'::jsonb)
      from public.finals_position_assignments a where a.producer_id=producer.id and a.season_id=season.id and a.membership_id=member.id),
    'classes',(select coalesce(jsonb_object_agg(k,name),'{}'::jsonb) from (
      select c.id::text k, c.name||' '||d.name name from public.classifications c join public.divisions d on d.id=c.division_id where c.producer_id=producer.id
      union all select d.id::text||':handicap','Handicap '||d.name from public.divisions d where d.producer_id=producer.id
      union all select d.id::text||':four_d','4-D '||d.name from public.divisions d where d.producer_id=producer.id) labels),
    'ropings',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'eventTitle',e.title,'date',r.scheduled_date,'eventSlug',e.slug,'public',e.is_public and e.publication_state='published')),'[]'::jsonb)
      from public.event_ropings r join public.events e on e.id=r.event_id where r.producer_id=producer.id and (
        r.id in (select a.event_roping_id from public.finals_position_assignments a where a.membership_id=member.id and a.producer_id=producer.id and a.season_id=season.id)
        or r.id::text in (select x->>'ropingId' from jsonb_array_elements(coalesce(source->'finishes','[]'::jsonb)) x where x->>'memberId'=member.id::text)))
  );
end;
$$;
revoke all on function public.my_roper_bonus_positions(uuid,uuid) from public,anon;
grant execute on function public.my_roper_bonus_positions(uuid,uuid) to authenticated;
