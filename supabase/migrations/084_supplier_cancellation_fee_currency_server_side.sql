-- Fix: request_supplier_cancellation() correctly classifies the
-- cancellation FEE AMOUNT server-side (its own comment says so: "Server
-- classifies fee. Client snapshot is stored for audit but fee is not
-- client-authoritative", and v_fee is always hardcoded to 0 or 20,
-- never taken from the client-supplied p_applied_fee) -- but the FEE
-- CURRENCY was never given the same treatment. The function stores
-- `upper(trim(coalesce(p_fee_currency, 'EUR')))` -- a raw client-supplied
-- string -- directly into cancellation_requests.fee_currency, with no
-- validation against the booking's real currency.
--
-- respond_cancellation_request() then uses that same
-- cancellation_requests.fee_currency value, unmodified, as the `currency`
-- column when inserting the actual financial ledger row
-- (supplier_ledger_entries, kind = 'cancellation_penalty'):
--
--   insert into public.supplier_ledger_entries (..., currency, ...)
--   values (..., v_req.fee_currency, ...)
--
-- So while a supplier cannot inflate the fee AMOUNT (that part is already
-- correctly server-authoritative), they could mislabel its CURRENCY --
-- e.g. requesting their own cancellation with p_fee_currency = 'JPY' (or
-- any arbitrary string) while the real booking was paid in EUR -- writing
-- a permanent, incorrect-currency financial ledger entry. This corrupts
-- supplier ledger/payout truth and audit records, which the mission's P0
-- "Transaction and booking truth" priority explicitly covers, even though
-- it cannot move real Stripe money on its own (the ledger is an internal
-- accounting table, not a live payment call).
--
-- Fix: derive the fee currency the exact same way the fee amount already
-- is -- server-side, from data the client cannot influence. bookings.currency
-- (migration 011) is set authoritatively from the real Stripe Checkout
-- Session at payment time (see supabase/functions/_shared/
-- promote-paid-from-checkout.ts, which also auto-refunds on any
-- session/booking currency mismatch), so it is the correct source of
-- truth for "what currency was this booking actually paid in". The
-- client-supplied p_fee_currency is kept in policy_snapshot as
-- non-authoritative audit metadata, exactly mirroring how p_applied_fee
-- is already handled.
--
-- Everything else in request_supplier_cancellation (migration 061, the
-- latest prior version) is unchanged: reason/evidence validation, the
-- force-majeure fee classification, the refunded/cancelled/paid-status
-- guards, and the "one open request at a time" check. Verified against a
-- scratch Postgres 16 instance (see supabase/tests/
-- request_supplier_cancellation_currency.test.sql): a supplier-supplied
-- p_fee_currency is now ignored for the ledger-authoritative value and
-- the booking's real currency is used instead; a booking paid in a
-- non-EUR currency is no longer silently mislabeled as EUR (the previous
-- default); the pre-fix version is confirmed to actually accept the
-- attacker-supplied currency, proving the test is meaningful.

create or replace function public.request_supplier_cancellation(
  p_booking_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_evidence_note text default null,
  p_policy_snapshot jsonb default '{}'::jsonb,
  p_applied_fee numeric default 0,
  p_fee_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_status text;
  v_pay text;
  v_booking_currency text;
  v_code text := upper(trim(coalesce(p_reason_code, '')));
  v_text text := left(trim(coalesce(p_reason_text, '')), 2000);
  v_evidence text := left(trim(coalesce(p_evidence_note, '')), 2000);
  v_id uuid;
  v_allowed text[] := array[
    'FORCE_MAJEURE',
    'UNSAFE_WEATHER',
    'GOVERNMENT_RESTRICTION',
    'SUPPLIER_STAFF_UNAVAILABLE',
    'VEHICLE_OR_EQUIPMENT_FAILURE',
    'OVERBOOKING',
    'MINIMUM_PARTICIPATION_NOT_MET',
    'OPERATIONAL_ERROR',
    'TRAVELER_REQUESTED_DIRECTLY',
    'OTHER'
  ];
  v_fm boolean;
  v_fee numeric := coalesce(p_applied_fee, 0);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_code <> all (v_allowed) then
    return jsonb_build_object('ok', false, 'error', 'Choose a cancellation reason.');
  end if;
  if char_length(v_text) < 12 then
    return jsonb_build_object('ok', false, 'error', 'Explain what happened (at least a short sentence).');
  end if;

  v_fm := v_code in ('FORCE_MAJEURE', 'UNSAFE_WEATHER', 'GOVERNMENT_RESTRICTION');
  if v_fm and char_length(v_text) < 24 then
    return jsonb_build_object('ok', false, 'error', 'Force majeure needs a clear explanation of why the trip cannot run.');
  end if;

  -- Server classifies fee. Client snapshot is stored for audit but fee is not client-authoritative.
  if v_fm then
    v_fee := 0;
  else
    v_fee := 20;
  end if;

  select l.supplier_id, b.status, lower(trim(coalesce(b.payment_status, ''))),
    upper(trim(coalesce(b.currency, 'EUR')))
    into v_supplier, v_status, v_pay, v_booking_currency
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null or v_supplier <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'You can only cancel bookings for your own listings.');
  end if;
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;
  if lower(trim(coalesce(v_status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already cancelled.');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Only paid bookings can go through this cancellation request.');
  end if;

  if exists (
    select 1 from public.cancellation_requests cr
    where cr.booking_id = p_booking_id and cr.status = 'requested'
  ) then
    return jsonb_build_object('ok', false, 'error', 'A cancellation request is already waiting for the traveler.');
  end if;

  insert into public.cancellation_requests (
    booking_id,
    requested_by,
    requester_user_id,
    reason_code,
    reason_text,
    evidence_note,
    status,
    policy_snapshot,
    applied_fee,
    fee_currency,
    traveler_refund_expectation,
    expires_at
  ) values (
    p_booking_id,
    'supplier',
    v_uid,
    v_code,
    v_text,
    nullif(v_evidence, ''),
    'requested',
    coalesce(p_policy_snapshot, '{}'::jsonb) || jsonb_build_object(
      'server_applied_fee', v_fee,
      'server_force_majeure', v_fm,
      'auto_accept_hours', null,
      'client_requested_fee_currency', p_fee_currency
    ),
    v_fee,
    -- Server-authoritative: the booking's real paid currency, not the
    -- client-supplied p_fee_currency. See migration header note.
    v_booking_currency,
    'full_refund',
    now() + interval '72 hours'
  )
  returning id into v_id;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    p_booking_id,
    'system',
    v_uid,
    'Supplier requested cancellation. Open this booking to review the reason and respond.'
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'applied_fee', v_fee, 'fee_currency', v_booking_currency);
end;
$$;

grant execute on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) to authenticated;

comment on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) is
  'Supplier-initiated cancellation request; fee amount AND fee currency are both server-authoritative (derived from bookings.currency), client-supplied values are audit-only.';
