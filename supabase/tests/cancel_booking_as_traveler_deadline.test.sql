-- Regression for cancel_booking_as_traveler hard deadline stop (mig 265).
-- Throwaway DB only — see cancel_booking_as_traveler.test.sql header.
--
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/cancel_booking_as_traveler_deadline.test.sql
--   dropdb traverion_rpc_test

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select current_setting('test.uid', true)::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', current_setting('test.email', true));
$$;
create or replace function public.jwt_verified_email() returns text language sql stable as $$
  select coalesce(current_setting('test.email', true), '');
$$;
create or replace function public.booking_traveler_owns(p_guest_user_id uuid, p_guest_email text)
returns boolean language sql stable as $$
  select p_guest_user_id is not distinct from auth.uid()
    or lower(trim(coalesce(p_guest_email, ''))) = lower(trim(coalesce(current_setting('test.email', true), '')));
$$;
create or replace function public.booking_is_stay_night(b public.bookings)
returns boolean language sql stable as $$
  select coalesce((b.purchase_snapshot->>'nights')::int, 0) > 0
    or nullif(trim(coalesce(b.purchase_snapshot->>'checkIn', '')), '') is not null;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

drop table if exists public.booking_refund_instructions cascade;
drop table if exists public.cancellation_requests cascade;
drop table if exists public.booking_messages cascade;
drop table if exists public.supplier_ledger_entries cascade;
drop table if exists public.bookings cascade;
drop table if exists public.listings cascade;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  listing_extras jsonb default '{}'::jsonb
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
  pickup_time time,
  cancelled_at timestamptz,
  refund_choice text,
  purchase_snapshot jsonb default '{}'::jsonb
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

create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid,
  status text,
  responded_at timestamptz,
  responded_by uuid
);

create table public.booking_refund_instructions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid
);

create or replace function public.ensure_stay_cancel_refund_instruction(
  p_booking_id uuid, p_reason text, p_actor uuid
) returns jsonb language plpgsql as $$
begin
  return jsonb_build_object('ok', true, 'id', gen_random_uuid()::text, 'skipped', false);
end;
$$;

\ir ../migrations/265_traveler_self_cancel_deadline_hard_stop.sql

do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_far uuid;
  v_near uuid;
  v_exact uuid;
  v_nonref uuid;
  v_unpaid uuid;
  v_pickup uuid;
  v_frozen uuid;
  v_result jsonb;
  v_status text;
  v_ledger int;
  v_helsinki_now timestamp := (now() at time zone 'Europe/Helsinki');
  v_far_date date := (v_helsinki_now + interval '5 days')::date;
  v_near_date date := v_helsinki_now::date;
  v_near_hm text := to_char(v_helsinki_now + interval '2 hours', 'HH24:MI');
  v_exact_start timestamp := v_helsinki_now + interval '24 hours';
  v_exact_date date := v_exact_start::date;
  v_exact_hm text := to_char(v_exact_start, 'HH24:MI');
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier)
  returning id into v_listing;

  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'confirmed', 'paid', v_far_date,
    jsonb_build_object('startTimeHm', '18:00', 'departureTimezone', 'Europe/Helsinki', 'freeCancelHours', 24,
      'listingTitle', 'Far', 'capturedAt', now()::text))
  returning id into v_far;

  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'confirmed', 'paid', v_near_date,
    jsonb_build_object('startTimeHm', v_near_hm, 'departureTimezone', 'Europe/Helsinki', 'freeCancelHours', 24,
      'listingTitle', 'Near', 'capturedAt', now()::text))
  returning id into v_near;

  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'confirmed', 'paid', v_exact_date,
    jsonb_build_object('startTimeHm', v_exact_hm, 'departureTimezone', 'Europe/Helsinki', 'freeCancelHours', 24,
      'listingTitle', 'Exact', 'capturedAt', now()::text))
  returning id into v_exact;

  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'confirmed', 'paid', v_far_date,
    jsonb_build_object('startTimeHm', '18:00', 'departureTimezone', 'Europe/Helsinki',
      'cancellationPreset', 'non_refundable', 'freeCancelHours', null,
      'listingTitle', 'NR', 'capturedAt', now()::text))
  returning id into v_nonref;

  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'pending', 'pending', v_near_date,
    jsonb_build_object('startTimeHm', v_near_hm, 'departureTimezone', 'Europe/Helsinki',
      'listingTitle', 'Unpaid', 'capturedAt', now()::text))
  returning id into v_unpaid;

  -- Pickup tour: confirmed pickup earlier than departure — cancel clock uses pickup.
  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, pickup_time, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'confirmed', 'paid', v_far_date, '10:00',
    jsonb_build_object('startTimeHm', '18:00', 'fulfillment', 'pickup', 'departureTimezone', 'Europe/Helsinki',
      'freeCancelHours', 24, 'listingTitle', 'Pickup', 'capturedAt', now()::text))
  returning id into v_pickup;

  -- Frozen cancel start survives a later (earlier) pickup_time.
  insert into public.bookings (listing_id, guest_user_id, guest_email, status, payment_status, booking_date, pickup_time, purchase_snapshot)
  values (v_listing, v_traveler, 't@example.com', 'confirmed', 'paid', v_far_date, '08:00',
    jsonb_build_object('startTimeHm', '18:00', 'fulfillment', 'pickup', 'selfCancelStartHm', '12:00',
      'departureTimezone', 'Europe/Helsinki', 'freeCancelHours', 24,
      'listingTitle', 'Frozen', 'capturedAt', now()::text))
  returning id into v_frozen;

  insert into public.supplier_ledger_entries (supplier_id, booking_id, kind, amount, currency, reason, source_id)
  values
    (v_supplier, v_far, 'booking_earnings', 100, 'EUR', 't', v_far::text),
    (v_supplier, v_near, 'booking_earnings', 100, 'EUR', 't', v_near::text);

  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 't@example.com', false);

  -- Before deadline: cancel OK + full_refund
  select public.cancel_booking_as_traveler(v_far, 'full_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, false) is not true or (v_result->>'refund_choice') <> 'full_refund' then
    raise exception 'BEFORE FAILED: %', v_result;
  end if;

  -- After deadline: reject, no mutate
  select public.cancel_booking_as_traveler(v_near, 'full_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, true) is not false or (v_result->>'code') <> 'deadline_passed' then
    raise exception 'AFTER FAILED: expected deadline_passed, got %', v_result;
  end if;
  select status into v_status from public.bookings where id = v_near;
  if v_status <> 'confirmed' then
    raise exception 'AFTER FAILED: status mutated to %', v_status;
  end if;
  select count(*) into v_ledger from public.supplier_ledger_entries where booking_id = v_near and kind = 'refund';
  if v_ledger <> 0 then
    raise exception 'AFTER FAILED: ledger refund created';
  end if;

  -- Exact deadline: reject
  select public.cancel_booking_as_traveler(v_exact, 'no_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, true) is not false or (v_result->>'code') <> 'deadline_passed' then
    raise exception 'EXACT FAILED: %', v_result;
  end if;
  select status into v_status from public.bookings where id = v_exact;
  if v_status <> 'confirmed' then
    raise exception 'EXACT FAILED: status mutated';
  end if;

  -- Non-refundable: reject
  select public.cancel_booking_as_traveler(v_nonref, 'full_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, true) is not false or (v_result->>'code') <> 'deadline_passed' then
    raise exception 'NONREF FAILED: %', v_result;
  end if;

  -- Unpaid: still cancellable after "deadline"
  select public.cancel_booking_as_traveler(v_unpaid, 'full_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, false) is not true or (v_result->>'unpaid_checkout') <> 'true' then
    raise exception 'UNPAID FAILED: %', v_result;
  end if;

  -- Pickup far booking still cancellable (uses 10:00 pickup, still >24h from now on far date)
  select public.cancel_booking_as_traveler(v_pickup, 'full_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'PICKUP FAILED: %', v_result;
  end if;

  select public.cancel_booking_as_traveler(v_frozen, 'full_refund') into v_result;
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'FROZEN FAILED: %', v_result;
  end if;

  raise notice 'ALL DEADLINE ASSERTIONS PASSED';
end $$;
