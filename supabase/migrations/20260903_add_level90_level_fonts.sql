-- Level90 Version 43: synchronize the selected Today-orb level font.
-- Run once in the same Supabase project as the existing Level90 tables.

alter table public.level90_profiles
  add column if not exists level_font text not null default 'default';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'level90_profiles_level_font_check'
      and conrelid = 'public.level90_profiles'::regclass
  ) then
    alter table public.level90_profiles
      add constraint level90_profiles_level_font_check
      check (level_font in ('default', 'moirai-one', 'rubik-lines', 'zen-tokyo-zoo'));
  end if;
end;
$$;
