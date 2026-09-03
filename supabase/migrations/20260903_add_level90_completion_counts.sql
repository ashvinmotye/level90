-- Level90 Version 42: allow a quest to be cleared repeatedly on one day.
-- Existing completion rows become a single clear. New repeat clears update this
-- count while preserving the existing one-row-per-quest-per-day sync model.

alter table public.level90_completions
  add column if not exists completion_count integer not null default 1;

alter table public.level90_completions
  drop constraint if exists level90_completions_completion_count_check,
  add constraint level90_completions_completion_count_check
    check (completion_count between 1 and 999);

