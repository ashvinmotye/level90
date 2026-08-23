-- Level90 smart-notification rule engine. Run after the notification foundation migration.
-- Adds a transparent streak-rescue rule, logical outbox, per-device deliveries and retry state.

alter table public.level90_notification_preferences
  add column if not exists streak_rescue_enabled boolean not null default true,
  add column if not exists min_streak smallint not null default 3,
  add column if not exists adaptive_grace_minutes smallint not null default 60,
  add column if not exists cooldown_minutes smallint not null default 240,
  add column if not exists last_evaluated_at timestamptz,
  add column if not exists last_rule_result text,
  add column if not exists last_rule_detail jsonb not null default '{}'::jsonb;

alter table public.level90_notification_preferences
  drop constraint if exists level90_notification_preferences_min_streak_check,
  add constraint level90_notification_preferences_min_streak_check
    check (min_streak between 2 and 30),
  drop constraint if exists level90_notification_preferences_adaptive_grace_check,
  add constraint level90_notification_preferences_adaptive_grace_check
    check (adaptive_grace_minutes between 15 and 240),
  drop constraint if exists level90_notification_preferences_cooldown_check,
  add constraint level90_notification_preferences_cooldown_check
    check (cooldown_minutes between 60 and 1440);

create table if not exists public.level90_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null
    check (rule_key in ('streak_rescue')),
  dedupe_key text not null,
  local_date date not null,
  quest_id text,
  title text not null
    check (char_length(title) between 1 and 120),
  body text not null
    check (char_length(body) between 1 and 240),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  reason jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reason) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  target_count smallint not null default 0
    check (target_count >= 0),
  sent_count smallint not null default 0
    check (sent_count >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.level90_notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null
    references public.level90_notification_outbox(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'retry', 'sending', 'sent', 'failed', 'invalid', 'cancelled')),
  attempt_count smallint not null default 0
    check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, subscription_id),
  foreign key (user_id, subscription_id)
    references public.level90_push_subscriptions(user_id, id) on delete cascade
);

create index if not exists level90_notification_outbox_user_date_idx
  on public.level90_notification_outbox (user_id, local_date desc, created_at desc);

create index if not exists level90_notification_outbox_status_idx
  on public.level90_notification_outbox (status, created_at);

create index if not exists level90_notification_deliveries_retry_idx
  on public.level90_notification_deliveries (status, next_attempt_at)
  where status in ('pending', 'retry');

drop trigger if exists touch_level90_notification_outbox_update on public.level90_notification_outbox;
create trigger touch_level90_notification_outbox_update
before update on public.level90_notification_outbox
for each row execute function public.touch_level90_notification_update();

drop trigger if exists touch_level90_notification_delivery_update on public.level90_notification_deliveries;
create trigger touch_level90_notification_delivery_update
before update on public.level90_notification_deliveries
for each row execute function public.touch_level90_notification_update();

alter table public.level90_notification_outbox enable row level security;
alter table public.level90_notification_deliveries enable row level security;

revoke all on table public.level90_notification_outbox from anon;
revoke all on table public.level90_notification_deliveries from anon;
revoke all on table public.level90_notification_outbox from authenticated;
revoke all on table public.level90_notification_deliveries from authenticated;

grant select on table public.level90_notification_outbox to authenticated;
grant select on table public.level90_notification_deliveries to authenticated;

drop policy if exists "Users read their Level90 notification log" on public.level90_notification_outbox;
create policy "Users read their Level90 notification log"
on public.level90_notification_outbox
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users read their Level90 delivery log" on public.level90_notification_deliveries;
create policy "Users read their Level90 delivery log"
on public.level90_notification_deliveries
for select
to authenticated
using ((select auth.uid()) = user_id);
