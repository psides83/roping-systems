-- Complete the discipline-to-division vocabulary migration for male-entry
-- classification exceptions on divisions and scheduled event ropings.
alter table public.divisions
  rename column male_classification_discipline_id to male_classification_division_id;

alter table public.event_ropings
  rename column male_classification_discipline_id to male_classification_division_id;
