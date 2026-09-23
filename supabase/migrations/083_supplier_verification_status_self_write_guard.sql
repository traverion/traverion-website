-- Fix: a fresh/never-submitted supplier_profiles row can self-grant
-- verified status by writing verification_status / payout_verification_status
-- to 'verified' directly, bypassing admin review entirely.
--
-- Background: supplier_profiles_enforce_verification_lock() (031 -> 032 ->
-- 034 -> 035 -> 036) blocks edits to verification_status/
-- payout_verification_status (and other sensitive columns) only once the
-- row is already "locked" -- business_locked requires old.verification_status
-- = 'verified', or 'pending' with a non-null verification_submitted_at;
-- payout_locked is the same shape for the payout axis. A brand-new supplier
-- profile (verification_status/payout_verification_status still null or
-- unset, *_submitted_at still null) is NOT locked, so the trigger returns
-- new unconditionally for it. RLS on public.supplier_profiles
-- ("Users can update own profile", auth.uid() = id) has no column-level
-- with check, so nothing else stops the row owner from issuing a raw
-- update setting verification_status/payout_verification_status straight
-- to 'verified' before ever going through legitimate submission.
--
-- This directly defeats admin review (supabase/functions/
-- admin-supplier-verification/index.ts is the only legitimate writer of
-- 'verified'/'rejected', and it always runs as service_role, which this
-- trigger already bypasses) and, combined with migration 082's
-- listings-publish guard, would let a supplier self-verify and then
-- immediately publish live listings with zero admin involvement.
--
-- Legitimate client-initiated writes: confirmed by reading
-- src/components/supplier/SupplierSettingsPages.tsx (the only two places
-- in the client codebase that ever write these columns) -- the business
-- profile save sets verification_status: 'pending' (line ~1079) and the
-- payout details save sets payout_verification_status: 'pending'
-- (line ~1251); grep across src/**/*.ts(x) confirms no client code path
-- ever writes 'verified' or 'rejected' for either column. So the correct,
-- minimal rule for non-staff callers is: verification_status /
-- payout_verification_status may only ever be changed TO 'pending' (the
-- self-submission/resubmission value); any other target value must be
-- rejected, at ANY prior state -- not only once already locked.
--
-- Fix: extend supplier_profiles_enforce_verification_lock() (same
-- service_role / postgres / supabase_admin bypass, same function, no new
-- trigger) with this additional, independent guard, applied before the
-- existing business_locked/payout_locked checks so it protects the
-- currently-unlocked window those checks miss, while leaving the existing
-- locked-state protections (and the 036 staff-only-feedback guard)
-- completely unchanged.
--
-- Verified against a scratch Postgres 16 instance (see
-- supabase/tests/supplier_profiles_verification_status_guard.test.sql):
-- legitimate 'pending' submission/resubmission still succeeds; a raw
-- self-write to 'verified' from a fresh (never-submitted) row is now
-- blocked; a raw self-write to 'rejected' is blocked; the existing locked
-- state protections (editing business/payout fields while locked) still
-- raise exactly as before; service_role/admin writes of 'verified' and
-- 'rejected' are unaffected.

drop trigger if exists supplier_profiles_enforce_verification_lock on public.supplier_profiles;

create or replace function public.supplier_profiles_enforce_verification_lock()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
  business_locked boolean;
  payout_locked boolean;
begin
  jwt_role := coalesce((select auth.jwt()) ->> 'role', '');
  if jwt_role = 'service_role' then
    return new;
  end if;

  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  -- Only staff (service_role / SQL editor) may set non-null verification feedback; suppliers may clear to null when fixing.
  if jwt_role <> 'service_role' then
    if new.business_verification_feedback is distinct from old.business_verification_feedback
      and new.business_verification_feedback is not null
    then
      raise exception
        using errcode = '42501',
        message = 'Business verification feedback can only be set by Traverion staff.';
    end if;
    if new.payout_verification_feedback is distinct from old.payout_verification_feedback
      and new.payout_verification_feedback is not null
    then
      raise exception
        using errcode = '42501',
        message = 'Payout verification feedback can only be set by Traverion staff.';
    end if;
  end if;

  -- Only staff (via the service_role-only admin-supplier-verification Edge
  -- Function) may move verification_status/payout_verification_status to
  -- 'verified' or 'rejected'. The only value a supplier may set themselves
  -- is 'pending' (initial submission or resubmission after rejection).
  -- This applies regardless of business_locked/payout_locked below, since
  -- a never-submitted row is not yet locked and would otherwise be able to
  -- self-grant verified status.
  if new.verification_status is distinct from old.verification_status
    and new.verification_status <> 'pending'
  then
    raise exception
      using errcode = '42501',
      message = 'Business verification status can only be set by Traverion staff.';
  end if;

  if new.payout_verification_status is distinct from old.payout_verification_status
    and new.payout_verification_status <> 'pending'
  then
    raise exception
      using errcode = '42501',
      message = 'Payout verification status can only be set by Traverion staff.';
  end if;

  business_locked :=
    old.verification_status = 'verified'
    or (
      old.verification_status = 'pending'
      and old.verification_submitted_at is not null
      and old.business_type is not null
    );

  payout_locked :=
    coalesce(old.payout_verification_status, '') = 'verified'
    or (
      coalesce(old.payout_verification_status, '') = 'pending'
      and old.payout_verification_submitted_at is not null
    );

  if business_locked then
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
      or new.verification_status is distinct from old.verification_status
      or new.identity_document_path is distinct from old.identity_document_path
      or new.company_registration_document_path is distinct from old.company_registration_document_path
      or new.verification_submitted_at is distinct from old.verification_submitted_at
    then
      raise exception
        using errcode = '42501',
        message = 'Business registration and verification documents cannot be changed while your business profile is under review or after verification. Email info@traverion.com to request updates.';
    end if;
  end if;

  if payout_locked then
    if new.payout_method is distinct from old.payout_method
      or new.payout_iban is distinct from old.payout_iban
      or new.payout_bic is distinct from old.payout_bic
      or new.payout_paypal_email is distinct from old.payout_paypal_email
      or new.payout_verification_status is distinct from old.payout_verification_status
      or new.payout_verification_submitted_at is distinct from old.payout_verification_submitted_at
    then
      raise exception
        using errcode = '42501',
        message = 'Payout bank details cannot be changed while they are under review or after verification. Email info@traverion.com to request updates.';
    end if;
  end if;

  return new;
end;
$$;

create trigger supplier_profiles_enforce_verification_lock
  before update on public.supplier_profiles
  for each row
  execute function public.supplier_profiles_enforce_verification_lock();

comment on function public.supplier_profiles_enforce_verification_lock() is
  'Locks business vs payout columns; staff-only non-null verification feedback; non-staff may only move verification_status/payout_verification_status to pending; service_role or postgres bypasses.';
