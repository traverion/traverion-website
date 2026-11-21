-- Supplier archive: release login, email, and phone without deleting history.
-- The Stripe account id stays on the archived profile so a new signup cannot attach it.
-- Bookings, transfers, earnings, and payout periods block the archive.

alter table public.supplier_profiles
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists archived_by uuid,
  add column if not exists archive_released_email text,
  add column if not exists archive_released_phone text,
  add column if not exists suspended_at timestamptz;

create table if not exists public.supplier_archive_events (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_profiles (id) on delete restrict,
  action text not null check (action in ('archive', 'restore', 'suspend', 'unsuspend')),
  reason text,
  actor_id uuid,
  stripe_account_retained text,
  released_email text,
  created_at timestamptz not null default now()
);

alter table public.supplier_archive_events enable row level security;

revoke all on table public.supplier_archive_events from public, anon, authenticated;

create index if not exists supplier_profiles_archived_at_idx
  on public.supplier_profiles (archived_at)
  where archived_at is not null;

create or replace function public.supplier_profiles_block_archived_self_service()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce((select auth.jwt()) ->> 'role', '');
  if jwt_role = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if old.archived_at is not null then
    raise exception using errcode = '42501', message = 'This supplier account is archived.';
  end if;
  if new.archived_at is distinct from old.archived_at
    or new.archive_reason is distinct from old.archive_reason
    or new.archived_by is distinct from old.archived_by
    or new.archive_released_email is distinct from old.archive_released_email
    or new.archive_released_phone is distinct from old.archive_released_phone
    or new.suspended_at is distinct from old.suspended_at
  then
    raise exception using errcode = '42501', message = 'Archive status can only be changed by Traverion staff.';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_profiles_block_archived_self_service on public.supplier_profiles;
create trigger supplier_profiles_block_archived_self_service
  before update on public.supplier_profiles
  for each row
  execute function public.supplier_profiles_block_archived_self_service();

create or replace function public.supplier_archive_staff_only()
returns void
language plpgsql
as $$
begin
  if coalesce((select auth.jwt()) ->> 'role', '') = 'service_role' then
    return;
  end if;
  raise exception using errcode = '42501', message = 'Supplier archive can only be changed by Traverion staff.';
end;
$$;

create or replace function public.supplier_archive_replace_login(
  p_user_id uuid,
  p_email text,
  p_ban boolean,
  p_previous_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  has_identity_email boolean;
begin
  update auth.users
  set
    email = p_email,
    banned_until = case when p_ban then timestamptz '2099-01-01' else null end,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('traverion_archived', p_ban)
  where id = p_user_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'email'
  ) into has_identity_email;

  if has_identity_email then
    -- auth.identities.email is generated. Update the source fields only.
    execute
      'update auth.identities
         set identity_data = jsonb_set(coalesce(identity_data, ''{}''::jsonb), ''{email}'', to_jsonb($1::text), true),
             provider_id = case
               when provider = ''email'' and provider_id = $3 then $1
               else provider_id
             end
       where user_id = $2'
      using p_email, p_user_id, p_previous_email;
  else
    update auth.identities
    set
      identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(p_email), true),
      provider_id = case
        when provider = 'email' and provider_id = p_previous_email then p_email
        else provider_id
      end
    where user_id = p_user_id;
  end if;

  delete from auth.sessions where user_id = p_user_id;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
end;
$$;

create or replace function public.supplier_archive_blockers(p_supplier_id uuid)
returns text
language plpgsql
stable
as $$
begin
  if exists (
    select 1
    from public.listings l
    join public.bookings b on b.listing_id = l.id
    where l.supplier_id = p_supplier_id
  ) then
    return 'This supplier has bookings. Archive is blocked while booking history is attached.';
  end if;
  if exists (select 1 from public.supplier_transfer_attempts where supplier_id = p_supplier_id) then
    return 'This supplier has transfer attempts. Archive is blocked.';
  end if;
  if exists (select 1 from public.supplier_payout_periods where supplier_id = p_supplier_id) then
    return 'This supplier has payout periods. Archive is blocked.';
  end if;
  if exists (select 1 from public.supplier_earning_items where supplier_id = p_supplier_id) then
    return 'This supplier has earning items. Archive is blocked.';
  end if;
  if exists (select 1 from public.supplier_ledger_entries where supplier_id = p_supplier_id) then
    return 'This supplier has ledger entries. Archive is blocked.';
  end if;
  return null;
end;
$$;

create or replace function public.archive_supplier(p_supplier_id uuid, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_email text;
  v_phone text;
  v_stripe text;
  v_archived text;
  v_blocker text;
  v_new_email text;
begin
  perform public.supplier_archive_staff_only();
  if v_reason is null or char_length(v_reason) < 8 then
    raise exception using errcode = '22023', message = 'An archive reason of at least 8 characters is required.';
  end if;

  select u.email, p.archived_at::text, p.contact_phone, p.stripe_connected_account_id
  into v_email, v_archived, v_phone, v_stripe
  from public.supplier_profiles p
  join auth.users u on u.id = p.id
  where p.id = p_supplier_id
  for update of p;

  if not found then
    raise exception using errcode = 'P0002', message = 'Supplier not found.';
  end if;
  if v_archived is not null then
    raise exception using errcode = '22023', message = 'This supplier is already archived.';
  end if;

  v_blocker := public.supplier_archive_blockers(p_supplier_id);
  if v_blocker is not null then
    raise exception using errcode = '23514', message = v_blocker;
  end if;

  v_new_email := 'archived+' || replace(p_supplier_id::text, '-', '') || '@archive.traverion.com';

  update public.supplier_profiles
  set
    archived_at = now(),
    archive_reason = v_reason,
    archived_by = p_actor,
    archive_released_email = v_email,
    archive_released_phone = nullif(trim(coalesce(v_phone, '')), ''),
    contact_phone = null,
    suspended_at = null,
    updated_at = now()
  where id = p_supplier_id;

  perform public.supplier_archive_replace_login(p_supplier_id, v_new_email, true, v_email);

  insert into public.supplier_archive_events (supplier_id, action, reason, actor_id, stripe_account_retained, released_email)
  values (p_supplier_id, 'archive', v_reason, p_actor, v_stripe, v_email);

  return jsonb_build_object(
    'supplier_id', p_supplier_id,
    'archived', true,
    'email_released', true,
    'phone_released', nullif(trim(coalesce(v_phone, '')), '') is not null,
    'stripe_account_retained', v_stripe is not null,
    'sessions_revoked', true
  );
end;
$$;

create or replace function public.restore_supplier(p_supplier_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_phone text;
  v_archived timestamptz;
begin
  perform public.supplier_archive_staff_only();

  select archived_at, archive_released_email, archive_released_phone
  into v_archived, v_email, v_phone
  from public.supplier_profiles
  where id = p_supplier_id
  for update;

  if v_archived is null then
    raise exception using errcode = '22023', message = 'This supplier is not archived.';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception using errcode = '22023', message = 'The archived login email is missing.';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(v_email) and id <> p_supplier_id) then
    raise exception using errcode = '23505', message = 'That email is already registered to a new supplier. Restore is blocked.';
  end if;
  if v_phone is not null and exists (
    select 1 from public.supplier_profiles
    where id <> p_supplier_id
      and public.normalize_contact_phone(contact_phone) = public.normalize_contact_phone(v_phone)
      and nullif(trim(coalesce(contact_phone, '')), '') is not null
  ) then
    raise exception using errcode = '23505', message = 'That phone number is already used by another supplier. Restore is blocked.';
  end if;

  update public.supplier_profiles
  set
    contact_phone = v_phone,
    archived_at = null,
    suspended_at = null,
    updated_at = now()
  where id = p_supplier_id;

  perform public.supplier_archive_replace_login(
    p_supplier_id,
    v_email,
    false,
    'archived+' || replace(p_supplier_id::text, '-', '') || '@archive.traverion.com'
  );

  insert into public.supplier_archive_events (supplier_id, action, reason, actor_id, released_email)
  values (p_supplier_id, 'restore', 'Access restored', p_actor, v_email);

  return jsonb_build_object('supplier_id', p_supplier_id, 'restored', true);
end;
$$;

create or replace function public.suspend_supplier(p_supplier_id uuid, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_archived timestamptz;
begin
  perform public.supplier_archive_staff_only();
  if v_reason is null or char_length(v_reason) < 8 then
    raise exception using errcode = '22023', message = 'A suspension reason of at least 8 characters is required.';
  end if;
  select archived_at into v_archived from public.supplier_profiles where id = p_supplier_id for update;
  if v_archived is not null then
    raise exception using errcode = '22023', message = 'Archived suppliers stay archived. Restore them before a separate suspension.';
  end if;
  if not found then
    raise exception using errcode = 'P0002', message = 'Supplier not found.';
  end if;
  update public.supplier_profiles
  set suspended_at = now(), updated_at = now()
  where id = p_supplier_id;
  update auth.users set banned_until = timestamptz '2099-01-01' where id = p_supplier_id;
  delete from auth.sessions where user_id = p_supplier_id;
  delete from auth.refresh_tokens where user_id = p_supplier_id::text;
  insert into public.supplier_archive_events (supplier_id, action, reason, actor_id)
  values (p_supplier_id, 'suspend', v_reason, p_actor);
  return jsonb_build_object('supplier_id', p_supplier_id, 'suspended', true);
end;
$$;

create or replace function public.unsuspend_supplier(p_supplier_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_archived timestamptz;
begin
  perform public.supplier_archive_staff_only();
  select archived_at into v_archived from public.supplier_profiles where id = p_supplier_id for update;
  if v_archived is not null then
    raise exception using errcode = '22023', message = 'Archived suppliers are restored with Restore, not unsuspend.';
  end if;
  update public.supplier_profiles set suspended_at = null, updated_at = now() where id = p_supplier_id;
  update auth.users set banned_until = null where id = p_supplier_id;
  insert into public.supplier_archive_events (supplier_id, action, reason, actor_id)
  values (p_supplier_id, 'unsuspend', 'Access restored', p_actor);
  return jsonb_build_object('supplier_id', p_supplier_id, 'suspended', false);
end;
$$;

revoke all on function public.supplier_archive_staff_only() from public, anon, authenticated;
revoke all on function public.supplier_archive_replace_login(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.supplier_archive_blockers(uuid) from public, anon, authenticated;
revoke all on function public.archive_supplier(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.restore_supplier(uuid, uuid) from public, anon, authenticated;
revoke all on function public.suspend_supplier(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.unsuspend_supplier(uuid, uuid) from public, anon, authenticated;

grant execute on function public.archive_supplier(uuid, text, uuid) to service_role;
grant execute on function public.restore_supplier(uuid, uuid) to service_role;
grant execute on function public.suspend_supplier(uuid, text, uuid) to service_role;
grant execute on function public.unsuspend_supplier(uuid, uuid) to service_role;
