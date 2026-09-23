-- Fix: a paid booking's cancellation truth (status/cancelled_at/
-- cancellation_reason/refund_choice) could be rewritten directly by any
-- client with ownership of the row -- entirely bypassing the
-- consent-and-fee cancellation system this schema already carefully
-- built (request_supplier_cancellation / respond_cancellation_request,
-- migration 055 onward; cancel_booking_as_traveler, migration 081).
--
-- Background. public.bookings has two RLS UPDATE policies whose `with
-- check` only re-verifies ROW OWNERSHIP, not which columns are being
-- changed or to what:
--   - "Suppliers can update booking status for their listings" (migration
--     003): using/with check = the caller owns the listing behind the
--     booking.
--   - "Consumers can cancel own bookings[ by user id]" (migration 037):
--     using/with check = the caller is the guest on the booking.
-- migration 078's bookings_protect_payment_fields() trigger already
-- freezes payment_status/amount_paid/total_amount/etc. against exactly
-- this kind of raw client write -- but never covered status/cancelled_at/
-- cancellation_reason/refund_choice, because those four columns ARE
-- legitimately written by client-facing RPCs (cancel_booking_as_traveler,
-- respond_cancellation_request), so a blanket role-based freeze (the
-- existing pattern for payment fields) would have broken those RPCs too.
--
-- The gap this leaves is real and reachable from the app's own code, not
-- just a theoretical raw REST call: src/data/supabase-bookings.ts's
-- updateBookingStatus() -- used by both the single-booking cancel button
-- and batchCancelBookings() on the supplier dashboard -- performs a raw
-- `supabase.from('bookings').update({status, cancelled_at,
-- cancellation_reason, refund_choice})` with NO server-side re-check that
-- the booking is actually unpaid. The UI only ever calls it for unpaid
-- holds ("Release hold"; paid bookings route through
-- requestSupplierCancellation instead, which correctly requires traveler
-- consent), but that branch is enforced in React, not the database. A
-- supplier (or traveler, via the parallel consumer-cancel policy) with a
-- valid JWT can call this same endpoint directly on a PAID, confirmed
-- booking to: set status='cancelled' with no cancellation_requests row
-- and no traveler consent at all; post an arbitrary refund_choice with no
-- corresponding supplier_ledger_entries fee/reversal entry (the
-- Phase 556-fixed accounting never happens); or, on an already-cancelled
-- paid booking, later flip refund_choice after the fact (e.g. a traveler
-- upgrading their own no_refund cancellation to full_refund, or a
-- supplier downgrading one to avoid the fee).
--
-- Fix. Extend bookings_protect_payment_fields() (078's latest body,
-- unchanged otherwise) with an additional freeze: for a booking whose
-- payment_status is 'paid'/'complete'/'succeeded', and which either
-- already is or is being newly set to status='cancelled', non-service-role
-- callers may not change status/cancelled_at/cancellation_reason/
-- refund_choice at all -- UNLESS the update is happening inside the two
-- blessed RPCs, which now set a local, transaction-scoped
-- app.bypass_booking_cancellation_guard flag immediately before their own
-- `update bookings` statement (mirroring the service_role bypass already
-- used for payment fields, but scoped to this one call rather than to a
-- whole Postgres role, since both RPCs run as ordinary `authenticated`
-- callers). Unpaid bookings are completely unaffected -- updateBookingStatus's
-- legitimate "release an unpaid hold" path keeps working exactly as
-- today, with no RPC required, since nothing about that path bypasses any
-- accounting.
--
-- cancel_booking_as_traveler (081) and respond_cancellation_request (068)
-- are otherwise reproduced byte-for-byte from their latest prior versions;
-- the only change in each is the one new `perform set_config(...)`
-- statement immediately before their existing `update public.bookings`
-- statement.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- bookings_cancellation_truth_guard.test.sql): a raw client update trying
-- to cancel a paid, confirmed booking directly (no cancellation_requests
-- row, exactly what updateBookingStatus would send) is rejected and the
-- booking stays untouched; the same raw update on an UNPAID booking still
-- succeeds unchanged (release-hold path preserved); respond_cancellation_request
-- and cancel_booking_as_traveler both still work end-to-end on paid
-- bookings (their internal updates pass through the new guard via the
-- bypass flag); and a raw attempt to rewrite refund_choice on an already
-- (properly) cancelled paid booking is also rejected. Confirmed the test
-- is meaningful by reconstructing the pre-fix trigger and re-running the
-- same script against it -- the raw paid-booking cancel succeeds exactly
-- as the vulnerability predicts.

create or replace function public.bookings_protect_payment_fields()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_paid boolean;
  v_bypass_cancel_guard boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if v_role in ('service_role', '') then
    return new;
  end if;

  -- Always preserve payment + purchase commercial columns for client roles.
  new.payment_status := old.payment_status;
  new.amount_paid := old.amount_paid;
  new.checkout_session_id := old.checkout_session_id;
  new.payment_intent_id := old.payment_intent_id;
  new.paid_at := old.paid_at;
  new.total_amount := old.total_amount;
  new.currency := old.currency;
  new.listing_id := old.listing_id;
  new.guest_user_id := old.guest_user_id;
  new.guest_email := old.guest_email;
  new.purchase_snapshot := old.purchase_snapshot;
  new.guest_breakdown := old.guest_breakdown;
  new.booking_number := old.booking_number;

  v_paid := lower(trim(coalesce(old.payment_status, ''))) = 'paid';
  if v_paid then
    new.booking_date := old.booking_date;
    new.check_out := old.check_out;
    new.nights := old.nights;
    new.nightly_amount := old.nightly_amount;
    new.cleaning_fee := old.cleaning_fee;
    new.booking_option_id := old.booking_option_id;
    new.guests := old.guests;
  end if;

  -- Cancellation truth (status/cancelled_at/cancellation_reason/
  -- refund_choice) on a paid booking may only change through
  -- cancel_booking_as_traveler or respond_cancellation_request, which set
  -- this transaction-local flag right before their own update. A raw
  -- client update (e.g. updateBookingStatus / batchCancelBookings, or a
  -- direct REST call) on a paid booking must go through those RPCs so the
  -- traveler-consent window and server-computed fee/ledger entry are
  -- never bypassed. See migration header note. Unpaid bookings are
  -- unaffected (the legitimate "release an unpaid hold" path).
  v_bypass_cancel_guard :=
    coalesce(current_setting('app.bypass_booking_cancellation_guard', true), '') = 'true';
  if v_paid and not v_bypass_cancel_guard
    and (
      lower(trim(coalesce(old.status, ''))) = 'cancelled'
      or lower(trim(coalesce(new.status, ''))) = 'cancelled'
    )
  then
    new.status := old.status;
    new.cancelled_at := old.cancelled_at;
    new.cancellation_reason := old.cancellation_reason;
    new.refund_choice := old.refund_choice;
  end if;

  return new;
end;
$$;

comment on function public.bookings_protect_payment_fields() is
  'Client roles cannot rewrite payment fields, purchase_snapshot, or guest_breakdown. Paid bookings also freeze date/nights/option/guests (start_time/pickup_time remain editable for ops), and freeze status/cancelled_at/cancellation_reason/refund_choice unless the update comes from cancel_booking_as_traveler or respond_cancellation_request.';

create or replace function public.cancel_booking_as_traveler(
  p_booking_id uuid,
  p_refund_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_booking public.bookings%rowtype;
  v_supplier uuid;
  v_body text;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
  v_tour_start timestamptz;
  v_within_free_window boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  if v_choice not in ('full_refund', 'no_refund') then
    return jsonb_build_object('ok', false, 'error', 'Invalid refund choice.');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;

  if not (
    v_booking.guest_user_id = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_booking.guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can cancel.');
  end if;

  v_pay := lower(trim(coalesce(v_booking.payment_status, '')));
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  v_collected := v_pay in ('paid', 'complete', 'succeeded');
  if not v_collected then
    v_choice := 'no_refund';
  end if;

  -- Authoritative server-side re-check of the "free cancellation up to 24h
  -- before start" policy (matches src/lib/cancellation-policy.ts
  -- travelerSelfCancelRefundChoice). See migration 081 header note (1).
  if v_collected and v_choice = 'full_refund' and v_booking.booking_date is not null then
    v_tour_start := (v_booking.booking_date + coalesce(v_booking.start_time, time '00:00'))
      at time zone 'Europe/Helsinki';
    v_within_free_window := v_tour_start - now() > interval '24 hours';
    if not v_within_free_window then
      v_choice := 'no_refund';
    end if;
  end if;

  -- Let bookings_protect_payment_fields() know this update comes from the
  -- blessed RPC, not a raw client write. See migration header note.
  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      refund_choice = v_choice
    where id = v_booking.id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select l.supplier_id into v_supplier
  from public.listings l
  where l.id = v_booking.listing_id;

  -- Only reverse the supplier's recorded earnings when a refund is actually
  -- happening. See migration 081 header note (2).
  if v_supplier is not null and v_collected and v_choice = 'full_refund' then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    )
    select
      e.supplier_id,
      e.booking_id,
      'refund',
      - abs(e.amount),
      e.currency,
      'Cancelled booking earnings reversal',
      e.booking_id::text,
      'traverion_traveler_self_cancel_v1'
    from public.supplier_ledger_entries e
    where e.kind = 'booking_earnings'
      and e.booking_id = v_booking.id
    on conflict (kind, source_id) do nothing;
  end if;

  if not v_collected then
    v_body :=
      'Traveler cancelled an unpaid checkout. No payment was collected.';
  elsif v_choice = 'full_refund' then
    v_body :=
      'Traveler cancelled this booking. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.';
  else
    v_body :=
      'Traveler cancelled this booking. No refund applies for this traveler-initiated cancellation.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_booking.id, 'system', v_uid, v_body);

  return jsonb_build_object('ok', true, 'refund_choice', v_choice, 'unpaid_checkout', not v_collected);
end;
$$;

revoke all on function public.cancel_booking_as_traveler(uuid, text) from public;
grant execute on function public.cancel_booking_as_traveler(uuid, text) to authenticated;

comment on function public.cancel_booking_as_traveler(uuid, text) is
  'Traveler self-cancel: enforces the 24h-before-start free-cancellation cutoff and unpaid-checkout no-refund rule server-side (not just client-side); paid trips reverse supplier earnings only when a refund is actually granted, and post Refund due / no-refund honesty. Sets app.bypass_booking_cancellation_guard so its own bookings update passes bookings_protect_payment_fields().';

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

  -- Let bookings_protect_payment_fields() know this update comes from the
  -- blessed RPC, not a raw client write. See migration header note.
  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

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

  -- Reverse posted earnings so a cancelled paid booking does not keep supplier credit.
  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  )
  select
    e.supplier_id,
    e.booking_id,
    'refund',
    - abs(e.amount),
    e.currency,
    'Cancelled booking earnings reversal',
    e.booking_id::text,
    coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_ledger_v1')
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings'
    and e.booking_id = v_req.booking_id
  on conflict (kind, source_id) do nothing;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    v_req.booking_id,
    'system',
    v_uid,
    'Traveler accepted the cancellation. This booking is cancelled. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.'
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id
  );
end;
$$;

comment on function public.respond_cancellation_request(uuid, boolean) is
  'Traveler responds to a supplier cancellation request; on accept, cancels the booking and posts the server-computed fee. Sets app.bypass_booking_cancellation_guard so its own bookings update passes bookings_protect_payment_fields().';
