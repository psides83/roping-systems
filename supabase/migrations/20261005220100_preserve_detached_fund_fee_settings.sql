create or replace function public.copy_added_money_fee_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Deleting a source fee detaches the event copy without changing its fund routing.
  if tg_op = 'UPDATE' and old.roping_template_fee_id is not null
    and new.roping_template_fee_id is null then
    return new;
  end if;
  if new.kind = 'added_money' then
    select fund_tracking,destination_fund_id into new.fund_tracking,new.destination_fund_id
      from public.roping_template_fees
      where id = new.roping_template_fee_id and producer_id = new.producer_id;
    if new.fund_tracking is null then
      raise exception 'Choose added-money fund tracking on the source template fee';
    end if;
  else
    new.fund_tracking := null;
    new.destination_fund_id := null;
  end if;
  return new;
end;
$$;
