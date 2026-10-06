alter table public.membership_classification_history add column standings_cap_carryover boolean not null default false;
create function public.snapshot_standings_move_policy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.standings_cap_carryover into new.standings_cap_carryover
  from public.producers p where p.id=new.producer_id;
  return new;
end;
$$;
revoke all on function public.snapshot_standings_move_policy() from public;
create trigger snapshot_standings_move_policy before insert on public.membership_classification_history
for each row execute function public.snapshot_standings_move_policy();
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.public_season_standings_source(text,uuid)'::regprocedure);
  definition := replace(definition,'p.standings_cap_carryover,','h.standings_cap_carryover,');
  execute definition;
end;
$$;
