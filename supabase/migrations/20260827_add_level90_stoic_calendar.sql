-- Level90 Version 37: synchronized Memento Mori life calendar.
-- Run once in the same Supabase project as the existing Level90 tables.

alter table public.level90_profiles
  add column if not exists stoic_calendar jsonb not null
  default '{"birthDate":"","horizonYears":90,"weeks":{}}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'level90_profiles_stoic_calendar_object'
      and conrelid = 'public.level90_profiles'::regclass
  ) then
    alter table public.level90_profiles
      add constraint level90_profiles_stoic_calendar_object
      check (jsonb_typeof(stoic_calendar) = 'object');
  end if;
end;
$$;
