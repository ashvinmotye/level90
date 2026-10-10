alter table public.level90_profiles
  add column if not exists holiday_mode jsonb not null
  default '{"enabled":false,"activeFrom":null,"periods":[]}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'level90_profiles_holiday_mode_object'
      and conrelid = 'public.level90_profiles'::regclass
  ) then
    alter table public.level90_profiles
      add constraint level90_profiles_holiday_mode_object
      check (jsonb_typeof(holiday_mode) = 'object');
  end if;
end
$$;

update public.level90_profiles
set holiday_mode = '{"enabled":false,"activeFrom":null,"periods":[]}'::jsonb
where holiday_mode is null or jsonb_typeof(holiday_mode) <> 'object';
