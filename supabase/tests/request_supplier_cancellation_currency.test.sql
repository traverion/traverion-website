-- Regression test for public.request_supplier_cancellation() /
-- public.respond_cancellation_request() as fixed by migration 084
-- (server-side fee currency, matching the pre-existing server-side fee
-- amount classification).
--
-- This repo has no Deno/pgTAP test runner wired into CI, so this is a
-- manual, self-contained script: it stubs the auth.* functions and the
-- handful of tables these RPCs touch in a scratch database, applies the
-- current migration, then asserts the client cannot control the
-- financial ledger's currency label.
--
-- Run against a throwaway database, never against a real project:
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/request_supplier_cancellation_currency.test.sql
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
  select jsonb_build_object('email', current_setting('test.email', true));
$$;

drop table if exists public.booking_messages cascade;
drop table if exists public.supplier_ledger_entries cascade;
drop table if exists public.cancellation_requests cascade;
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
  currency text default 'USD',
  cancellation_reason text,
  refund_choice text,
  cancelled_at timestamptz
);

create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by text not null check (requested_by in ('traveler', 'supplier')),
  requester_user_id uuid,
  reason_code text not null,
  reason_text text not null default '',
  evidence_note text,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'declined', 'expired', 'resolved')),
  policy_snapshot jsonb not null default '{}'::jsonb,
  applied_fee numeric not null default 0,
  fee_currency text not null default 'EUR',
  traveler_refund_expectation text not null default 'full_refund',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  responded_by uuid
);

create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in (
    'booking_earnings', 'refund', 'platform_commission',
    'cancellation_penalty', 'adjustment', 'payout'
  )),
  amount numeric not null,
  currency text not null default 'EUR',
  reason text not null,
  source_id text not null,
  policy_id text,
  created_at timestamptz not null default now(),
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

\ir ../migrations/084_supplier_cancellation_fee_currency_server_side.sql

-- respond_cancellation_request() is unchanged by 084, but is needed to
-- observe the effect on the real financial ledger row. Pull in the exact
-- current production body (061 does not touch it; 055 defines it).
create or replace function public.respond_cancellation_request(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.cancellation_requests%rowtype;
  v_supplier uuid;
  v_guest_user uuid;
  v_guest_email text;
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_ledger_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;

  select l.supplier_id, b.guest_user_id, b.guest_email
    into v_supplier, v_guest_user, v_guest_email
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = v_req.booking_id;

  if not (
    v_guest_user = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;

  if v_req.status = 'accepted' then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;

  if not p_accept then
    update public.cancellation_requests
      set status = 'declined', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
    insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
    values (v_req.booking_id, 'system', v_uid, 'Traveler declined the cancellation request. The booking stays active.');
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'declined');
  end if;

  update public.cancellation_requests
    set status = 'accepted', responded_at = now(), responded_by = v_uid
  where id = v_req.id and status = 'requested';
  if not found then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_req.reason_code,
      refund_choice = 'full_refund'
    where id = v_req.booking_id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if v_req.applied_fee > 0 and v_supplier is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier,
      v_req.booking_id,
      'cancellation_penalty',
      - abs(v_req.applied_fee),
      v_req.fee_currency,
      'Supplier cancellation fee',
      v_req.id::text,
      coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_cancel_v1')
    )
    on conflict (kind, source_id) do nothing
    returning id into v_ledger_id;
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_req.booking_id, 'system', v_uid, 'Traveler accepted the cancellation. This booking is cancelled.');

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id
  );
end;
$$;

do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_traveler uuid := gen_random_uuid();
  v_listing uuid;
  v_booking_gbp uuid;
  v_req_id uuid;
  v_result jsonb;
  v_stored_currency text;
  v_ledger_currency text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;

  -- Booking was really paid in GBP (server-authoritative, set from the
  -- real Stripe checkout session at payment time).
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status, currency)
  values (gen_random_uuid(), v_listing, v_traveler, 'traveler@example.com', 'confirmed', 'paid', 'GBP')
  returning id into v_booking_gbp;

  perform set_config('test.uid', v_supplier::text, false);

  -- Malicious/careless supplier requests cancellation and claims the fee
  -- currency is JPY (or anything else) -- must be ignored; the booking's
  -- real GBP currency must be what gets stored and later ledgered.
  select public.request_supplier_cancellation(
    v_booking_gbp, 'OVERBOOKING', 'We double booked this slot by mistake.',
    null, '{}'::jsonb, 999, 'JPY'
  ) into v_result;

  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 1 FAILED: legitimate cancellation request was rejected: %', v_result;
  end if;
  v_req_id := (v_result ->> 'id')::uuid;

  select fee_currency into v_stored_currency from public.cancellation_requests where id = v_req_id;
  if v_stored_currency <> 'GBP' then
    raise exception 'Case 1 FAILED: client-supplied fee currency (JPY) was stored instead of the booking''s real currency (GBP); got %', v_stored_currency;
  end if;
  raise notice 'Case 1 PASSED: client-supplied fee_currency (JPY) ignored; booking''s real currency (GBP) stored';

  if (v_result ->> 'applied_fee')::numeric <> 20 then
    raise exception 'Case 2 FAILED: client-supplied fee amount (999) leaked into the server-computed fee; got %', (v_result ->> 'applied_fee');
  end if;
  raise notice 'Case 2 PASSED: fee amount remains server-computed (20), unaffected by the currency fix';

  -- Traveler accepts; the real financial ledger row must carry the
  -- correct (GBP) currency, not the attacker-supplied JPY.
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);
  select public.respond_cancellation_request(v_req_id, true) into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 3 FAILED: traveler could not accept the cancellation: %', v_result;
  end if;

  select currency into v_ledger_currency
  from public.supplier_ledger_entries
  where booking_id = v_booking_gbp and kind = 'cancellation_penalty';
  if v_ledger_currency <> 'GBP' then
    raise exception 'Case 3 FAILED: supplier ledger entry was written with the wrong currency; expected GBP, got %', v_ledger_currency;
  end if;
  raise notice 'Case 3 PASSED: supplier_ledger_entries.currency correctly reflects the booking''s real currency (GBP), not the client-supplied value';

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
