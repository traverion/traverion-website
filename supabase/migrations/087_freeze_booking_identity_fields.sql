-- Phase 565: freeze booking_date/check_out/nights/nightly_amount/
-- cleaning_fee/booking_option_id/guests/hold_expires_at against direct
-- client UPDATE, unconditionally rather than only once payment_status =
-- 'paid'.
--
-- bookings_protect_payment_fields() (051 -> 078 -> 085) already freezes
-- payment_status/amount_paid/checkout_session_id/payment_intent_id/
-- paid_at/total_amount/currency/listing_id/guest_user_id/guest_email/
-- purchase_snapshot/guest_breakdown/booking_number unconditionally, and
-- freezes booking_date/check_out/nights/nightly_amount/cleaning_fee/
-- booking_option_id/guests only once the booking is already paid. That
-- left every one of those seven columns, plus hold_expires_at (never
-- frozen at all, at any payment status), directly writable by any
-- authenticated traveler on their OWN pending booking via the "Consumers
-- can cancel own bookings[ by user id]" UPDATE policies (037) -- whose
-- `with check` only re-verifies row ownership, the same pattern 085 and
-- Phase 563 already found and closed twice elsewhere on this table.
--
-- Concretely reachable today: start any real checkout (creates a genuine
-- 'pending' booking with a real hold_expires_at, ~15-30 minutes out, via
-- claim_pending_checkout_booking), then send a direct PostgREST PATCH on
-- that same booking's own row setting hold_expires_at to any future
-- timestamp (e.g. +365 days) and/or booking_date/booking_option_id/
-- check_out/nights/guests to a different date, option, or party size than
-- what was ever priced. booking_occupies_inventory() (054/059/076) treats
-- a non-cancelled, payment_status='pending' row as occupying inventory
-- for as long as hold_expires_at says -- so this is the same
-- calendar-poisoning DoS migration 086 closed on INSERT, still reachable
-- here via UPDATE on a booking the traveler legitimately owns, for the
-- cost of one real (or cheap) checkout attempt instead of a bare insert.
--
-- This is NOT a payment-amount exploit: create-booking-checkout-session's
-- resume path (targetBookingId present) always recomputes the actual
-- Stripe charge from a fresh quoteListingBooking() call against the
-- booking's *current* booking_date/guests/booking_option_id (see
-- create-booking-checkout-session/index.ts lines ~469, ~598-615), never
-- from the stored total_amount column -- so tampering with these fields
-- cannot make a traveler pay less than the real re-quoted price for
-- whatever configuration ends up on the row. The real, reachable harm
-- is availability integrity: a free, repeatable, effectively permanent
-- block on any listing's calendar.
--
-- Confirmed no legitimate client code needs direct write access to any of
-- these fields: grepped every `.from('bookings').update(` call site in
-- src/ (two total). updateBookingSchedule() (src/data/supabase-bookings.ts)
-- only ever sends start_time/pickup_time -- the two fields 078's own
-- comment already calls out as intentionally left mutable for ops, and
-- this migration does not touch them. updateBookingStatus() /
-- batchCancelBookings() only ever send status/cancelled_at/
-- cancellation_reason/refund_choice -- exactly the four columns 085
-- already governs with its own conditional guard, untouched here. Every
-- legitimate write to booking_date/check_out/nights/nightly_amount/
-- cleaning_fee/booking_option_id/guests/hold_expires_at already goes
-- through claim_pending_checkout_booking or create-booking-checkout-session,
-- both service-role (or SECURITY DEFINER acting with the trigger's
-- 'service_role'/'' role bypass already in place) -- unaffected by this
-- change.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- bookings_client_insert_guard.test.sql's sibling,
-- supabase/tests/bookings_identity_field_guard.test.sql): the exploit
-- (raw client PATCH of hold_expires_at/booking_date/guests on an unpaid
-- booking) succeeds against 086 alone and is rejected after 087; the
-- legitimate release-a-hold status update, the legitimate
-- start_time/pickup_time schedule update, and the service-role resume-sync
-- path all continue to work unchanged after 087.

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

  -- Phase 565: these were previously only frozen once payment_status =
  -- 'paid'. No legitimate client code ever writes them directly at any
  -- payment status (see migration header) -- freezing them unconditionally
  -- closes an unpaid-booking calendar-poisoning gap without affecting any
  -- real flow.
  new.booking_date := old.booking_date;
  new.check_out := old.check_out;
  new.nights := old.nights;
  new.nightly_amount := old.nightly_amount;
  new.cleaning_fee := old.cleaning_fee;
  new.booking_option_id := old.booking_option_id;
  new.guests := old.guests;
  new.hold_expires_at := old.hold_expires_at;

  v_paid := lower(trim(coalesce(old.payment_status, ''))) = 'paid';

  -- Cancellation truth (status/cancelled_at/cancellation_reason/
  -- refund_choice) on a paid booking may only change through
  -- cancel_booking_as_traveler or respond_cancellation_request, which set
  -- this transaction-local flag right before their own update. A raw
  -- client update (e.g. updateBookingStatus / batchCancelBookings, or a
  -- direct REST call) on a paid booking must go through those RPCs so the
  -- traveler-consent window and server-computed fee/ledger entry are
  -- never bypassed. See migration 085. Unpaid bookings are unaffected
  -- (the legitimate "release an unpaid hold" path).
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
  'Client roles cannot rewrite payment fields, purchase_snapshot, guest_breakdown, or booking identity/schedule fields (booking_date/check_out/nights/nightly_amount/cleaning_fee/booking_option_id/guests/hold_expires_at) at any payment status -- start_time/pickup_time remain editable for ops. Paid bookings additionally freeze status/cancelled_at/cancellation_reason/refund_choice unless the update comes from cancel_booking_as_traveler or respond_cancellation_request.';
