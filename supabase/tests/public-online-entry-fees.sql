begin;

do $$
declare
  sample record;
  actual_count integer;
  expected_count integer;
begin
  if not has_function_privilege('anon', 'public.public_online_entry_fees(text,text)', 'EXECUTE') then
    raise exception 'Anonymous visitors must be able to read public fee definitions';
  end if;
  for sample in
    select e.id, p.slug as producer_slug, e.slug as event_slug
    from public.events e join public.producers p on p.id = e.producer_id
    where e.publication_state = 'published'
  loop
    select count(*) into expected_count
    from public.event_ropings r join public.event_fees f
      on f.event_id = r.event_id and f.producer_id = r.producer_id
      and (f.event_roping_id = r.id or f.event_roping_id is null)
    where r.event_id = sample.id;
    select count(*) into actual_count
    from public.public_online_entry_fees(sample.producer_slug, sample.event_slug);
    if actual_count <> expected_count then raise exception 'Public fee definitions do not match event fees'; end if;
  end loop;
  if exists (
    select 1 from public.events e join public.producers p on p.id = e.producer_id
    cross join lateral public.public_online_entry_fees(p.slug, e.slug) f
    where e.publication_state <> 'published'
  ) then raise exception 'Unpublished fees must remain private'; end if;
  if exists (select 1 from public.public_online_entry_fees('nonexistent-producer', 'nonexistent-event')) then
    raise exception 'Unknown events must not expose fees';
  end if;
end;
$$;

rollback;
