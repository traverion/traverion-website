-- Prevent rental bookings from being classified as stay nights.
-- On paid promote: confirm rental inventory hold instead of tour/stay assert.

create or replace function public.booking_is_stay_night(p_booking public.bookings)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p_booking.purchase_snapshot->>'inventoryFamily', '') is distinct from 'rental'
    and (
      p_booking.check_out is not null
      or (p_booking.nights is not null and p_booking.nights >= 1)
      or coalesce(nullif(trim(p_booking.purchase_snapshot->>'checkOut'), ''), '')
        ~ '^\d{4}-\d{2}-\d{2}$'
    );
$$;

create or replace function public.booking_is_rental(p_booking public.bookings)
returns boolean
language sql
immutable
as $$
  select coalesce(p_booking.purchase_snapshot->>'inventoryFamily', '') = 'rental';
$$;

-- Replace promote_paid_checkout_booking with rental-aware inventory path.
-- Keeps existing tour/stay assert behavior for non-rentals.
create or replace function public.promote_paid_checkout_booking(
  p_booking_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_paid numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_purchase_snapshot jsonb default null,
  p_assert_start_time time default null,
  p_assert_booking_option_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_updated uuid;
  v_session text := nullif(trim(coalesce(p_checkout_session_id, '')), '');
  v_option text := nullif(trim(coalesce(p_assert_booking_option_id, '')), '');
  v_check_out date;
  v_rental_confirm jsonb;
  v_snap jsonb;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'reason', 'booking_required');
  end if;
  if v_session is null then
    return jsonb_build_object('ok', false, 'reason', 'session_required');
  end if;

  select * into v_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if lower(coalesce(v_row.payment_status, '')) = 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'already_paid');
  end if;

  if lower(coalesce(v_row.payment_status, '')) = 'refunded' then
    return jsonb_build_object('ok', false, 'reason', 'already_refunded');
  end if;

  if lower(coalesce(v_row.status, '')) = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  if lower(coalesce(v_row.payment_status, '')) not in ('pending', 'failed') then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_promotable',
      'payment_status', v_row.payment_status
    );
  end if;

  if nullif(trim(coalesce(v_row.checkout_session_id, '')), '') is not null
     and trim(v_row.checkout_session_id) <> v_session then
    return jsonb_build_object('ok', false, 'reason', 'session_mismatch');
  end if;

  if public.booking_is_rental(v_row) then
    v_rental_confirm := public.confirm_rental_checkout_paid(p_booking_id);
    if coalesce((v_rental_confirm->>'ok')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false,
        'reason', 'inventory_conflict',
        'message', coalesce(v_rental_confirm->>'error', 'rental_hold_confirm_failed'),
        'detail', v_rental_confirm
      );
    end if;
  elsif v_row.listing_id is not null
     and v_row.booking_date is not null
     and coalesce(v_row.guests, 0) >= 1 then
    if public.booking_is_stay_night(v_row) then
      v_check_out := public.stay_booking_check_out(v_row);
    else
      v_check_out := case
        when v_row.check_out is not null and v_row.check_out > v_row.booking_date then v_row.check_out
        else null
      end;
    end if;
    perform public.assert_checkout_inventory(
      v_row.listing_id,
      v_row.booking_date,
      v_row.guests,
      v_check_out,
      v_row.id,
      coalesce(p_assert_start_time, v_row.start_time),
      coalesce(v_option, v_row.booking_option_id)
    );
  end if;

  update public.bookings
  set
    status = 'confirmed',
    payment_status = 'paid',
    payment_provider = 'stripe',
    checkout_session_id = v_session,
    payment_intent_id = nullif(trim(coalesce(p_payment_intent_id, '')), ''),
    amount_paid = p_amount_paid,
    currency = upper(nullif(trim(coalesce(p_currency, '')), '')),
    paid_at = coalesce(p_paid_at, now()),
    purchase_snapshot = coalesce(p_purchase_snapshot, purchase_snapshot),
    hold_expires_at = null,
    updated_at = now()
  where id = p_booking_id
    and payment_status in ('pending', 'failed')
    and coalesce(status, '') is distinct from 'cancelled'
    and (
      nullif(trim(coalesce(checkout_session_id, '')), '') is null
      or trim(checkout_session_id) = v_session
    )
  returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'reason', 'update_race');
  end if;

  return jsonb_build_object('ok', true, 'booking_id', v_updated);
end;
$$;

revoke all on function public.promote_paid_checkout_booking(uuid, text, text, numeric, text, timestamptz, jsonb, time, text) from public;
grant execute on function public.promote_paid_checkout_booking(uuid, text, text, numeric, text, timestamptz, jsonb, time, text) to service_role;

comment on function public.booking_is_rental(public.bookings) is
  'True when purchase_snapshot.inventoryFamily = rental.';
comment on function public.promote_paid_checkout_booking(uuid, text, text, numeric, text, timestamptz, jsonb, time, text) is
  'Paid promote: rental confirms inventory hold; tour/stay assert_checkout_inventory.';
