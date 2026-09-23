-- Regression test for public.cancel_booking_as_traveler (migrations 069, 072, 081).
--
-- This repo has no Deno/pgTAP test runner wired into CI, so this is a manual,
-- self-contained script: it stubs the handful of tables/auth functions the RPC
-- touches in a scratch database, applies the current migration, then asserts
-- the traveler-cancellation policy the RPC is supposed to enforce.
--
-- Run against a throwaway database, never against a real project:
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/cancel_booking_as_traveler.test.sql
--   dropdb traverion_rpc_test
--
-- Prints "ALL ASSERTIONS PASSED" and exits 0 on success; raises an exception
-- (non-zero exit) on the first failed assertion.

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select current_setting('test.uid', true)::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', current_setting('test.email', true));
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

drop table if exists public.booking_messages cascade;
drop table if exists public.supplier_ledger_entries cascade;
drop table if exists public.bookings cascade;
drop table if exists public.listings cascade;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  guest_user_id uuid,
  guest_email text,
  status text default 'confirmed',
  payment_status text default 'paid',
  booking_date date,
  start_time time,
  cancelled_at timestamptz,
  refund_choice text
);

create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  booking_id uuid,
  kind text,
  amount numeric,
  currency text,
  reason text,
  source_id text,
  policy_id text,
  unique (kind, source_id)
);

create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid,
  sender_role text,
  sender_user_id uuid,
  body text,
  created_at timestamptz default now()
);

\ir ../migrations/081_traveler_self_cancel_server_side_policy.sql

do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_far uuid;
  v_near_malicious uuid;
  v_unpaid uuid;
  v_near_honest uuid;
  v_result jsonb;
  v_earnings_reversed boolean;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;

  -- Case A: paid, tour starts in 3 days, honestly asks full_refund -> allowed.
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status, booking_date, start_time)
  values (gen_random_uuid(), v_listing, v_traveler, 'traveler@example.com', 'confirmed', 'paid',
          (now() at time zone 'Europe/Helsinki')::date + 3, '18:00')
  returning id into v_far;

  -- Case B: paid, tour starts in 2 hours, MALICIOUSLY asks full_refund -> must be downgraded.
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status, booking_date, start_time)
  values (gen_random_uuid(), v_listing, v_traveler, 'traveler@example.com', 'confirmed', 'paid',
          (now() at time zone 'Europe/Helsinki')::date,
          to_char((now() at time zone 'Europe/Helsinki') + interval '2 hours', 'HH24:MI')::time)
  returning id into v_near_malicious;

  -- Case C: unpaid checkout -> always no_refund regardless of client choice.
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status, booking_date, start_time)
  values (gen_random_uuid(), v_listing, v_traveler, 'traveler@example.com', 'pending', 'pending',
          (now() at time zone 'Europe/Helsinki')::date + 3, '18:00')
  returning id into v_unpaid;

  -- Case D: paid, tour starts in 2 hours, HONESTLY asks no_refund -> supplier keeps earnings.
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status, booking_date, start_time)
  values (gen_random_uuid(), v_listing, v_traveler, 'traveler@example.com', 'confirmed', 'paid',
          (now() at time zone 'Europe/Helsinki')::date,
          to_char((now() at time zone 'Europe/Helsinki') + interval '2 hours', 'HH24:MI')::time)
  returning id into v_near_honest;

  insert into public.supplier_ledger_entries (supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id)
  values
    (v_supplier, v_far, 'booking_earnings', 100, 'EUR', 'test', v_far::text, 'x'),
    (v_supplier, v_near_malicious, 'booking_earnings', 100, 'EUR', 'test', v_near_malicious::text, 'x'),
    (v_supplier, v_near_honest, 'booking_earnings', 100, 'EUR', 'test', v_near_honest::text, 'x');

  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);

  select public.cancel_booking_as_traveler(v_far, 'full_refund') into v_result;
  if (v_result ->> 'refund_choice') <> 'full_refund' then
    raise exception 'Case A FAILED: expected full_refund, got %', v_result;
  end if;
  select exists(select 1 from public.supplier_ledger_entries where booking_id = v_far and kind = 'refund')
    into v_earnings_reversed;
  if not v_earnings_reversed then
    raise exception 'Case A FAILED: earnings should be reversed for a real full refund';
  end if;

  select public.cancel_booking_as_traveler(v_near_malicious, 'full_refund') into v_result;
  if (v_result ->> 'refund_choice') <> 'no_refund' then
    raise exception 'Case B FAILED (24h policy bypass): expected no_refund, got %', v_result;
  end if;
  select exists(select 1 from public.supplier_ledger_entries where booking_id = v_near_malicious and kind = 'refund')
    into v_earnings_reversed;
  if v_earnings_reversed then
    raise exception 'Case B FAILED: supplier earnings must NOT be reversed when no refund is actually granted';
  end if;

  select public.cancel_booking_as_traveler(v_unpaid, 'full_refund') into v_result;
  if (v_result ->> 'refund_choice') <> 'no_refund' or (v_result ->> 'unpaid_checkout') <> 'true' then
    raise exception 'Case C FAILED: expected no_refund/unpaid_checkout, got %', v_result;
  end if;

  select public.cancel_booking_as_traveler(v_near_honest, 'no_refund') into v_result;
  if (v_result ->> 'refund_choice') <> 'no_refund' then
    raise exception 'Case D FAILED: expected no_refund, got %', v_result;
  end if;
  select exists(select 1 from public.supplier_ledger_entries where booking_id = v_near_honest and kind = 'refund')
    into v_earnings_reversed;
  if v_earnings_reversed then
    raise exception 'Case D FAILED: honest no_refund cancel must leave supplier earnings intact';
  end if;

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
