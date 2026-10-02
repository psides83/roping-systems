alter table public.runs
  add column is_excluded boolean not null default false;

create index runs_active_results_idx
on public.runs (roping_division_id, run_number, entry_id)
where is_excluded = false;
