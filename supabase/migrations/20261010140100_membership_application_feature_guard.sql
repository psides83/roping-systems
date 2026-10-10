create function public.check_membership_application_feature() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.producers where id=new.producer_id for share;
  if exists(select 1 from public.producer_feature_preferences where producer_id=new.producer_id and features->>'membership'='false') then
    raise exception 'Online membership applications are not available. Contact the producer to apply or renew.';
  end if;
  return new;
end $$;
revoke all on function public.check_membership_application_feature() from public,anon,authenticated;
create trigger membership_application_feature_guard before insert on public.membership_applications
for each row execute function public.check_membership_application_feature();
