-- Tenant-scoped foreign keys supersede the original single-column keys.
-- Keeping both makes PostgREST relationship embedding ambiguous, while the
-- composite keys preserve both referential integrity and producer isolation.
do $$
declare
  redundant_constraint record;
begin
  for redundant_constraint in
    select
      namespace.nspname as schema_name,
      child.relname as table_name,
      narrow.conname as constraint_name
    from pg_constraint narrow
    join pg_class child on child.oid = narrow.conrelid
    join pg_namespace namespace on namespace.oid = child.relnamespace
    where narrow.contype = 'f'
      and namespace.nspname = 'public'
      and cardinality(narrow.conkey) = 1
      and exists (
        select 1
        from pg_constraint scoped
        where scoped.contype = 'f'
          and scoped.oid <> narrow.oid
          and scoped.conrelid = narrow.conrelid
          and scoped.confrelid = narrow.confrelid
          and cardinality(scoped.conkey) > cardinality(narrow.conkey)
          and narrow.conkey <@ scoped.conkey
          and narrow.confkey <@ scoped.confkey
      )
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      redundant_constraint.schema_name,
      redundant_constraint.table_name,
      redundant_constraint.constraint_name
    );
  end loop;
end;
$$;
