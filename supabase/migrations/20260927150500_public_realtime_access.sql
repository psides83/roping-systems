create policy "Public can receive runs for published ropings"
on public.runs for select
to anon, authenticated
using (
  exists (
    select 1
    from public.roping_divisions division
    join public.ropings roping on roping.id = division.roping_id
    where division.id = runs.roping_division_id
      and roping.is_public = true
  )
);
