create or replace function public.save_producer_features(target_producer uuid, expected_revision integer, feature_values jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision integer;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Owner or administrator access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  select revision into current_revision from public.producer_feature_preferences where producer_id=target_producer;
  if expected_revision is null or expected_revision<>coalesce(current_revision,0) then raise exception 'Feature settings changed. Refresh before saving.'; end if;
  if feature_values is null or jsonb_typeof(feature_values)<>'object' then raise exception 'Invalid feature settings'; end if;
  if exists(select 1 from jsonb_each(feature_values) where key not in ('membership','dues','fines','suspensions','watch','standings','qualifications','finals','funds','profitability','sponsors','rules','news') or jsonb_typeof(value)<>'boolean') then raise exception 'Invalid feature settings'; end if;
  insert into public.producer_feature_preferences(id,producer_id,features) values(target_producer,target_producer,feature_values)
  on conflict(id) do update set features=excluded.features,revision=producer_feature_preferences.revision+1;
end $$;

-- Public pages receive only their own visibility preferences, not staff settings.
create function public.public_producer_features(producer_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_object_agg(item.key,item.value)
    from public.producers p
    join public.producer_feature_preferences preferences on preferences.producer_id=p.id
    cross join lateral jsonb_each(preferences.features) item
    where p.slug=producer_slug and item.key in ('membership','standings','sponsors','rules','news')), '{}'::jsonb)
$$;
revoke all on function public.public_producer_features(text) from public;
grant execute on function public.public_producer_features(text) to anon,authenticated;
