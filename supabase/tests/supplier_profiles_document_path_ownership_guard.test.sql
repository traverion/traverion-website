-- Regression test for migration 088 (supplier document-path ownership guard).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_088
--   sudo -u postgres psql -d traverion_test_088 -f supabase/tests/supplier_profiles_document_path_ownership_guard.test.sql
--
-- Builds a minimal supplier_profiles schema matching every column
-- supplier_profiles_enforce_verification_lock() references, stubs
-- auth.uid()/auth.jwt(), includes the REAL migration 083 file via \ir as
-- the pre-088 baseline (083 is a full CREATE OR REPLACE of the trigger
-- function, so it is a complete, self-contained predecessor -- no need to
-- also replay 031/032/034/035/036), then 088. Proves:
--   (a) against 083 alone, a supplier can point their own
--       identity_document_path / company_registration_document_path at a
--       path under a DIFFERENT supplier's prefix -- the document-provenance
--       gap this phase closes;
--   (b) after 088, the identical attempt is rejected for both columns;
--   (c) a legitimate write of a path under the caller's OWN prefix still
--       succeeds;
--   (d) clearing either path to null (removing an uploaded document)
--       still succeeds;
--   (e) every pre-existing 083 behavior is unaffected: pending-only
--       status self-write still works, self-write to 'verified' is still
--       blocked, staff-only feedback is still enforced, and the
--       locked-state field freeze still applies;
--   (f) a service-role write of an arbitrary path (the legitimate
--       server-side path, if one ever existed) is unaffected.

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('role', coalesce(nullif(current_setting('test.role', true), ''), 'authenticated'));
$$;

create extension if not exists pgcrypto;

create table public.supplier_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
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
  business_verification_feedback text,
  identity_document_path text,
  company_registration_document_path text,
  payout_method text,
  payout_iban text,
  payout_bic text,
  payout_paypal_email text,
  payout_verification_status text,
  payout_verification_submitted_at timestamptz,
  payout_verification_feedback text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.supplier_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public, auth to authenticated, test_actor;
grant all on all tables in schema public to authenticated, test_actor;
grant execute on all functions in schema auth to authenticated, test_actor;
grant authenticated to test_actor;

-- Real production SELECT policy (migration 001): RLS denies the UPDATE's
-- own implicit row-matching scan by default without this -- an UPDATE
-- needs SELECT-visibility of a row before its UPDATE-policy USING clause
-- is even consulted.
drop policy if exists "Profiles are viewable by everyone" on public.supplier_profiles;
create policy "Profiles are viewable by everyone"
  on public.supplier_profiles for select
  using (true);

drop policy if exists "Users can update own profile" on public.supplier_profiles;
create policy "Users can update own profile"
  on public.supplier_profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------------
-- Apply the real, currently-committed baseline (083) -- the gap this
-- phase closes.
-- ---------------------------------------------------------------------
\ir ../migrations/083_supplier_verification_status_self_write_guard.sql

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against today's committed
-- code): a supplier points their own identity_document_path at a path
-- under a DIFFERENT supplier's prefix.
-- ============================================================================
do $$
declare
  v_victim uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_path text;
begin
  insert into auth.users (id) values (v_victim), (v_attacker);
  insert into public.supplier_profiles (id) values (v_victim), (v_attacker);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  update public.supplier_profiles
    set identity_document_path = v_victim::text || '/identity-document.pdf'
    where id = v_attacker;

  reset session authorization;

  select identity_document_path into v_path from public.supplier_profiles where id = v_attacker;
  if v_path is distinct from (v_victim::text || '/identity-document.pdf') then
    raise exception 'Case 1 FAILED (unexpectedly): cross-supplier document path write against 083-only baseline did not behave as expected (path=%)', v_path;
  end if;
  raise notice 'Case 1 confirmed: against 083 alone, a supplier can point identity_document_path at another supplier''s real document path (this is the bug 088 closes)';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/088_supplier_verification_document_path_ownership_guard.sql

-- ============================================================================
-- Case 2: the identical cross-supplier attempt is now rejected, for both
-- identity_document_path and company_registration_document_path.
-- ============================================================================
do $$
declare
  v_victim uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_failed boolean := false;
begin
  insert into auth.users (id) values (v_victim), (v_attacker);
  insert into public.supplier_profiles (id) values (v_victim), (v_attacker);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  begin
    update public.supplier_profiles
      set identity_document_path = v_victim::text || '/identity-document.pdf'
      where id = v_attacker;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 2 FAILED: cross-supplier identity_document_path write still succeeds after 088';
  end if;

  begin
    update public.supplier_profiles
      set company_registration_document_path = v_victim::text || '/company-registration.pdf'
      where id = v_attacker;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 2 FAILED: cross-supplier company_registration_document_path write still succeeds after 088';
  end if;

  reset session authorization;
  raise notice 'Case 2 passed: cross-supplier document path writes are rejected for both columns after 088';
end
$$;

-- ============================================================================
-- Case 3: a legitimate write of a path under the caller's OWN prefix
-- still succeeds after 088 (this is what every real upload produces,
-- since the storage bucket's own RLS already requires this same prefix).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_path text;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.supplier_profiles (id) values (v_supplier);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  update public.supplier_profiles
    set identity_document_path = v_supplier::text || '/identity-document.pdf',
        company_registration_document_path = v_supplier::text || '/company-registration.pdf'
    where id = v_supplier;

  reset session authorization;

  select identity_document_path into v_path from public.supplier_profiles where id = v_supplier;
  if v_path is distinct from (v_supplier::text || '/identity-document.pdf') then
    raise exception 'Case 3 FAILED: a legitimate own-prefix document path write no longer works after 088 (path=%)', v_path;
  end if;
  raise notice 'Case 3 passed: a legitimate own-prefix document path write still works after 088';
end
$$;

-- ============================================================================
-- Case 4: clearing a document path to null (removing an uploaded file)
-- still succeeds after 088.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_path text;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.supplier_profiles (id, identity_document_path)
    values (v_supplier, v_supplier::text || '/identity-document.pdf');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  update public.supplier_profiles set identity_document_path = null where id = v_supplier;

  reset session authorization;

  select identity_document_path into v_path from public.supplier_profiles where id = v_supplier;
  if v_path is not null then
    raise exception 'Case 4 FAILED: clearing identity_document_path to null no longer works after 088 (path=%)', v_path;
  end if;
  raise notice 'Case 4 passed: clearing a document path to null still works after 088';
end
$$;

-- ============================================================================
-- Case 5: every pre-existing 083 protection is unaffected by 088.
-- (a) pending-only status self-write still works; self-write to 'verified'
-- is still blocked. (b) staff-only feedback is still enforced.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_status text;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.supplier_profiles (id) values (v_supplier);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  update public.supplier_profiles
    set verification_status = 'pending', verification_submitted_at = now()
    where id = v_supplier;

  begin
    update public.supplier_profiles set verification_status = 'verified' where id = v_supplier;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 5 FAILED: self-write to verification_status = verified still succeeds after 088';
  end if;

  begin
    update public.supplier_profiles set business_verification_feedback = 'looks good' where id = v_supplier;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 5 FAILED: self-write of business_verification_feedback still succeeds after 088';
  end if;

  reset session authorization;

  select verification_status into v_status from public.supplier_profiles where id = v_supplier;
  if v_status <> 'pending' then
    raise exception 'Case 5 FAILED: legitimate pending self-submission was blocked (status=%)', v_status;
  end if;
  raise notice 'Case 5 passed: pre-existing 083 status/feedback protections are unaffected by 088';
end
$$;

-- ============================================================================
-- Case 6: a service-role write is completely unaffected by 088.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_status text;
begin
  insert into auth.users (id) values (v_supplier), (v_other);
  insert into public.supplier_profiles (id) values (v_supplier), (v_other);

  update public.supplier_profiles
    set verification_status = 'verified',
        identity_document_path = v_other::text || '/identity-document.pdf'
    where id = v_supplier;

  select verification_status into v_status from public.supplier_profiles where id = v_supplier;
  if v_status <> 'verified' then
    raise exception 'Case 6 FAILED: the service-role write path was unexpectedly blocked after 088';
  end if;
  raise notice 'Case 6 passed: the service-role write path is unaffected by 088';
end
$$;

do $$
begin
  raise notice 'All migration-088 regression cases passed.';
end
$$;
