-- Customer-facing booking code. booking_number stays the internal sequence.
-- Generated once on insert and frozen against client updates.

create extension if not exists pgcrypto;

alter table public.bookings
  add column if not exists public_reference text;

create or replace function public.booking_public_reference()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea;
  out text := 'TV-';
  i int;
begin
  raw := gen_random_bytes(8);
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end;
$$;

create or replace function public.bookings_assign_public_reference()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  tries int := 0;
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.public_reference := null;
  end if;
  if new.public_reference is not null and new.public_reference ~ '^TV-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    return new;
  end if;
  loop
    tries := tries + 1;
    candidate := public.booking_public_reference();
    exit when not exists (select 1 from public.bookings where public_reference = candidate);
    if tries > 12 then
      raise exception 'could not assign a booking reference';
    end if;
  end loop;
  new.public_reference := candidate;
  return new;
end;
$$;

drop trigger if exists tr_bookings_assign_public_reference on public.bookings;
create trigger tr_bookings_assign_public_reference
  before insert on public.bookings
  for each row
  execute function public.bookings_assign_public_reference();

do $$
declare
  r record;
  candidate text;
  tries int;
begin
  for r in select id from public.bookings where public_reference is null loop
    tries := 0;
    loop
      tries := tries + 1;
      candidate := public.booking_public_reference();
      exit when not exists (select 1 from public.bookings where public_reference = candidate);
      if tries > 12 then
        raise exception 'could not backfill a booking reference';
      end if;
    end loop;
    update public.bookings set public_reference = candidate where id = r.id and public_reference is null;
  end loop;
end $$;

create unique index if not exists bookings_public_reference_key
  on public.bookings (public_reference);

alter table public.bookings
  alter column public_reference set not null;

-- Latest body is migration 197, plus this column.
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

comment on column public.bookings.public_reference is
  'Stable customer-facing booking code (TV- plus 8 unambiguous characters). Not sequential. booking_number remains internal.';
