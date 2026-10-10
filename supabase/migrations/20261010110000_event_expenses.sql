create table public.event_expenses (
  id uuid primary key,
  producer_id uuid not null references public.producers(id),
  event_id uuid not null,
  event_roping_id uuid,
  category text not null check (category in ('arena','cattle','labor','awards','other')),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  note text not null default '' check (length(note)<=500),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  foreign key (event_id,producer_id) references public.events(id,producer_id) on delete cascade,
  foreign key (event_roping_id,producer_id) references public.event_ropings(id,producer_id)
);
create index event_expenses_event_idx on public.event_expenses(event_id,created_at,id);
alter table public.event_expenses enable row level security;
create policy expense_financial_read on public.event_expenses for select to authenticated using (public.can_finance_event(event_id));
revoke all on public.event_expenses from anon,authenticated;
grant select on public.event_expenses to authenticated;
create trigger event_expenses_audit after insert or update or delete on public.event_expenses for each row execute function public.write_audit_log();

create function public.save_event_expense(target_event uuid,target_id uuid,expected_revision integer,target_roping uuid,
  expense_category text,expense_amount bigint,expense_note text,void_expense boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare producer uuid; prior public.event_expenses%rowtype;
begin
  select producer_id into producer from public.events where id=target_event for update;
  if producer is null or not public.can_adjust_event_finances(target_event) then raise exception 'Financial access is required'; end if;
  if target_id is null then raise exception 'Expense identifier is required'; end if;
  select * into prior from public.event_expenses where id=target_id for update;
  if prior.id is not null and (prior.event_id<>target_event or prior.producer_id<>producer or prior.revision<>expected_revision) then raise exception 'This expense changed. Refresh before trying again.'; end if;
  if prior.id is null and (expected_revision<>0 or void_expense) then raise exception 'This expense is unavailable'; end if;
  if prior.voided_at is not null then raise exception 'This expense was removed'; end if;
  if target_roping is not null and not exists(select 1 from public.event_ropings where id=target_roping and event_id=target_event and producer_id=producer) then raise exception 'Choose a roping from this event'; end if;
  if void_expense then
    update public.event_expenses set voided_at=now(),revision=revision+1 where id=target_id;
  else
    insert into public.event_expenses(id,producer_id,event_id,event_roping_id,category,amount_cents,note)
      values(target_id,producer,target_event,target_roping,expense_category,expense_amount,trim(coalesce(expense_note,'')))
      on conflict(id) do update set event_roping_id=excluded.event_roping_id,category=excluded.category,amount_cents=excluded.amount_cents,note=excluded.note,revision=event_expenses.revision+1;
  end if;
  return target_id;
end $$;
revoke all on function public.save_event_expense(uuid,uuid,integer,uuid,text,bigint,text,boolean) from public,anon;
grant execute on function public.save_event_expense(uuid,uuid,integer,uuid,text,bigint,text,boolean) to authenticated;
