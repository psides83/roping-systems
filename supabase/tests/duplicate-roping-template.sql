begin;

do $$
declare
  source public.roping_templates%rowtype;
  copied public.roping_templates%rowtype;
  copied_id uuid;
  owner_id uuid;
  source_fees jsonb;
  copied_fees jsonb;
begin
  select template.* into source
  from public.roping_templates template
  where template.short_round_enabled and exists (
    select 1 from public.producer_staff staff
    where staff.producer_id = template.producer_id and staff.role = 'owner'
  )
  order by template.created_at limit 1;
  if source.id is null then raise exception 'A short-round template fixture is required'; end if;
  select user_id into owner_id from public.producer_staff
  where producer_id = source.producer_id and role = 'owner'
  order by created_at limit 1;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  copied_id := public.duplicate_division_template(
    target_organization_id => source.producer_id,
    source_template_id => source.id
  );
  select * into copied from public.roping_templates where id = copied_id;
  if copied.id is null or copied.name not like source.name || ' Copy%' then
    raise exception 'Template copy was not created correctly';
  end if;
  if (to_jsonb(source) - array['id', 'name', 'sort_order', 'created_at', 'updated_at', 'classification_id', 'four_d_settings'])
    is distinct from
    (to_jsonb(copied) - array['id', 'name', 'sort_order', 'created_at', 'updated_at', 'classification_id', 'four_d_settings']) then
    raise exception 'Duplicated template settings differ from the source';
  end if;
  select coalesce(jsonb_agg(settings order by settings::text), '[]'::jsonb) into source_fees
  from (select to_jsonb(fee) - array['id', 'roping_template_id', 'created_at', 'updated_at'] as settings
    from public.roping_template_fees fee where roping_template_id = source.id) fees;
  select coalesce(jsonb_agg(settings order by settings::text), '[]'::jsonb) into copied_fees
  from (select to_jsonb(fee) - array['id', 'roping_template_id', 'created_at', 'updated_at'] as settings
    from public.roping_template_fees fee where roping_template_id = copied.id) fees;
  if source_fees is distinct from copied_fees then
    raise exception 'Duplicated fees or payout schedule references differ';
  end if;
end;
$$;

rollback;
