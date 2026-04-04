-- Staff-written notes shown to suppliers on rejection (no code edits). Set via Edge Function / service role or SQL editor.

alter table public.supplier_profiles
  add column if not exists business_verification_feedback text,
  add column if not exists payout_verification_feedback text;

comment on column public.supplier_profiles.business_verification_feedback is
  'Traverion message to supplier when business verification is rejected; cleared on resubmit.';
comment on column public.supplier_profiles.payout_verification_feedback is
  'Traverion message to supplier when payout verification is rejected; cleared on resubmit.';

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
  'Locks business vs payout columns; staff-only non-null verification feedback; service_role or postgres bypasses.';
