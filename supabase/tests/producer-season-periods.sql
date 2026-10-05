begin;
do $$
declare staff public.producer_staff%rowtype;
begin
  select * into staff from public.producer_staff where role = 'owner' order by created_at limit 1;
  if staff.user_id is null then raise exception 'A producer owner fixture is required'; end if;
  perform set_config('request.jwt.claim.sub', staff.user_id::text, true);
  perform set_config('test.season_producer', staff.producer_id::text, true);
  perform set_config('test.season_owner', staff.user_id::text, true);
end;
$$;
set local role authenticated;
do $$
declare
  producer uuid := current_setting('test.season_producer')::uuid;
  season_id uuid;
  starts date;
  rejected boolean;
begin
  select coalesce(max(ends_on), current_date) + 3650 into starts
  from public.producer_seasons where producer_id = producer;
  insert into public.producer_seasons(producer_id, name, starts_on, ends_on)
  values(producer, 'Season period regression fixture', starts, starts + 100) returning id into season_id;
  if not exists (select 1 from public.producer_audit_log
    where entity_id = season_id and entity_type = 'producer_seasons' and actor_user_id = auth.uid()) then
    raise exception 'Season creation was not audited';
  end if;
  rejected := false;
  begin
    insert into public.producer_seasons(producer_id, name, starts_on, ends_on)
    values(producer, 'Overlap fixture', starts + 100, starts + 200);
  exception when raise_exception then
    if sqlerrm = 'Season dates overlap another season' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Overlapping seasons were accepted'; end if;
  rejected := false;
  begin
    insert into public.producer_seasons(producer_id, name, starts_on, ends_on)
    values(producer, 'Reversed fixture', starts + 300, starts + 200);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Reversed dates were accepted'; end if;
  update public.producer_seasons set ends_on = starts + 110 where id = season_id;
  insert into public.producer_seasons(producer_id, name, starts_on, ends_on)
  values(producer, 'Adjacent fixture', starts + 111, starts + 200);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  if exists (select 1 from public.producer_seasons where producer_id = producer) then
    raise exception 'An unrelated user can read the private season table';
  end if;
  rejected := false;
  begin
    insert into public.producer_seasons(producer_id, name, starts_on, ends_on)
    values(producer, 'Unauthorized fixture', starts + 400, starts + 500);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'An unrelated user can change producer seasons'; end if;
end;
$$;
set local role anon;
do $$
begin
  if not exists (select 1 from public.public_producer_seasons
    where producer_id = current_setting('test.season_producer')::uuid) then
    raise exception 'Public season filters cannot load their date periods';
  end if;
end;
$$;
rollback;
