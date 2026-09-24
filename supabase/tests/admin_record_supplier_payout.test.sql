-- Phase 587: proves and closes a payout-readiness honesty gap.
--
-- AdminFinancePanel.tsx / SupplierEarnings.tsx already display "Paid out to
-- suppliers" / "Pending payout" figures sourced from public.supplier_earnings
-- (migration 002), a per-period payout-batch table whose RLS already denies
-- ALL client insert/update ("system only"). Grepping every migration, every
-- Edge Function, and all of src turned up ZERO write paths into this table
-- anywhere in the codebase -- it has never been inserted into since it was
-- created. That means those UI figures are structurally guaranteed to read
-- 0 forever, no matter how many real payouts the founder actually sends,
-- while the UI presents them as real, labeled, computed figures ("Recorded
-- payout periods, status Paid") -- placeholder functionality presented as
-- real, in the platform's own money-truth panel.
--
-- Fixed via a new SECURITY DEFINER RPC, admin_record_supplier_payout,
-- granted only to service_role (same trust pattern as
-- record_paid_booking_earnings / reverse_paid_booking_earnings), reachable
-- only through admin-supplier-verification's existing assertAdmin() gate.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_094
--   sudo -u postgres psql -d traverion_test_094 -f this_file.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated');
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('email', coalesce(nullif(current_setting('test.email', true), ''), ''));
$$;

create extension if not exists pgcrypto;

-- Minimal listings stub: migration 002 creates listing_discounts with an FK
-- to public.listings(id); not otherwise exercised by this test.
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid
);

-- Minimal set_updated_at() stub: real migrations assume it pre-exists
-- (created by an earlier migration not included in this scoped scratch DB).
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Real, committed migrations, included verbatim. 012_supplier_features.sql
-- is NOT included here: its only supplier_earnings-relevant section adds
-- two unrelated nullable columns (invoice_number, payment_reference) not
-- touched by this feature, and the rest of that file depends on tables
-- (supplier_profiles, etc.) outside this test's minimal scratch schema.
\ir ../migrations/002_discounts_and_earnings.sql
\ir ../migrations/094_admin_record_supplier_payout.sql

drop role if exists test_actor_094;
create role test_actor_094 login;
grant usage on schema public to test_actor_094;
grant usage on schema auth to test_actor_094;
grant select, insert, update, delete on all tables in schema public to test_actor_094;
grant execute on all functions in schema public to test_actor_094;
alter default privileges in schema public grant select on tables to test_actor_094;

do $$
declare
  v_admin uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_supplier_a uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_supplier_b uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_result jsonb;
  v_row_count int;
begin
  insert into auth.users (id) values (v_admin), (v_supplier_a), (v_supplier_b);

  -------------------------------------------------------------------------
  -- Case 1: service_role (default superuser session here) records a real,
  -- completed manual payout for supplier A. Must succeed and be readable.
  -------------------------------------------------------------------------
  select public.admin_record_supplier_payout(
    v_supplier_a, 500.00, 'eur', date '2026-09-01', date '2026-09-30',
    'paid', 'Wire transfer ref TRV-2026-09-01', v_admin
  ) into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 1 FAILED: expected ok:true, got %', v_result;
  end if;

  select count(*) into v_row_count
  from public.supplier_earnings
  where supplier_id = v_supplier_a and status = 'paid' and amount = 500.00 and currency = 'EUR'
    and note = 'Wire transfer ref TRV-2026-09-01' and recorded_by = v_admin;
  if v_row_count <> 1 then
    raise exception 'Case 1 FAILED: expected exactly one matching paid row, found %', v_row_count;
  end if;
  raise notice 'Case 1 PASSED: real manual payout recorded and readable.';

  -------------------------------------------------------------------------
  -- Case 2: same RPC records a pending payout (initiated, not yet
  -- confirmed landed) for supplier B. Must succeed with status pending.
  -------------------------------------------------------------------------
  select public.admin_record_supplier_payout(
    v_supplier_b, 120.50, 'usd', date '2026-10-01', date '2026-10-07', 'pending'
  ) into v_result;
  if not (v_result ->> 'ok')::boolean or (v_result ->> 'status') <> 'pending' then
    raise exception 'Case 2 FAILED: expected ok:true status:pending, got %', v_result;
  end if;
  raise notice 'Case 2 PASSED: pending payout recorded.';

  -------------------------------------------------------------------------
  -- Case 3: invalid input is rejected with ok:false, not a raw SQL error --
  -- non-positive amount, unknown supplier, bad currency, inverted period,
  -- bad status.
  -------------------------------------------------------------------------
  select public.admin_record_supplier_payout(v_supplier_a, 0, 'EUR', date '2026-09-01', date '2026-09-30') into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'Case 3a FAILED: zero amount should be rejected, got %', v_result; end if;

  select public.admin_record_supplier_payout(v_supplier_a, -50, 'EUR', date '2026-09-01', date '2026-09-30') into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'Case 3b FAILED: negative amount should be rejected, got %', v_result; end if;

  select public.admin_record_supplier_payout('dddddddd-dddd-dddd-dddd-dddddddddddd', 50, 'EUR', date '2026-09-01', date '2026-09-30') into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'Case 3c FAILED: unknown supplier should be rejected, got %', v_result; end if;

  select public.admin_record_supplier_payout(v_supplier_a, 50, '', date '2026-09-01', date '2026-09-30') into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'Case 3d FAILED: empty currency should be rejected, got %', v_result; end if;

  select public.admin_record_supplier_payout(v_supplier_a, 50, 'EUR', date '2026-09-30', date '2026-09-01') into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'Case 3e FAILED: inverted period should be rejected, got %', v_result; end if;

  select public.admin_record_supplier_payout(v_supplier_a, 50, 'EUR', date '2026-09-01', date '2026-09-30', 'refunded') into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'Case 3f FAILED: bad status should be rejected, got %', v_result; end if;

  raise notice 'Case 3 PASSED: all six invalid-input variants rejected without a raw SQL error.';

  raise notice 'All positive/negative RPC-level cases PASSED.';
end $$;

-------------------------------------------------------------------------
-- Case 4: an ordinary authenticated client (test_actor_094, no special grant
-- beyond what the app's real roles get) cannot execute the admin RPC
-- directly -- it must be reachable only via service_role.
-------------------------------------------------------------------------
revoke execute on function public.admin_record_supplier_payout(uuid, numeric, text, date, date, text, text, uuid) from test_actor_094;

set session authorization test_actor_094;
set role test_actor_094;

do $$
begin
  begin
    perform public.admin_record_supplier_payout(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, 'EUR', date '2026-09-01', date '2026-09-30'
    );
    raise exception 'Case 4 FAILED: authenticated caller should not be able to execute the admin RPC';
  exception
    when insufficient_privilege then
      raise notice 'Case 4 PASSED: authenticated caller correctly denied execute on admin_record_supplier_payout.';
  end;
end $$;

-------------------------------------------------------------------------
-- Case 5: an ordinary authenticated client also cannot bypass the RPC by
-- inserting into supplier_earnings directly -- pre-existing RLS ("system
-- only"), reconfirmed unregressed by this migration.
-------------------------------------------------------------------------
select set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
select set_config('test.role', 'authenticated', false);

do $$
begin
  begin
    insert into public.supplier_earnings (supplier_id, period_start, period_end, amount, currency, status)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', date '2026-09-01', date '2026-09-30', 9999, 'EUR', 'paid');
    raise exception 'Case 5 FAILED: authenticated client insert into supplier_earnings should be blocked by RLS';
  exception
    when insufficient_privilege then
      raise notice 'Case 5 PASSED: direct client insert into supplier_earnings still blocked by RLS.';
  end;
end $$;

reset role;
reset session authorization;

-------------------------------------------------------------------------
-- Case 6: a supplier can read their own payout rows but not another
-- supplier's -- pre-existing RLS ("Suppliers can view own earnings"),
-- reconfirmed unregressed.
-------------------------------------------------------------------------
set session authorization test_actor_094;
set role test_actor_094;
select set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
select set_config('test.role', 'authenticated', false);

do $$
declare
  v_own_count int;
  v_other_count int;
begin
  select count(*) into v_own_count from public.supplier_earnings where supplier_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select count(*) into v_other_count from public.supplier_earnings where supplier_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if v_own_count < 1 then
    raise exception 'Case 6 FAILED: supplier A should see their own recorded payout row, saw %', v_own_count;
  end if;
  if v_other_count <> 0 then
    raise exception 'Case 6 FAILED: supplier A should not see supplier B''s payout row, saw %', v_other_count;
  end if;
  raise notice 'Case 6 PASSED: supplier read scoping unregressed (own visible, other''s hidden).';
end $$;

reset role;
reset session authorization;

\echo 'admin_record_supplier_payout.test.sql: ALL CASES PASSED'
