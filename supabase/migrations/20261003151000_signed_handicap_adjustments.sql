alter table public.classifications
  drop constraint if exists classifications_handicap_adjustment_seconds_check,
  add constraint classifications_handicap_adjustment_seconds_check check (
    handicap_adjustment_seconds is null
    or handicap_adjustment_seconds between -60 and 60
  );

alter table public.roping_incentive_rules
  drop constraint if exists roping_incentive_rules_adjustment_seconds_check,
  add constraint roping_incentive_rules_adjustment_seconds_check check (
    adjustment_seconds between -60 and 60
  );

comment on column public.classifications.handicap_adjustment_seconds is
  'Stored scoring credit: positive values subtract from final time and negative values add to final time. Producer-facing forms display the inverse as a signed final-time adjustment.';
