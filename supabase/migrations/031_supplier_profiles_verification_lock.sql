-- When suppliers have submitted for verification (timestamp set) or are verified, block edits to
-- legal identity and payout destination columns. Traverion staff using the service role JWT bypass this.

alter table public.supplier_profiles
  add column if not exists verification_submitted_at timestamptz;

comment on column public.supplier_profiles.verification_submitted_at is
  'Set when supplier saves company details for verification; with pending/verified status, locks sensitive fields.';

-- Existing accounts already in review or approved: treat as submitted so they stay protected.
update public.supplier_profiles
set verification_submitted_at = coalesce(updated_at, created_at)
where verification_submitted_at is null
  and verification_status in ('pending', 'verified');

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
  'Rejects updates to legal/payout columns when verified, or pending after verification_submitted_at was set; service_role bypasses.';
