create or replace function public.validate_producer_penalty_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.producer_id <> old.producer_id then raise exception 'Cannot move a penalty to another producer'; end if;
  if exists(select 1 from unnest(new.classification_ids) as selected(classification_id) where not exists
    (select 1 from public.classifications c where c.id=selected.classification_id and c.producer_id=new.producer_id and c.division_id=new.division_id)) then
    raise exception 'Choose classifications from this penalty division';
  end if;
  return new;
end;
$$;
