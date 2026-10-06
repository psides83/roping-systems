-- Exercise real relationships without retaining any deletions or audit changes.
begin;
do $$
declare template_id uuid; before_ropings jsonb; after_ropings jsonb; before_fees jsonb; after_fees jsonb;
begin
  select t.id into template_id from public.roping_templates t
    where exists (select 1 from public.roping_template_fees f where f.roping_template_id=t.id)
      and exists (select 1 from public.event_ropings r where r.roping_template_id=t.id)
    limit 1;
  if template_id is null then raise exception 'A template with fees and an existing roping is required for this regression test'; end if;
  create temporary table deletion_test_ropings on commit drop as
    select id from public.event_ropings where roping_template_id=template_id;
  create temporary table deletion_test_fees on commit drop as
    select e.id from public.event_fees e join public.roping_template_fees f on f.id=e.roping_template_fee_id
    where f.roping_template_id=template_id;
  select jsonb_agg(to_jsonb(r)-array['roping_template_id','updated_at'] order by r.id) into before_ropings
    from public.event_ropings r join deletion_test_ropings d using(id);
  select jsonb_agg(to_jsonb(f)-array['roping_template_fee_id','updated_at'] order by f.id) into before_fees
    from public.event_fees f join deletion_test_fees d using(id);
  delete from public.roping_templates where id=template_id;
  if exists(select 1 from public.roping_template_fees where roping_template_id=template_id) then
    raise exception 'Template fees were not removed';
  end if;
  select jsonb_agg(to_jsonb(r)-array['roping_template_id','updated_at'] order by r.id) into after_ropings
    from public.event_ropings r join deletion_test_ropings d using(id);
  select jsonb_agg(to_jsonb(f)-array['roping_template_fee_id','updated_at'] order by f.id) into after_fees
    from public.event_fees f join deletion_test_fees d using(id);
  if before_ropings is distinct from after_ropings or before_fees is distinct from after_fees then
    raise exception 'Copied event data changed during template deletion';
  end if;
end $$;
rollback;
