-- Canonical phone normalization + uniqueness on normalized value.
-- Finnish national mobiles 04x… / 050… map to +358… so they match +358… entries.
-- Signup availability checks both consumer_profiles and supplier_profiles.

create or replace function public.normalize_contact_phone(phone text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  t text;
  d text;
  had_plus boolean;
begin
  if phone is null then
    return null;
  end if;
  t := btrim(phone);
  if t = '' then
    return null;
  end if;
  d := regexp_replace(t, '\D', '', 'g');
  if d is null or d = '' then
    return null;
  end if;
  had_plus := (left(t, 1) = '+');
  if d ~ '^358' then
    return '+' || d;
  end if;
  if not had_plus and (d ~ '^04[0-9]\d{7,8}$' or d ~ '^050\d{7,8}$') then
    return '+358' || substring(d from 2);
  end if;
  return '+' || d;
end;
$$;

comment on function public.normalize_contact_phone(text) is
  'Strips formatting to E.164-style +digits; Finnish 04x/050 national → +358…';

-- Replace column unique indexes with uniqueness on normalized value.
drop index if exists public.consumer_profiles_contact_phone_unique;
drop index if exists public.supplier_profiles_contact_phone_unique;

update public.consumer_profiles
set contact_phone = public.normalize_contact_phone(contact_phone)
where contact_phone is not null and btrim(contact_phone) <> '';

update public.supplier_profiles
set contact_phone = public.normalize_contact_phone(contact_phone)
where contact_phone is not null and btrim(contact_phone) <> '';

do $$
declare
  c_dup int;
  s_dup int;
begin
  select count(*) into c_dup
  from (
    select public.normalize_contact_phone(contact_phone) as n, count(*) as cnt
    from public.consumer_profiles
    where contact_phone is not null and btrim(contact_phone) <> ''
    group by 1
    having count(*) > 1
  ) d;
  if c_dup > 0 then
    raise exception 'consumer_profiles: duplicate normalized contact_phone rows exist; resolve before applying migration';
  end if;

  select count(*) into s_dup
  from (
    select public.normalize_contact_phone(contact_phone) as n, count(*) as cnt
    from public.supplier_profiles
    where contact_phone is not null and btrim(contact_phone) <> ''
    group by 1
    having count(*) > 1
  ) d2;
  if s_dup > 0 then
    raise exception 'supplier_profiles: duplicate normalized contact_phone rows exist; resolve before applying migration';
  end if;

  if exists (
    select 1
    from public.consumer_profiles cp
    where cp.contact_phone is not null
      and btrim(cp.contact_phone) <> ''
      and exists (
        select 1
        from public.supplier_profiles sp
        where sp.contact_phone is not null
          and btrim(sp.contact_phone) <> ''
          and public.normalize_contact_phone(sp.contact_phone)
            = public.normalize_contact_phone(cp.contact_phone)
      )
  ) then
    raise exception 'Same normalized phone exists on consumer and supplier profiles; resolve before applying migration';
  end if;
end;
$$;

create unique index if not exists consumer_profiles_contact_phone_norm_unique
  on public.consumer_profiles (public.normalize_contact_phone(contact_phone))
  where contact_phone is not null and btrim(contact_phone) <> '';

create unique index if not exists supplier_profiles_contact_phone_norm_unique
  on public.supplier_profiles (public.normalize_contact_phone(contact_phone))
  where contact_phone is not null and btrim(contact_phone) <> '';

-- Keep stored contact_phone in canonical form on every write.
create or replace function public.trg_normalize_consumer_contact_phone()
returns trigger
language plpgsql
as $$
begin
  if new.contact_phone is null or btrim(new.contact_phone) = '' then
    new.contact_phone := null;
  else
    new.contact_phone := public.normalize_contact_phone(new.contact_phone);
  end if;
  return new;
end;
$$;

create or replace function public.trg_normalize_supplier_contact_phone()
returns trigger
language plpgsql
as $$
begin
  if new.contact_phone is null or btrim(new.contact_phone) = '' then
    new.contact_phone := null;
  else
    new.contact_phone := public.normalize_contact_phone(new.contact_phone);
  end if;
  return new;
end;
$$;

drop trigger if exists consumer_profiles_normalize_contact_phone on public.consumer_profiles;
create trigger consumer_profiles_normalize_contact_phone
  before insert or update of contact_phone on public.consumer_profiles
  for each row execute function public.trg_normalize_consumer_contact_phone();

drop trigger if exists supplier_profiles_normalize_contact_phone on public.supplier_profiles;
create trigger supplier_profiles_normalize_contact_phone
  before insert or update of contact_phone on public.supplier_profiles
  for each row execute function public.trg_normalize_supplier_contact_phone();

-- One phone number cannot be used for two signups across consumer and supplier.
drop function if exists public.is_consumer_phone_available(text);

create or replace function public.is_phone_available_for_signup(phone_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  norm text;
begin
  norm := public.normalize_contact_phone(phone_input);
  if norm is null or norm = '' then
    return false;
  end if;
  if exists (
    select 1
    from public.consumer_profiles cp
    where cp.contact_phone is not null
      and btrim(cp.contact_phone) <> ''
      and public.normalize_contact_phone(cp.contact_phone) = norm
  ) then
    return false;
  end if;
  if exists (
    select 1
    from public.supplier_profiles sp
    where sp.contact_phone is not null
      and btrim(sp.contact_phone) <> ''
      and public.normalize_contact_phone(sp.contact_phone) = norm
  ) then
    return false;
  end if;
  return true;
end;
$$;

comment on function public.is_phone_available_for_signup(text) is
  'True if normalized phone is not used on any consumer or supplier profile.';

revoke all on function public.is_phone_available_for_signup(text) from public;
grant execute on function public.is_phone_available_for_signup(text) to anon, authenticated;
