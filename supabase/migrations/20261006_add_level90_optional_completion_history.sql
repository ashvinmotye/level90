-- Level90 Version 65: preserve whether each completion was optional when earned.
-- Existing rows are backfilled from the quest schedule currently stored in cloud.

alter table public.level90_completions
  add column if not exists was_optional boolean not null default false;

update public.level90_completions as completion
set was_optional = true
from public.level90_quests as quest
where quest.user_id = completion.user_id
  and quest.id = completion.quest_id
  and quest.quest_type = 'recurring'
  and quest.schedule ->> 'mode' = 'weekdays'
  and quest.schedule @> '{"optional":true}'::jsonb
  and not exists (
    select 1
    from jsonb_array_elements_text(coalesce(quest.schedule -> 'days','[]'::jsonb)) as required_day(value)
    where required_day.value::integer = extract(dow from completion.completion_date)::integer
  );
