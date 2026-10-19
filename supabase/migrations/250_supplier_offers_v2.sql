-- Supplier offers: booking window, optional activity window, pause, limit, soft delete.
-- Legacy rows keep book_from null. Checkout still applies valid_from/valid_until to the
-- departure date for those rows. New rows are eligible only when the booking day falls in
-- book_from..book_until and, when set, the departure falls in the activity window.
-- Booking-window length (max 730 inclusive days) is enforced in the application, not here,
-- so existing rows are not rewritten.

alter table public.listing_discounts
  add column if not exists book_from date,
  add column if not exists book_until date,
  add column if not exists activity_from date,
  add column if not exists activity_until date,
  add column if not exists paused boolean not null default false,
  add column if not exists booking_limit integer,
  add column if not exists deleted_at timestamptz,
  add column if not exists offer_group_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listing_discounts_booking_limit_positive'
  ) then
    alter table public.listing_discounts
      add constraint listing_discounts_booking_limit_positive
      check (booking_limit is null or booking_limit >= 1);
  end if;
end $$;

alter table public.bookings
  add column if not exists applied_discount_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_applied_discount_id_fkey'
  ) then
    alter table public.bookings
      add constraint bookings_applied_discount_id_fkey
      foreign key (applied_discount_id) references public.listing_discounts(id) on delete set null;
  end if;
end $$;

create index if not exists bookings_applied_discount_active_idx
  on public.bookings (applied_discount_id)
  where applied_discount_id is not null;

-- Reserves one discounted booking under a row lock. Paid bookings and unexpired
-- pending holds count. Cancelled, refunded, failed, and expired holds do not.
-- Idempotent for the same booking id. Service role only.
create or replace function public.claim_offer_redemption(p_discount_id uuid, p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
  v_listing uuid;
  v_booking_listing uuid;
begin
  if p_discount_id is null or p_booking_id is null then
    return false;
  end if;

  select booking_limit, listing_id
    into v_limit, v_listing
  from public.listing_discounts
  where id = p_discount_id
    and deleted_at is null
    and paused is not true
  for update;

  if v_listing is null then
    return false;
  end if;

  select listing_id into v_booking_listing
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking_listing is null or v_booking_listing <> v_listing then
    return false;
  end if;

  if v_limit is not null then
    select count(*)::integer into v_count
    from public.bookings
    where applied_discount_id = p_discount_id
      and id <> p_booking_id
      and coalesce(status, '') <> 'cancelled'
      and (
        payment_status = 'paid'
        or (
          payment_status in ('pending', 'authorized')
          and hold_expires_at is not null
          and hold_expires_at > now()
        )
      );
    if v_count >= v_limit then
      return false;
    end if;
  end if;

  update public.bookings
  set applied_discount_id = p_discount_id
  where id = p_booking_id;
  return true;
end;
$$;

revoke all on function public.claim_offer_redemption(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_offer_redemption(uuid, uuid) to service_role;

-- Suppliers and travelers can update some booking columns. The applied offer id
-- is written only by the checkout service role. Replaces the Phase 245 guard
-- and adds applied_discount_id.
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
  new.public_reference := old.public_reference;
  new.applied_discount_id := old.applied_discount_id;

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
