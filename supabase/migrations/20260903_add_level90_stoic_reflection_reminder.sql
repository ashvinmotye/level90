-- Level90 Version 41: weekly Stoic journal reminder.
-- Run after the existing notification and Stoic calendar migrations, then
-- redeploy the level90-notifications Edge Function. The existing 15-minute
-- scheduler can remain unchanged.

alter table public.level90_notification_preferences
  add column if not exists stoic_reflection_enabled boolean not null default true,
  add column if not exists stoic_reflection_time time not null default '19:00';

alter table public.level90_notification_outbox
  drop constraint if exists level90_notification_outbox_rule_key_check;

alter table public.level90_notification_outbox
  add constraint level90_notification_outbox_rule_key_check
    check (rule_key in ('morning_brief', 'evening_recap', 'streak_rescue', 'stoic_reflection'));

