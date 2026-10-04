begin;
select set_config('request.jwt.claim.sub', (
  select user_id::text from public.producer_staff
  where producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d' and role = 'owner'
  order by created_at limit 1
), true);
update public.competition_runs set status = 'rerun' where id = (
  select run.id from public.competition_runs run
  join public.event_ropings roping on roping.id = run.event_roping_id
  where roping.event_id = '85981f1d-f150-49b3-bdc9-40eca089cff5'
    and run.status = 'complete' order by run.id limit 1
);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.finalize_roping_results('85981f1d-f150-49b3-bdc9-40eca089cff5');
  exception when others then
    if sqlerrm like 'Resolve every scheduled run%' then rejected := true;
    else raise; end if;
  end;
  if not rejected then raise exception 'An unresolved rerun was allowed to become official'; end if;
end;
$$;
rollback;
