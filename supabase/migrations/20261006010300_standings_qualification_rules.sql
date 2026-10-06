create table public.standings_qualification_rules (
  producer_id uuid not null references public.producers(id) on delete cascade,
  season_id uuid not null references public.producer_seasons(id) on delete cascade,
  class_key text not null,
  top_places integer check(top_places between 1 and 10000),
  minimum_ropings integer not null default 0 check(minimum_ropings between 0 and 10000),
  cutoff_on date,
  updated_at timestamptz not null default now(),
  primary key (season_id,class_key)
);
alter table public.standings_qualification_rules enable row level security;
grant select,insert,update,delete on public.standings_qualification_rules to authenticated;
create policy "Staff read qualification rules" on public.standings_qualification_rules for select to authenticated
using(public.has_organization_access(producer_id));
create policy "Administrators manage qualification rules" on public.standings_qualification_rules for all to authenticated
using(exists(select 1 from public.producer_staff s where s.producer_id=standings_qualification_rules.producer_id and s.user_id=auth.uid() and s.role in ('owner','admin')))
with check(exists(select 1 from public.producer_staff s where s.producer_id=standings_qualification_rules.producer_id and s.user_id=auth.uid() and s.role in ('owner','admin')));
create function public.validate_standings_qualification_rule() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.producer_seasons s where s.id=new.season_id and s.producer_id=new.producer_id
    and (new.cutoff_on is null or new.cutoff_on between s.starts_on and s.ends_on)) then
    raise exception 'Choose a producer season and a cutoff within that season';
  end if;
  if not exists(select 1 from public.classifications c where c.producer_id=new.producer_id and c.id::text=new.class_key)
    and not exists(select 1 from public.divisions d where d.producer_id=new.producer_id
      and new.class_key in (d.id::text||':handicap',d.id::text||':four_d')) then
    raise exception 'Choose a class belonging to this producer';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger validate_standings_qualification_rule before insert or update on public.standings_qualification_rules
for each row execute function public.validate_standings_qualification_rule();
create trigger audit_standings_qualification_rules after insert or update or delete on public.standings_qualification_rules
for each row execute function public.write_audit_log();
create function public.public_standings_qualification_rules(target_producer_slug text,target_season_id uuid)
returns table(class_key text,top_places integer,minimum_ropings integer,cutoff_on date)
language sql stable security definer set search_path='' as $$
  select r.class_key,r.top_places,r.minimum_ropings,r.cutoff_on
  from public.standings_qualification_rules r join public.producers p on p.id=r.producer_id
  where p.slug=target_producer_slug and r.season_id=target_season_id;
$$;
revoke all on function public.public_standings_qualification_rules(text,uuid) from public;
grant execute on function public.public_standings_qualification_rules(text,uuid) to anon,authenticated;
