-- Level90 notification lanes: daily briefs plus a more active streak-rescue engine.
-- Run after 20260823_add_level90_smart_notifications.sql, then redeploy the
-- level90-notifications Edge Function.

alter table public.level90_notification_preferences
  add column if not exists morning_brief_enabled boolean not null default true,
  add column if not exists morning_brief_time time not null default '10:00',
  add column if not exists evening_recap_enabled boolean not null default true,
  add column if not exists evening_recap_time time not null default '21:00',
  add column if not exists rescue_intensity text not null default 'aggressive',
  add column if not exists final_rescue_time time not null default '20:15';

alter table public.level90_notification_preferences
  drop constraint if exists level90_notification_preferences_rescue_intensity_check,
  add constraint level90_notification_preferences_rescue_intensity_check
    check (rescue_intensity in ('calm', 'balanced', 'aggressive'));

alter table public.level90_notification_preferences
  alter column max_daily set default 3,
  alter column adaptive_grace_minutes set default 30,
  alter column cooldown_minutes set default 90;

-- Move preferences that still use the Phase 2 defaults to the new aggressive
-- preset. Explicitly customised values are left untouched.
update public.level90_notification_preferences
set
  max_daily = 3,
  adaptive_grace_minutes = 30,
  cooldown_minutes = 90,
  rescue_intensity = 'aggressive'
where max_daily = 2
  and adaptive_grace_minutes = 60
  and cooldown_minutes = 240;

alter table public.level90_notification_outbox
  drop constraint if exists level90_notification_outbox_rule_key_check;

alter table public.level90_notification_outbox
  add constraint level90_notification_outbox_rule_key_check
    check (rule_key in ('morning_brief', 'evening_recap', 'streak_rescue'));

create index if not exists level90_notification_outbox_user_rule_date_idx
  on public.level90_notification_outbox (user_id, rule_key, local_date, created_at desc);
