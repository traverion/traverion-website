-- Phase 570: close a document-provenance gap in supplier verification.
--
-- Background. The supplier-verification storage bucket restricts every
-- client-side read/write to the caller's own prefix (migration 029:
-- storage.objects RLS requires starts_with(name, auth.uid()::text ||
-- '/') for select/insert/update/delete on bucket_id = 'supplier-verification').
-- That is sound on its own -- but public.supplier_profiles.identity_document_path
-- and company_registration_document_path are plain text columns with no
-- equivalent constraint. supplier_profiles_enforce_verification_lock()
-- (031 -> ... -> 083) only starts protecting these two columns once the
-- row is business_locked (already verified, or pending with a submitted
-- application) -- before that point, and even afterward via the initial
-- pending submission itself, a supplier can set either column to ANY
-- string via a raw client update, not only a path under their own
-- storage prefix.
--
-- admin-supplier-verification/index.ts's signedUrlForPath() generates the
-- signed URL an admin reviewer sees using the SERVICE-ROLE client
-- (admin.storage.from('supplier-verification').createSignedUrl(...)),
-- which bypasses storage RLS entirely -- by design, since staff need to
-- review documents suppliers can only write to their own prefix of. That
-- means the storage-layer ownership check is not a backstop here: once an
-- admin reviews a submission, whatever path is in the column is what gets
-- signed and shown to them, regardless of who actually owns it.
--
-- Concrete exploit: public.listings.supplier_id is selected in the
-- standard published-listing query (src/data/supabase-listings.ts) and is
-- returned to anonymous visitors browsing the public site -- so any
-- existing supplier's id is effectively public information, not a
-- secret. Storage paths follow the documented, predictable convention
-- "userId/identity-document.pdf" (migration 029's own column comment). A
-- malicious actor can therefore: (1) find any real, already-verified
-- supplier's id from a public listing; (2) register their own supplier
-- account; (3) send a raw PATCH setting their own
-- identity_document_path/company_registration_document_path to
-- "{thatOtherSupplierId}/identity-document.pdf" etc., instead of
-- uploading anything themselves; (4) submit for verification (a
-- legitimate action -- setting verification_status to 'pending' is
-- exactly what 083 already allows any supplier to do). When an admin
-- reviews this fraudulent submission, admin-supplier-verification signs
-- and displays the OTHER supplier's real identity/registration document
-- as if it were the attacker's own, which can talk a reviewer into
-- approving a business that never proved its own identity at all. This
-- is an identity/KYC-bypass integrity issue, not a confidentiality leak
-- (the attacker does not receive a signed URL themselves -- only the
-- admin does, and the admin already has broad access) -- but it directly
-- undermines the entire point of the admin-review gate five prior
-- migrations (031, 032, 034, 035, 083) already fought hard to protect.
--
-- Fix: extend supplier_profiles_enforce_verification_lock() (same
-- function, same service_role/postgres/supabase_admin bypass already in
-- place, no new trigger) with one more independent guard, applied
-- alongside the existing verification_status/feedback guards rather than
-- only within the locked-state blocks: for non-staff callers, a
-- non-null identity_document_path or company_registration_document_path
-- must start with the row's own id followed by '/' -- exactly mirroring
-- the storage bucket's own starts_with(name, auth.uid()::text || '/')
-- rule, so a supplier can only ever point these columns at a path under
-- their own storage prefix, which is the only kind of path a real upload
-- through this bucket could ever have produced for them in the first
-- place. Clearing either column to null (removing an uploaded document)
-- remains allowed, matching existing client behavior
-- (SupplierSettingsPages.tsx sets these to null when a supplier removes
-- an uploaded file). supplier_profiles.id = auth.uid() for the row owner
-- (the only row a non-staff caller's own-profile UPDATE policy can ever
-- reach), so old.id is the correct, already-authenticated prefix to
-- require -- no new auth.uid() dependency is introduced.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- supplier_profiles_document_path_ownership_guard.test.sql): the exploit
-- (setting either document path column to a path under a DIFFERENT
-- supplier's prefix) succeeds against 083 alone and is rejected after
-- 088; a legitimate own-prefix path write still succeeds; clearing either
-- path to null still succeeds; every existing 083 behavior (pending-only
-- status self-write, staff-only feedback, locked-state field freeze) is
-- unaffected; service_role/postgres writes of any path are unaffected.

drop trigger if exists supplier_profiles_enforce_verification_lock on public.supplier_profiles;

create or replace function public.supplier_profiles_enforce_verification_lock()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
  business_locked boolean;
  payout_locked boolean;
  own_prefix text;
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

  -- A supplier may only ever point their own document-path columns at a
  -- path under their own storage prefix, mirroring the supplier-verification
  -- bucket's own starts_with(name, auth.uid()::text || '/') RLS (migration
  -- 029). This is what stops a fraudulent submission from borrowing another
  -- real supplier's identity/registration document via the admin review
  -- flow's service-role (RLS-bypassing) signed-URL generation. Clearing a
  -- path to null remains allowed.
  own_prefix := old.id::text || '/';
  if new.identity_document_path is distinct from old.identity_document_path
    and new.identity_document_path is not null
    and new.identity_document_path not like (own_prefix || '%')
  then
    raise exception
      using errcode = '42501',
      message = 'Identity document path must be a file you uploaded.';
  end if;
  if new.company_registration_document_path is distinct from old.company_registration_document_path
    and new.company_registration_document_path is not null
    and new.company_registration_document_path not like (own_prefix || '%')
  then
    raise exception
      using errcode = '42501',
      message = 'Company registration document path must be a file you uploaded.';
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
  'Locks business vs payout columns; staff-only non-null verification feedback; non-staff may only move verification_status/payout_verification_status to pending; non-staff document paths must stay under their own id prefix; service_role or postgres bypasses.';
