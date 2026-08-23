-- Level90 notification foundation. Run after the Level90 sync migration.
-- This creates per-user device subscriptions and future smart-reminder preferences.

create table if not exists public.level90_push_subscriptions (
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_name text not null
    check (char_length(device_name) between 1 and 40),
  platform text not null default 'Web'
    check (char_length(platform) between 1 and 60),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, endpoint)
);

create table if not exists public.level90_notification_preferences (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 80),
  smart_enabled boolean not null default false,
  quiet_start time not null default '21:30',
  quiet_end time not null default '08:00',
  max_daily smallint not null default 2
    check (max_daily between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists level90_push_subscriptions_enabled_idx
  on public.level90_push_subscriptions (user_id, enabled, last_seen_at desc);

create or replace function public.touch_level90_notification_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_level90_push_subscription_update on public.level90_push_subscriptions;
create trigger touch_level90_push_subscription_update
before update on public.level90_push_subscriptions
for each row execute function public.touch_level90_notification_update();

drop trigger if exists touch_level90_notification_preference_update on public.level90_notification_preferences;
create trigger touch_level90_notification_preference_update
before update on public.level90_notification_preferences
for each row execute function public.touch_level90_notification_update();

alter table public.level90_push_subscriptions enable row level security;
alter table public.level90_notification_preferences enable row level security;

revoke all on table public.level90_push_subscriptions from anon;
revoke all on table public.level90_notification_preferences from anon;

grant select, insert, update, delete on table public.level90_push_subscriptions to authenticated;
grant select, insert, update, delete on table public.level90_notification_preferences to authenticated;

drop policy if exists "Users manage their Level90 push devices" on public.level90_push_subscriptions;
create policy "Users manage their Level90 push devices"
on public.level90_push_subscriptions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their Level90 notification preferences" on public.level90_notification_preferences;
create policy "Users manage their Level90 notification preferences"
on public.level90_notification_preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
