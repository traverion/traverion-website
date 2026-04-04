-- SQL Editor runs as postgres/supabase_admin without a service_role JWT; maintenance UPDATEs were blocked.
-- service_role (Edge Functions / server) still bypasses via JWT.

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

  if current_user in ('postgres', 'supabase_admin') then
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

comment on function public.supplier_profiles_enforce_verification_lock() is
  'Rejects updates to legal/payout columns when verified, or pending after submit with business_type set; service_role JWT or postgres/supabase_admin (SQL Editor) bypasses.';
