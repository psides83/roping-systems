create table public.producer_feature_preferences (
  id uuid primary key references public.producers(id) on delete cascade,
  producer_id uuid not null unique references public.producers(id) on delete cascade,
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features)='object'),
  revision integer not null default 1,
  check (id=producer_id)
);
alter table public.producer_feature_preferences enable row level security;
create policy feature_staff_read on public.producer_feature_preferences for select to authenticated
using (exists(select 1 from public.producer_staff where producer_id=producer_feature_preferences.producer_id and user_id=auth.uid()));
revoke all on public.producer_feature_preferences from anon,authenticated;
grant select on public.producer_feature_preferences to authenticated;
create trigger producer_features_audit after insert or update or delete on public.producer_feature_preferences
for each row execute function public.write_audit_log();
create function public.save_producer_features(target_producer uuid, expected_revision integer, feature_values jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision integer;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Owner or administrator access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  select revision into current_revision from public.producer_feature_preferences where producer_id=target_producer;
  if expected_revision is null or expected_revision<>coalesce(current_revision,0) then raise exception 'Feature settings changed. Refresh before saving.'; end if;
  if feature_values is null or jsonb_typeof(feature_values)<>'object' then raise exception 'Invalid feature settings'; end if;
  if exists(select 1 from jsonb_each(feature_values) where key not in ('membership','dues','watch','standings','qualifications','finals','funds','sponsors','rules','news') or jsonb_typeof(value)<>'boolean') then raise exception 'Invalid feature settings'; end if;
  insert into public.producer_feature_preferences(id,producer_id,features) values(target_producer,target_producer,feature_values)
  on conflict(id) do update set features=excluded.features,revision=producer_feature_preferences.revision+1;
end $$;
revoke all on function public.save_producer_features(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_producer_features(uuid,integer,jsonb) to authenticated;
