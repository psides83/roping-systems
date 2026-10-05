begin;
-- An obsolete visibility flag must not hide a published event's awards.
update public.events set publication_state = 'published', is_public = false
where id = '85981f1d-f150-49b3-bdc9-40eca089cff5';
create temporary table expected_awards on commit drop as
select * from public.public_event_money_results('85981f1d-f150-49b3-bdc9-40eca089cff5');
do $$
begin
  if not exists(select 1 from expected_awards where pool_type = 'main')
    or not exists(select 1 from expected_awards where pool_type <> 'main')
    or not exists(select 1 from expected_awards where d_number is not null)
    or not exists(select 1 from expected_awards where section_type = 'short_round') then
    raise exception 'Missing main, side-pot, 4D, or short-round awards';
  end if;
end;
$$;
grant select on expected_awards to anon;
set local role anon;
do $$
begin
  if exists (
    (select * from public.public_event_money_results('85981f1d-f150-49b3-bdc9-40eca089cff5') except select * from expected_awards)
    union all
    (select * from expected_awards except select * from public.public_event_money_results('85981f1d-f150-49b3-bdc9-40eca089cff5'))
  ) then raise exception 'Anonymous payout results differ'; end if;
  if exists(select 1 from public.public_event_money_results('85981f1d-f150-49b3-bdc9-40eca089cff5') where payout_cents <= 0) then
    raise exception 'Unpaid placings leaked into money results';
  end if;
end;
$$;
reset role;
update public.events set publication_state = 'unpublished', is_public = true
where id = '85981f1d-f150-49b3-bdc9-40eca089cff5';
set local role anon;
do $$
begin
  if exists(select 1 from public.public_event_money_results('85981f1d-f150-49b3-bdc9-40eca089cff5')) then
    raise exception 'Private event payouts are exposed';
  end if;
end;
$$;
reset role;
rollback;
