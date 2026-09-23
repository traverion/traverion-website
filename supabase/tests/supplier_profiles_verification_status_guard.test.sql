-- Regression test for public.supplier_profiles_enforce_verification_lock()
-- as extended by migration 083 (self-write guard on verification_status /
-- payout_verification_status).
--
-- This repo has no Deno/pgTAP test runner wired into CI, so this is a
-- manual, self-contained script: it stubs the auth.* functions and the
-- handful of supplier_profiles columns the trigger touches in a scratch
-- database, applies the current migration, then asserts both the new
-- self-write guard and the pre-existing locked-state protections.
--
-- Run against a throwaway database, never against a real project:
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/supplier_profiles_verification_status_guard.test.sql
--   dropdb traverion_rpc_test
--
-- Prints "ALL ASSERTIONS PASSED" and exits 0 on success; raises an
-- exception (non-zero exit) on the first failed assertion.

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select current_setting('test.uid', true)::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('role', coalesce(current_setting('test.jwt_role', true), 'authenticated'));
$$;

drop table if exists public.supplier_profiles cascade;

create table public.supplier_profiles (
  id uuid primary key,
  display_name text,
  business_type text,
  company_legal_name text,
  company_registration_number text,
  managing_directors text,
  business_address text,
  address_street text,
  address_country text,
  address_city text,
  address_postal_code text,
  tax_id text,
  vat_id text,
  verification_status text,
  verification_submitted_at timestamptz,
  identity_document_path text,
  company_registration_document_path text,
  business_verification_feedback text,
  payout_method text,
  payout_iban text,
  payout_bic text,
  payout_paypal_email text,
  payout_verification_status text,
  payout_verification_submitted_at timestamptz,
  payout_verification_feedback text
);

\ir ../migrations/083_supplier_verification_status_self_write_guard.sql

-- The trigger under test has a `current_user in ('postgres', 'supabase_admin')`
-- bypass intended for the Supabase SQL editor / migration runner. Run the
-- assertions below as an ordinary, non-superuser role so that bypass is not
-- accidentally exercised instead of the real RLS-equivalent client identity
-- (in production this is the `authenticated` Postgres role Supabase uses for
-- all client requests).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant usage on schema auth to test_actor;
grant all on public.supplier_profiles to test_actor;
grant execute on function auth.uid() to test_actor;
grant execute on function auth.jwt() to test_actor;

set session authorization test_actor;

do $$
declare
  v_fresh uuid := gen_random_uuid();
  v_pending_locked uuid := gen_random_uuid();
  v_verified uuid := gen_random_uuid();
  v_failed boolean;
begin
  perform set_config('test.jwt_role', 'authenticated', false);

  insert into public.supplier_profiles (id, verification_status, payout_verification_status)
  values (v_fresh, null, null);

  -- Case 1: fresh, never-submitted supplier tries to self-write
  -- verification_status = 'verified' directly -> must be blocked
  -- (this is the vulnerability: fresh rows are not "locked" yet).
  v_failed := false;
  begin
    update public.supplier_profiles set verification_status = 'verified' where id = v_fresh;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 1 FAILED: fresh supplier could self-write verification_status = verified';
  end if;
  raise notice 'Case 1 PASSED: fresh supplier cannot self-verify business status';

  -- Case 2: same fresh supplier tries payout_verification_status = 'verified' -> blocked.
  v_failed := false;
  begin
    update public.supplier_profiles set payout_verification_status = 'verified' where id = v_fresh;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 2 FAILED: fresh supplier could self-write payout_verification_status = verified';
  end if;
  raise notice 'Case 2 PASSED: fresh supplier cannot self-verify payout status';

  -- Case 3: fresh supplier tries to self-write 'rejected' directly -> blocked too
  -- (only 'pending' is a legitimate supplier-initiated value).
  v_failed := false;
  begin
    update public.supplier_profiles set verification_status = 'rejected' where id = v_fresh;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 3 FAILED: fresh supplier could self-write verification_status = rejected';
  end if;
  raise notice 'Case 3 PASSED: fresh supplier cannot self-reject business status';

  -- Case 4: legitimate submission -- supplier sets verification_status = 'pending'
  -- along with verification_submitted_at, exactly as SupplierSettingsPages.tsx does -> must succeed.
  update public.supplier_profiles
  set verification_status = 'pending',
      verification_submitted_at = now(),
      business_type = 'company'
  where id = v_fresh;
  if (select verification_status from public.supplier_profiles where id = v_fresh) <> 'pending' then
    raise exception 'Case 4 FAILED: legitimate business verification submission was blocked';
  end if;
  raise notice 'Case 4 PASSED: legitimate business verification submission (-> pending) succeeds';

  -- Case 5: legitimate payout submission -- supplier sets payout_verification_status = 'pending' -> must succeed.
  update public.supplier_profiles
  set payout_verification_status = 'pending',
      payout_verification_submitted_at = now(),
      payout_method = 'bank',
      payout_iban = 'FI00 1234 5600 0007 85',
      payout_bic = 'NDEAFIHH'
  where id = v_fresh;
  if (select payout_verification_status from public.supplier_profiles where id = v_fresh) <> 'pending' then
    raise exception 'Case 5 FAILED: legitimate payout verification submission was blocked';
  end if;
  raise notice 'Case 5 PASSED: legitimate payout verification submission (-> pending) succeeds';

  -- Case 6: that same now-pending-and-submitted row is locked; a further
  -- self-write attempt to 'verified' must still be blocked (guard applies
  -- on top of, not instead of, the existing lock).
  v_failed := false;
  begin
    update public.supplier_profiles set verification_status = 'verified' where id = v_fresh;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: pending+submitted (locked) supplier could self-verify business status';
  end if;
  raise notice 'Case 6 PASSED: locked pending business row still blocks self-verification';

  -- Case 7: service_role (the real admin-supplier-verification Edge Function
  -- identity) can still set verification_status = 'verified' -- guard must
  -- not break the legitimate admin approval path.
  insert into public.supplier_profiles (id, verification_status, payout_verification_status)
  values (v_verified, 'pending', 'pending');
  perform set_config('test.jwt_role', 'service_role', false);
  update public.supplier_profiles set verification_status = 'verified' where id = v_verified;
  if (select verification_status from public.supplier_profiles where id = v_verified) <> 'verified' then
    raise exception 'Case 7 FAILED: service_role (admin) could not approve business verification';
  end if;
  update public.supplier_profiles set payout_verification_status = 'verified' where id = v_verified;
  if (select payout_verification_status from public.supplier_profiles where id = v_verified) <> 'verified' then
    raise exception 'Case 7 FAILED: service_role (admin) could not approve payout verification';
  end if;
  perform set_config('test.jwt_role', 'authenticated', false);

  -- Case 8: pre-existing locked-state protection is untouched -- an already
  -- business-verified supplier still cannot edit locked business fields.
  v_failed := false;
  begin
    update public.supplier_profiles set company_legal_name = 'New Name Ltd' where id = v_verified;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 8 FAILED: verified supplier could still edit locked business fields (pre-existing protection regressed)';
  end if;
  raise notice 'Case 8 PASSED: pre-existing locked-field protection for verified suppliers is unaffected';

  -- Case 9: an unrelated field can still be edited on an unlocked fresh
  -- profile (guard must not be an overbroad blanket lock).
  insert into public.supplier_profiles (id, display_name, verification_status, payout_verification_status)
  values (v_pending_locked, 'Old Name', null, null);
  update public.supplier_profiles set display_name = 'New Display Name' where id = v_pending_locked;
  if (select display_name from public.supplier_profiles where id = v_pending_locked) <> 'New Display Name' then
    raise exception 'Case 9 FAILED: unrelated field edit on an unlocked profile was wrongly blocked';
  end if;
  raise notice 'Case 9 PASSED: unrelated field edits on unlocked profiles remain unaffected';

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
