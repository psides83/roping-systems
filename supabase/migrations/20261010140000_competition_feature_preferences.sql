create or replace function public.save_producer_features(target_producer uuid, expected_revision integer, feature_values jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision integer;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Owner or administrator access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  select revision into current_revision from public.producer_feature_preferences where producer_id=target_producer;
  if expected_revision is null or expected_revision<>coalesce(current_revision,0) then raise exception 'Feature settings changed. Refresh before saving.'; end if;
  if feature_values is null or jsonb_typeof(feature_values)<>'object' then raise exception 'Invalid feature settings'; end if;
  if exists(select 1 from jsonb_each(feature_values) where key not in ('membership','online_entries','portal','dues','fines','suspensions','watch','standings','qualifications','finals','handicap','four_d','short_rounds','side_pots','insurance','cattle_draw','funds','profitability','sponsors','rules','news') or jsonb_typeof(value)<>'boolean') then raise exception 'Invalid feature settings'; end if;
  insert into public.producer_feature_preferences(id,producer_id,features) values(target_producer,target_producer,feature_values)
  on conflict(id) do update set features=excluded.features,revision=producer_feature_preferences.revision+1;
end $$;

create or replace function public.public_producer_features(producer_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_object_agg(item.key,item.value)
    from public.producers p
    join public.producer_feature_preferences preferences on preferences.producer_id=p.id
    cross join lateral jsonb_each(preferences.features) item
    where p.slug=producer_slug and item.key in ('membership','online_entries','portal','standings','sponsors','rules','news')), '{}'::jsonb)
$$;

-- Stop new requests at the database boundary, including direct RPC calls.
-- Existing request revisions, withdrawals and staff reviews remain available.
create function public.check_online_entry_feature() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.producers where id=new.producer_id for share;
  if exists(select 1 from public.producer_feature_preferences where producer_id=new.producer_id and features->>'online_entries'='false') then
    raise exception 'This producer is not accepting new online entry requests. Contact the producer to enter.';
  end if;
  return new;
end $$;
revoke all on function public.check_online_entry_feature() from public,anon,authenticated;
create trigger online_entry_feature_guard before insert on public.online_entry_submissions
for each row execute function public.check_online_entry_feature();
