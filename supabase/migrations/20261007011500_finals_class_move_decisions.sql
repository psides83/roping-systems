alter table public.membership_classification_history add column finals_position_decision text check(finals_position_decision in ('transfer','revoke'));

create function public.require_finals_position_move_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare previous public.membership_classification_history%rowtype; season record; source jsonb; choice jsonb; has_positions boolean:=false;
begin
  select * into previous from public.membership_classification_history where membership_id=new.membership_id and division_id=new.division_id and id<>new.id order by created_at desc,id desc limit 1;
  if previous.id is null or previous.classification_id=new.classification_id then return new; end if;
  for season in select s.id,p.slug from public.producer_seasons s join public.producers p on p.id=s.producer_id
    where s.producer_id=new.producer_id and new.effective_on between s.starts_on and s.ends_on loop
    if exists(select 1 from public.manual_finals_positions where membership_id=new.membership_id and season_id=season.id and class_key=previous.classification_id::text and not revoked and awarded_on<new.effective_on) then has_positions:=true; end if;
    source:=public.finals_qualification_source(season.slug,season.id);
    if exists(select 1 from jsonb_array_elements(source->'finishes') finish join jsonb_array_elements(source->'rules') rule
      on rule->>'ropingId'=finish->>'ropingId' and rule->>'stage'=finish->>'stage' and rule->'round'=finish->'round'
      where finish->>'memberId'=new.membership_id::text and finish->>'classId'=previous.classification_id::text and (finish->>'date')::date<new.effective_on
      and (rule->>'repeatPolicy'='pass_down' or exists(select 1 from jsonb_array_elements(rule->'places') place where (place->>'place')::integer=(finish->>'place')::integer))) then has_positions:=true; end if;
  end loop;
  choice:=nullif(current_setting('app.finals_move_decision',true),'')::jsonb;
  if choice is null then
    choice:=nullif(current_setting('app.finals_profile_move_decision',true),'')::jsonb;
    if choice->>'memberId'=new.membership_id::text then choice:=choice||jsonb_build_object('classificationId',new.classification_id); end if;
  end if;
  if choice->>'memberId'=new.membership_id::text and choice->>'classificationId'=new.classification_id::text and choice->>'decision' in ('transfer','revoke') then
    new.finals_position_decision:=choice->>'decision';
  end if;
  if has_positions and new.finals_position_decision is null then raise exception 'Choose whether earned finals positions transfer to the new class or are revoked before saving this class move'; end if;
  if has_positions and length(trim(coalesce(new.reason,'')))<5 then raise exception 'Explain the class move and finals-position decision in the reason'; end if;
  return new;
end;
$$;

alter table public.manual_finals_positions add constraint revoked_finals_position_reason_required check(not revoked or revoke_reason is not null);
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.validate_finals_qualification_record()'::regprocedure);
  definition:=replace(definition,'jsonb_typeof(place->''place'')<>''number''','jsonb_typeof(place->''place'') is distinct from ''number''');
  definition:=replace(definition,'jsonb_typeof(place->''positions'')<>''number''','jsonb_typeof(place->''positions'') is distinct from ''number''');
  execute definition;
end;
$$;
create trigger finals_position_move_decision before insert on public.membership_classification_history for each row execute function public.require_finals_position_move_decision();

create function public.set_member_classification_with_finals(target_organization_id uuid,target_membership_id uuid,target_classification_id uuid,new_effective_on date,change_reason text default null,source_review_id uuid default null,finals_decision text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.can_manage_organization(target_organization_id) or finals_decision is not null and finals_decision not in ('transfer','revoke') then raise exception 'Choose a valid staff finals-position decision'; end if;
  perform set_config('app.finals_move_decision',jsonb_build_object('memberId',target_membership_id,'classificationId',target_classification_id,'decision',finals_decision)::text,true);
  result:=public.set_member_classification(target_organization_id,target_membership_id,target_classification_id,new_effective_on,change_reason,source_review_id);
  perform set_config('app.finals_move_decision','',true);
  return result;
end;
$$;
revoke all on function public.set_member_classification_with_finals(uuid,uuid,uuid,date,text,uuid,text) from public,anon;
grant execute on function public.set_member_classification_with_finals(uuid,uuid,uuid,date,text,uuid,text) to authenticated;

-- Extend the current member-profile and watch workflows without duplicating their validation.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.update_organization_member_v2(uuid,uuid,text,text,text,text,date,public.competition_gender,text,public.membership_status,date,date,text,jsonb,date,text,jsonb)'::regprocedure);
  definition:=replace(definition,'public.update_organization_member_v2(','public.update_organization_member_with_finals(');
  definition:=replace(definition,'member_profile_fields jsonb)','member_profile_fields jsonb, finals_decision text DEFAULT NULL)');
  definition:=replace(definition,'begin',E'begin\n  if finals_decision is not null and finals_decision not in (''transfer'',''revoke'') then raise exception ''Choose a valid finals-position decision''; end if;\n  perform set_config(''app.finals_profile_move_decision'',jsonb_build_object(''memberId'',target_membership_id,''decision'',finals_decision)::text,true);');
  execute definition;
  definition:=pg_get_functiondef('public.approve_classification_watch(uuid,uuid,uuid,uuid,uuid,date,text,uuid[],uuid)'::regprocedure);
  definition:=replace(definition,'public.approve_classification_watch(','public.approve_classification_watch_with_finals(');
  definition:=replace(definition,'target_review_id uuid)','target_review_id uuid, finals_decision text DEFAULT NULL)');
  definition:=replace(definition,'begin',E'begin\n  if finals_decision is not null and finals_decision not in (''transfer'',''revoke'') then raise exception ''Choose a valid finals-position decision''; end if;\n  perform set_config(''app.finals_move_decision'',jsonb_build_object(''memberId'',target_membership_id,''classificationId'',target_classification_id,''decision'',finals_decision)::text,true);');
  execute definition;
end;
$$;
revoke all on function public.update_organization_member_with_finals(uuid,uuid,text,text,text,text,date,public.competition_gender,text,public.membership_status,date,date,text,jsonb,date,text,jsonb,text),public.approve_classification_watch_with_finals(uuid,uuid,uuid,uuid,uuid,date,text,uuid[],uuid,text) from public,anon;
grant execute on function public.update_organization_member_with_finals(uuid,uuid,text,text,text,text,date,public.competition_gender,text,public.membership_status,date,date,text,jsonb,date,text,jsonb,text),public.approve_classification_watch_with_finals(uuid,uuid,uuid,uuid,uuid,date,text,uuid[],uuid,text) to authenticated;

-- Include transfer/revocation decisions in every subsequent qualification rebuild.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.finals_qualification_source(text,uuid)'::regprocedure);
  definition:=replace(definition,'''profiles'',coalesce(',E'''moves'',coalesce((select jsonb_agg(jsonb_build_object(''id'',h.id,''producerId'',h.producer_id,''seasonId'',s.id,''memberId'',h.membership_id,''fromClassId'',old.classification_id,''toClassId'',case when c.standalone_enabled then c.id::text else c.division_id::text||'':handicap'' end,''date'',h.effective_on,''decision'',h.finals_position_decision,''reason'',''Staff classification decision'')) from public.membership_classification_history h join public.membership_classification_history old on old.id=h.previous_assignment_id join public.classifications c on c.id=h.classification_id join season s on s.producer_id=h.producer_id and h.effective_on between s.starts_on and s.ends_on where h.finals_position_decision is not null),''[]''::jsonb),\n ''profiles'',coalesce(');
  execute definition;
end;
$$;
