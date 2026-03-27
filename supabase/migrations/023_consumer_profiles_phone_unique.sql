-- Consumer profile with unique phone enforcement for anti-spam signup.
create table if not exists public.consumer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consumer_profiles enable row level security;

create policy "Consumers can read own profile"
  on public.consumer_profiles for select
  using (auth.uid() = id);

create policy "Consumers can insert own profile"
  on public.consumer_profiles for insert
  with check (auth.uid() = id);

create policy "Consumers can update own profile"
  on public.consumer_profiles for update
  using (auth.uid() = id);

create unique index if not exists consumer_profiles_contact_phone_unique
  on public.consumer_profiles (contact_phone)
  where contact_phone is not null and btrim(contact_phone) <> '';

drop trigger if exists consumer_profiles_updated_at on public.consumer_profiles;
create trigger consumer_profiles_updated_at
  before update on public.consumer_profiles
  for each row execute function public.set_updated_at();

-- Anonymous-safe helper so signup can verify phone uniqueness without exposing profile rows.
create or replace function public.is_consumer_phone_available(phone_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := nullif(btrim(phone_input), '');
begin
  if normalized is null then
    return false;
  end if;
  return not exists (
    select 1
    from public.consumer_profiles cp
    where cp.contact_phone = normalized
  );
end;
$$;

revoke all on function public.is_consumer_phone_available(text) from public;
grant execute on function public.is_consumer_phone_available(text) to anon, authenticated;
