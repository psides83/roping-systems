-- Existing rows deliberately remain NULL: their actual last content change
-- cannot be reconstructed from a row timestamp that also tracked reordering.
alter table public.roping_templates add column content_updated_at timestamptz;
alter table public.roping_templates alter column content_updated_at set default now();

create function public.stamp_roping_template_content()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.content_updated_at := clock_timestamp();
  elsif (to_jsonb(new) - array['sort_order','updated_at','created_at','content_updated_at'])
    is distinct from (to_jsonb(old) - array['sort_order','updated_at','created_at','content_updated_at']) then
    new.content_updated_at := clock_timestamp();
  else
    new.content_updated_at := old.content_updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_roping_template_content() from public, anon, authenticated;
create trigger roping_template_content_insert before insert on public.roping_templates
for each row execute function public.stamp_roping_template_content();
-- Watch business columns only. Fee triggers can update the content timestamp
-- directly without this trigger replacing it. Future content columns should be
-- added to this trigger when introduced.
do $$
declare content_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into content_columns from information_schema.columns
    where table_schema='public' and table_name='roping_templates'
      and column_name not in ('sort_order','updated_at','created_at','content_updated_at');
  execute 'create trigger roping_template_content_update before update of ' || content_columns ||
    ' on public.roping_templates for each row execute function public.stamp_roping_template_content()';
end;
$$;

create function public.stamp_roping_template_fee_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
    (to_jsonb(new) - array['sort_order','created_at']) is not distinct from
    (to_jsonb(old) - array['sort_order','created_at']) then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    update public.roping_templates set content_updated_at=clock_timestamp()
      where id=old.roping_template_id and producer_id=old.producer_id;
  end if;
  if tg_op = 'INSERT' or (tg_op='UPDATE' and
    (new.roping_template_id, new.producer_id) is distinct from (old.roping_template_id, old.producer_id)) then
    update public.roping_templates set content_updated_at=clock_timestamp()
      where id=new.roping_template_id and producer_id=new.producer_id;
  end if;
  return null;
end;
$$;
revoke all on function public.stamp_roping_template_fee_content() from public, anon, authenticated;
create trigger roping_template_fee_content after insert or update or delete on public.roping_template_fees
for each row execute function public.stamp_roping_template_fee_content();
comment on column public.roping_templates.content_updated_at is
  'Last tracked template or fee content change. NULL means historical date unknown. Display ordering is excluded.';
