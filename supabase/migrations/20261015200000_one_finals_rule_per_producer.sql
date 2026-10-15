-- One designated finals rule per producer, including across different seasons.
-- season_id is already NOT NULL, references producer_seasons, and validated against producer_id.
create unique index qualification_rule_sets_one_finals_per_producer
  on public.qualification_rule_sets(producer_id) where is_finals;
