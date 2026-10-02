update public.classifications
set rank = 0
where eligibility_type in ('open', 'age')
  and rank <> 0;
