-- Phase 1502: freeze bookings.guest_name against direct client UPDATE.
--
-- guest_email / guest_user_id are already frozen (087). guest_name was left
-- open, so an authenticated traveler (or supplier via ownership UPDATE policy)
-- could PATCH the lead guest on a pending or paid booking and rewrite Trips,
-- ops desks, emails, and CSV exports away from the name collected at claim.
--
-- Canonical truth: guest_name is booking fulfillment identity set at claim /
-- service-role checkout sync — not a live mirror of the traveler profile.
-- Profile renames must not rewrite historical bookings. Typo correction before
-- pay goes through service-role claim/checkout only when the column is still
-- empty; once set, Pay now resume prefers the stored name (app layer).
--
-- start_time / pickup_time remain client-editable for ops (unchanged).

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
  new.guest_name := old.guest_name;
  new.purchase_snapshot := old.purchase_snapshot;
  new.guest_breakdown := old.guest_breakdown;
  new.booking_number := old.booking_number;

  -- Phase 565 / 087: schedule + party identity frozen at any payment status.
  new.booking_date := old.booking_date;
  new.check_out := old.check_out;
  new.nights := old.nights;
  new.nightly_amount := old.nightly_amount;
  new.cleaning_fee := old.cleaning_fee;
  new.booking_option_id := old.booking_option_id;
  new.guests := old.guests;
  new.hold_expires_at := old.hold_expires_at;

  v_paid := lower(trim(coalesce(old.payment_status, ''))) = 'paid';

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
  'Client roles cannot rewrite payment fields, purchase_snapshot, guest_breakdown, guest_name, or booking identity/schedule fields (booking_date/check_out/nights/nightly_amount/cleaning_fee/booking_option_id/guests/hold_expires_at) at any payment status -- start_time/pickup_time remain editable for ops. Paid bookings additionally freeze status/cancelled_at/cancellation_reason/refund_choice unless the update comes from cancel_booking_as_traveler or respond_cancellation_request.';
