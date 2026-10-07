begin;
do $$
declare producer record; season record; source jsonb;
begin
  for producer in select id,slug from public.producers loop
    for season in select id from public.producer_seasons where producer_id=producer.id loop
      source:=public.finals_qualification_source(producer.slug,season.id);
      if jsonb_typeof(source->'rules') is distinct from 'array'
        or jsonb_typeof(source->'finishes') is distinct from 'array'
        or jsonb_typeof(source->'manual') is distinct from 'array'
        or jsonb_typeof(source->'moves') is distinct from 'array' then
        raise exception 'Finals source is missing required collections';
      end if;
      if exists(select 1 from jsonb_array_elements(source->'rules') item where item->>'producerId'<>producer.id::text or item->>'seasonId'<>season.id::text) then
        raise exception 'Qualifier source crossed producer or season boundaries';
      end if;
    end loop;
  end loop;
end;
$$;
rollback;
