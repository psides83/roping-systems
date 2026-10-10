begin;
select set_config('request.jwt.claims',
  (select jsonb_build_object('sub',user_id,'role','authenticated')::text
   from public.producer_staff where role='owner' order by created_at,user_id limit 1), true);
do $$
declare producer uuid; prior integer; rejected boolean;
begin
  select producer_id into producer from public.producer_staff where user_id=auth.uid() and role='owner' limit 1;
  if producer is null then raise exception 'Owner fixture required'; end if;
  select revision into prior from public.producer_feature_preferences where producer_id=producer;
  prior:=coalesce(prior,0);
  perform public.save_producer_features(producer,prior,'{"funds":false}'::jsonb);
  if not exists(select 1 from public.producer_feature_preferences where producer_id=producer and features->>'funds'='false' and revision=prior+1) then raise exception 'Preference was not saved'; end if;
  rejected:=false;
  begin perform public.save_producer_features(producer,prior,'{}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Stale save was accepted'; end if;
  rejected:=false;
  begin perform public.save_producer_features(producer,prior+1,'{"timing":false}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Core toggle was accepted'; end if;
  rejected:=false;
  begin perform public.save_producer_features(producer,prior+1,'{"funds":"false"}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid value was accepted'; end if;
  perform set_config('request.jwt.claims','{}',true);
  rejected:=false;
  begin perform public.save_producer_features(producer,prior+1,'{}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Unauthenticated save was accepted'; end if;
end $$;
rollback;
