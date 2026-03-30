-- =============================================================================
-- Traverion supplier portal: verification docs, address columns, verification lock
-- Combines migrations 029, 030, 031, 032, 033. Idempotent — safe to re-run.
-- Run in Supabase SQL Editor as postgres (or any role that can alter tables/storage).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 029: Registration / ID document paths + private storage bucket + policies
-- -----------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists identity_document_path text,
  add column if not exists company_registration_document_path text;

comment on column public.supplier_profiles.identity_document_path is
  'Storage path in supplier-verification bucket (e.g. userId/identity-document.pdf).';
comment on column public.supplier_profiles.company_registration_document_path is
  'Storage path for company extract / registration proof (company suppliers).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-verification',
  'supplier-verification',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do nothing;

drop policy if exists "verification read own" on storage.objects;
create policy "verification read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "verification insert own" on storage.objects;
create policy "verification insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "verification update own" on storage.objects;
create policy "verification update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  )
  with check (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "verification delete own" on storage.objects;
create policy "verification delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

-- -----------------------------------------------------------------------------
-- 030 / 033: Structured address (required by verification trigger on NEW row)
-- -----------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists address_street text,
  add column if not exists address_country text,
  add column if not exists address_city text,
  add column if not exists address_postal_code text;

comment on column public.supplier_profiles.address_street is 'Street / line 1 (building, street).';
comment on column public.supplier_profiles.address_country is 'Country as shown on registration.';
comment on column public.supplier_profiles.address_city is 'City or locality.';
comment on column public.supplier_profiles.address_postal_code is 'Postal or ZIP code.';

-- -----------------------------------------------------------------------------
-- 031: verification_submitted_at + data cleanup + trigger
-- -----------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists verification_submitted_at timestamptz;

comment on column public.supplier_profiles.verification_submitted_at is
  'Set when supplier saves company details for verification; with pending/verified status, locks sensitive fields.';

-- Clear mistaken timestamps on drafts (pending default, never chose business type)
update public.supplier_profiles
set verification_submitted_at = null
where verification_status = 'pending'
  and business_type is null;

-- Backfill for accounts that already submitted (have business_type)
update public.supplier_profiles
set verification_submitted_at = coalesce(updated_at, created_at)
where verification_submitted_at is null
  and verification_status in ('pending', 'verified')
  and business_type is not null;

create or replace function public.supplier_profiles_enforce_verification_lock()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
  sensitive_locked boolean;
begin
  jwt_role := coalesce((select auth.jwt()) ->> 'role', '');
  if jwt_role = 'service_role' then
    return new;
  end if;

  sensitive_locked :=
    old.verification_status = 'verified'
    or (
      old.verification_status = 'pending'
      and old.verification_submitted_at is not null
      and old.business_type is not null
    );

  if not sensitive_locked then
    return new;
  end if;

  if new.display_name is distinct from old.display_name
    or new.business_type is distinct from old.business_type
    or new.company_legal_name is distinct from old.company_legal_name
    or new.company_registration_number is distinct from old.company_registration_number
    or new.managing_directors is distinct from old.managing_directors
    or new.business_address is distinct from old.business_address
    or new.address_street is distinct from old.address_street
    or new.address_country is distinct from old.address_country
    or new.address_city is distinct from old.address_city
    or new.address_postal_code is distinct from old.address_postal_code
    or new.tax_id is distinct from old.tax_id
    or new.vat_id is distinct from old.vat_id
    or new.payout_method is distinct from old.payout_method
    or new.payout_iban is distinct from old.payout_iban
    or new.payout_bic is distinct from old.payout_bic
    or new.payout_paypal_email is distinct from old.payout_paypal_email
    or new.verification_status is distinct from old.verification_status
    or new.identity_document_path is distinct from old.identity_document_path
    or new.company_registration_document_path is distinct from old.company_registration_document_path
    or new.verification_submitted_at is distinct from old.verification_submitted_at
  then
    raise exception
      using errcode = '42501',
      message = 'Business registration and payout bank details cannot be changed while your profile is under review or after verification. Email info@traverion.com to request updates.';
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_profiles_enforce_verification_lock on public.supplier_profiles;

create trigger supplier_profiles_enforce_verification_lock
  before update on public.supplier_profiles
  for each row
  execute function public.supplier_profiles_enforce_verification_lock();

comment on function public.supplier_profiles_enforce_verification_lock() is
  'Rejects updates to legal/payout columns when verified, or pending after submit with business_type set; service_role bypasses.';
