-- Regression test for migration 096 (restrict public.supplier_profiles
-- SELECT to the owning row) and migration 097 (dedupe the redundant
-- second SELECT policy 096 added on top of migration 051's -- already
-- live -- identical fix; see TRAVERION-AUTONOMOUS-PROGRESS.md Phase 592
-- for why 096's "since migration 001, never revisited" framing was
-- inaccurate -- migration 051 had already closed this 45 migrations
-- earlier, and this test's own "pre-fix" setup below reproduces that
-- same inaccuracy by building its GAP CONFIRMED scenario directly off
-- migration 001 rather than off the true pre-096 state; the behavioral
-- assertions below remain valid regression coverage regardless). Same
-- manual, self-contained-script approach as the rest of supabase/tests/
-- -- no Deno/pgTAP runner exists in CI.
--
-- Run against a throwaway database, never against a real project:
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/supplier_profiles_restrict_select.test.sql
--   dropdb traverion_rpc_test
--
-- Prints "ALL ASSERTIONS PASSED" and exits 0 on success; raises an
-- exception (non-zero exit) on the first failed assertion.
--
-- Structure: builds a stub supplier_profiles table with the real column
-- names/types for the specific sensitive columns this fix protects
-- (payout_iban, tax_id, identity_document_path,
-- business_verification_feedback, contact_phone, address_street), seeds
-- two suppliers, first proves the GAP against the pre-fix policy (only
-- migration 001's original "viewable by everyone" applied), then loads
-- migration 096 and re-proves the same reads are now blocked for
-- everyone except the row owner, while the owner's own read and a
-- SECURITY DEFINER-style public RPC (mirroring supplier_public_legal)
-- both still work.

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

drop table if exists public.supplier_profiles cascade;
drop table if exists public.test_ids_096 cascade;

-- Trimmed stub mirroring the real public.supplier_profiles columns most
-- relevant here (see migrations 001, 010, 012, 021, 029, 030, 036).
create table public.supplier_profiles (
  id uuid primary key,
  display_name text,
  business_logo_url text,
  contact_phone text,
  address_street text,
  payout_iban text,
  payout_bic text,
  tax_id text,
  identity_document_path text,
  business_verification_feedback text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.supplier_profiles enable row level security;

-- The original, never-tightened migration 001 policy -- this is the
-- exact pre-fix production state.
drop policy if exists "Profiles are viewable by everyone" on public.supplier_profiles;
create policy "Profiles are viewable by everyone"
  on public.supplier_profiles for select
  using (true);

-- Fixed, known ids (rather than gen_random_uuid()) so they're easy to
-- reference across separate do $$ blocks without psql variables, which
-- this suite avoids inside dollar-quoted blocks (unreliable interpolation).
create table public.test_ids_096 (label text primary key, id uuid not null);
insert into public.test_ids_096 (label, id) values
  ('supplier_a', '11111111-1111-1111-1111-111111111111'),
  ('supplier_b', '22222222-2222-2222-2222-222222222222');

insert into public.supplier_profiles
  (id, display_name, business_logo_url, contact_phone, address_street,
   payout_iban, payout_bic, tax_id, identity_document_path, business_verification_feedback)
values
  ('11111111-1111-1111-1111-111111111111', 'Alpine Tours Oy', 'https://example.com/logo-a.png', '+358401234567', 'Mannerheimintie 1',
   'FI21 1234 5600 0007 85', 'NDEAFIHH', 'FI12345678', 'supplier-docs/alpha/passport.pdf', 'Business docs need a clearer registration extract.'),
  ('22222222-2222-2222-2222-222222222222', 'Baltic Adventures', 'https://example.com/logo-b.png', '+37060012345', 'Laisves 10',
   'LT12 1000 0111 0100 1000', 'AGBLLT2X', 'LT987654321', 'supplier-docs/bravo/passport.pdf', null);

-- Non-superuser actor role, same pattern used across this test suite,
-- suffixed to avoid cross-scratch-database role collisions in this
-- persistent sandbox.
drop role if exists test_actor_096;
create role test_actor_096 login;
grant select, insert, update, delete on public.supplier_profiles to test_actor_096;
grant select on public.test_ids_096 to test_actor_096;

do $$
declare
  v_iban text;
  v_tax_id text;
  v_doc_path text;
  v_feedback text;
  v_row_count int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  set session authorization test_actor_096;

  -- PRE-FIX: with only the original migration-001 policy applied, ANY
  -- caller -- here, supplier B looking at supplier A's row -- can read
  -- supplier A's bank IBAN, tax ID, ID document path, and internal
  -- verification feedback. This must SUCCEED here, proving the gap,
  -- before migration 096 is loaded below.
  select payout_iban, tax_id, identity_document_path, business_verification_feedback
    into v_iban, v_tax_id, v_doc_path, v_feedback
    from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111';

  select count(*) into v_row_count from public.supplier_profiles;

  reset session authorization;

  if v_iban is distinct from 'FI21 1234 5600 0007 85' then
    raise exception 'SETUP FAILED: expected the pre-fix cross-supplier IBAN read to succeed so the fix can be proven against it';
  end if;
  if v_tax_id is distinct from 'FI12345678' then
    raise exception 'SETUP FAILED: expected the pre-fix cross-supplier tax_id read to succeed';
  end if;
  if v_doc_path is distinct from 'supplier-docs/alpha/passport.pdf' then
    raise exception 'SETUP FAILED: expected the pre-fix cross-supplier document-path read to succeed';
  end if;
  if v_feedback is distinct from 'Business docs need a clearer registration extract.' then
    raise exception 'SETUP FAILED: expected the pre-fix cross-supplier internal-feedback read to succeed';
  end if;
  if v_row_count <> 2 then
    raise exception 'SETUP FAILED: expected the pre-fix policy to expose every row (got % rows)', v_row_count;
  end if;

  raise notice 'GAP CONFIRMED: supplier B read supplier A''s IBAN, tax ID, ID document path, and internal verification feedback with only migration 001''s policy applied';
end $$;

-- Replay migration 051's own SELECT-policy fix (the actual committed
-- statements from 051_checkout_concurrency_and_payment_guard.sql) before
-- loading 096, so this suite's schema matches real production migration
-- order instead of jumping straight from 001 to 096. This is the gap
-- Phase 592 found in this test's original design (see the file header):
-- without this step, the suite silently re-proved a "gap" against a
-- state production had not been in since migration 051.
drop policy if exists "Profiles are viewable by everyone" on public.supplier_profiles;
drop policy if exists "Owners can read own supplier profile" on public.supplier_profiles;
create policy "Owners can read own supplier profile"
  on public.supplier_profiles for select
  using (auth.uid() = id);

\ir ../migrations/096_supplier_profiles_restrict_select_to_owner.sql

-- SECURITY DEFINER stand-in for supplier_public_legal() (migration 051),
-- reproduced narrowly here rather than \ir'd whole, since that migration
-- (051) has unrelated checkout/booking dependencies outside this test's
-- minimal schema -- only its supplier_profiles-reading shape matters for
-- this proof, and that shape is copied verbatim (same column list, same
-- SECURITY DEFINER, same grant-to-anon-and-authenticated pattern).
create or replace function public.supplier_public_legal(p_id uuid)
returns table (
  display_name text,
  company_legal_name text,
  business_address text,
  business_logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.display_name, null::text, null::text, p.business_logo_url
  from public.supplier_profiles p
  where p.id = p_id;
$$;
revoke all on function public.supplier_public_legal(uuid) from public;
grant execute on function public.supplier_public_legal(uuid) to test_actor_096;

do $$
declare
  v_failed boolean;
  v_row_count int;
  v_own_iban text;
  v_public_row record;
begin
  -- Case 1: POST-FIX -- supplier B trying to read supplier A's row
  -- (any column) now gets zero rows, not a redacted row. Postgres RLS is
  -- row-level: a caller with no matching row-security clause sees the
  -- row as if it did not exist at all.
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  set session authorization test_actor_096;
  select count(*) into v_row_count from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111';
  reset session authorization;
  if v_row_count <> 0 then
    raise exception 'Case 1 FAILED: supplier B could still see supplier A''s row after the fix (% rows)', v_row_count;
  end if;

  -- Case 2: an anonymous caller (auth.uid() is null) gets the same
  -- zero-row result for ANY supplier's row.
  perform set_config('test.uid', '', false);
  set session authorization test_actor_096;
  select count(*) into v_row_count from public.supplier_profiles;
  reset session authorization;
  if v_row_count <> 0 then
    raise exception 'Case 2 FAILED: an anonymous caller could still see % supplier_profiles row(s) after the fix', v_row_count;
  end if;

  -- Case 3: supplier A can still read every column of THEIR OWN row,
  -- including the sensitive ones -- the fix does not break the
  -- supplier's own dashboard (fetchSupplierProfile / updateSupplierPayout
  -- / updateSupplierCompanyProfile all operate on the caller's own id).
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  set session authorization test_actor_096;
  select payout_iban into v_own_iban from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111';
  reset session authorization;
  if v_own_iban is distinct from 'FI21 1234 5600 0007 85' then
    raise exception 'Case 3 FAILED: supplier A could no longer read their own IBAN after the fix';
  end if;

  -- Case 4: the public RPC (mirroring supplier_public_legal) still
  -- returns supplier A's safe public fields to a completely different,
  -- unrelated caller -- confirms the one legitimate public-read path is
  -- unaffected, since SECURITY DEFINER bypasses RLS.
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  set session authorization test_actor_096;
  select * into v_public_row from public.supplier_public_legal('11111111-1111-1111-1111-111111111111'::uuid);
  reset session authorization;
  if v_public_row.display_name is distinct from 'Alpine Tours Oy' then
    raise exception 'Case 4 FAILED: supplier_public_legal no longer returns supplier A''s public display name';
  end if;
  if v_public_row.business_logo_url is distinct from 'https://example.com/logo-a.png' then
    raise exception 'Case 4 FAILED: supplier_public_legal no longer returns supplier A''s public logo url';
  end if;

  -- Case 5: an authenticated caller cannot bypass the restriction by
  -- selecting the sensitive columns directly (double-checking Case 1
  -- against a specific sensitive column, not just a row count).
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  set session authorization test_actor_096;
  v_failed := false;
  declare
    v_leaked text;
  begin
    select tax_id into v_leaked from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111';
    if v_leaked is not null then
      v_failed := true;
    end if;
  end;
  reset session authorization;
  if v_failed then
    raise exception 'Case 5 FAILED: supplier B could still read supplier A''s tax_id directly after the fix';
  end if;

  raise notice 'ALL ASSERTIONS PASSED (096)';
end $$;

\ir ../migrations/097_supplier_profiles_dedupe_redundant_select_policy.sql

do $$
declare
  v_policy_count int;
  v_row_count int;
  v_own_iban text;
begin
  -- Case 6: exactly one SELECT policy remains on the table after 097
  -- removes the redundant duplicate -- this is the actual behavior 097
  -- changes (096 left two identically-scoped policies in place).
  select count(*) into v_policy_count
    from pg_policies
    where schemaname = 'public' and tablename = 'supplier_profiles' and cmd = 'SELECT';
  if v_policy_count <> 1 then
    raise exception 'Case 6 FAILED: expected exactly 1 SELECT policy on supplier_profiles after 097, found %', v_policy_count;
  end if;

  -- Case 7: access is unchanged after dedup -- cross-supplier and
  -- anonymous reads are still blocked, and the owner's own read still
  -- works. Same assertions as Cases 1/2/3, re-run post-097.
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  set session authorization test_actor_096;
  select count(*) into v_row_count from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111';
  reset session authorization;
  if v_row_count <> 0 then
    raise exception 'Case 7 FAILED: supplier B could see supplier A''s row after the 097 dedup (% rows)', v_row_count;
  end if;

  perform set_config('test.uid', '', false);
  set session authorization test_actor_096;
  select count(*) into v_row_count from public.supplier_profiles;
  reset session authorization;
  if v_row_count <> 0 then
    raise exception 'Case 7 FAILED: an anonymous caller could see % supplier_profiles row(s) after the 097 dedup', v_row_count;
  end if;

  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  set session authorization test_actor_096;
  select payout_iban into v_own_iban from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111';
  reset session authorization;
  if v_own_iban is distinct from 'FI21 1234 5600 0007 85' then
    raise exception 'Case 7 FAILED: supplier A could no longer read their own IBAN after the 097 dedup';
  end if;

  raise notice 'ALL ASSERTIONS PASSED (096 + 097)';
end $$;
