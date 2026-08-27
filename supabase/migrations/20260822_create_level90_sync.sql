-- Level90 cloud schema. Run once in the Supabase SQL Editor for the same
-- project used by Workout. Existing Workout tables are not changed.

create table if not exists public.level90_profiles (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  started_on date not null,
  profile_name text not null default ''
    check (char_length(profile_name) <= 30),
  theme text not null default 'dark'
    check (theme in ('dark', 'light')),
  palette text not null default 'arctic'
    check (palette in ('arctic', 'jade', 'aurora', 'rose')),
  schema_version smallint not null default 4
    check (schema_version >= 1),
  stoic_calendar jsonb not null default '{"birthDate":"","horizonYears":90,"weeks":{}}'::jsonb
    constraint level90_profiles_stoic_calendar_object
    check (jsonb_typeof(stoic_calendar) = 'object'),
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.level90_categories (
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  id text not null,
  name text not null
    check (char_length(name) between 1 and 32),
  icon text not null default '✨'
    check (char_length(icon) between 1 and 24),
  description text not null default ''
    check (char_length(description) <= 120),
  sort_order integer not null default 0
    check (sort_order >= 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (client_updated_at >= client_created_at)
);

create table if not exists public.level90_quests (
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  id text not null,
  title text not null
    check (char_length(title) between 1 and 70),
  category_id text not null,
  difficulty text not null
    check (difficulty in ('tiny', 'easy', 'medium', 'hard', 'major', 'epic')),
  quest_type text not null
    check (quest_type in ('recurring', 'oneoff')),
  schedule jsonb not null default '{"mode":"daily"}'::jsonb
    check (jsonb_typeof(schedule) = 'object'),
  active boolean not null default true,
  sort_order integer not null default 0
    check (sort_order >= 0),
  created_on date not null,
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (client_updated_at >= client_created_at)
);

create table if not exists public.level90_completions (
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  id text not null,
  quest_id text not null,
  completion_date date not null,
  completed_at timestamptz not null,
  quest_title text not null
    check (char_length(quest_title) between 1 and 70),
  category_id text,
  difficulty text not null
    check (difficulty in ('tiny', 'easy', 'medium', 'hard', 'major', 'epic')),
  xp_awarded integer not null
    check (xp_awarded >= 0),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, quest_id, completion_date)
);

create index if not exists level90_categories_user_sort_idx
  on public.level90_categories (user_id, sort_order, client_updated_at desc);

create index if not exists level90_quests_user_sort_idx
  on public.level90_quests (user_id, sort_order, client_updated_at desc);

create index if not exists level90_completions_user_date_idx
  on public.level90_completions (user_id, completion_date desc, completed_at desc);

create or replace function public.reconcile_level90_client_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.client_updated_at < old.client_updated_at then
    return old;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reconcile_level90_profile_update on public.level90_profiles;
create trigger reconcile_level90_profile_update
before update on public.level90_profiles
for each row execute function public.reconcile_level90_client_update();

drop trigger if exists reconcile_level90_category_update on public.level90_categories;
create trigger reconcile_level90_category_update
before update on public.level90_categories
for each row execute function public.reconcile_level90_client_update();

drop trigger if exists reconcile_level90_quest_update on public.level90_quests;
create trigger reconcile_level90_quest_update
before update on public.level90_quests
for each row execute function public.reconcile_level90_client_update();

drop trigger if exists reconcile_level90_completion_update on public.level90_completions;
create trigger reconcile_level90_completion_update
before update on public.level90_completions
for each row execute function public.reconcile_level90_client_update();

alter table public.level90_profiles enable row level security;
alter table public.level90_categories enable row level security;
alter table public.level90_quests enable row level security;
alter table public.level90_completions enable row level security;

revoke all on table public.level90_profiles from anon;
revoke all on table public.level90_categories from anon;
revoke all on table public.level90_quests from anon;
revoke all on table public.level90_completions from anon;

grant select, insert, update, delete on table public.level90_profiles to authenticated;
grant select, insert, update, delete on table public.level90_categories to authenticated;
grant select, insert, update, delete on table public.level90_quests to authenticated;
grant select, insert, update, delete on table public.level90_completions to authenticated;

drop policy if exists "Users manage their Level90 profile" on public.level90_profiles;
create policy "Users manage their Level90 profile"
on public.level90_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their Level90 categories" on public.level90_categories;
create policy "Users manage their Level90 categories"
on public.level90_categories
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their Level90 quests" on public.level90_quests;
create policy "Users manage their Level90 quests"
on public.level90_quests
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their Level90 completions" on public.level90_completions;
create policy "Users manage their Level90 completions"
on public.level90_completions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
