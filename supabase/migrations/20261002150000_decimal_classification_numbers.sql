alter table public.classifications
  alter column rank type numeric(6, 2)
  using rank::numeric;

update public.classifications
set rank = case
  when eligibility_type in ('open', 'age') then 0
  when regexp_replace(trim(name), '^#', '') ~ '^[0-9]+(\.[0-9]+)?$'
    then regexp_replace(trim(name), '^#', '')::numeric
  else rank
end;
