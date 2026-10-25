-- bookings has no updated_at column. Mig 285/286/287 referenced it, which
-- aborted rental (and stay) promote updates and left paid Stripe sessions
-- disconnected from confirmed bookings. Strip updated_at from those paths.

create or replace function public.confirm_rental_checkout_paid(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_hold_id uuid;
  v_confirm jsonb;
  v_snap jsonb;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_required');
  end if;

  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if coalesce(v_row.purchase_snapshot->>'inventoryFamily', '') is distinct from 'rental' then
    return jsonb_build_object('ok', false, 'error', 'not_a_rental_booking');
  end if;

  if v_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'booking_cancelled');
  end if;

  v_hold_id := nullif(trim(coalesce(v_row.purchase_snapshot->>'holdId', '')), '')::uuid;
  if v_hold_id is null then
    select id into v_hold_id
    from public.rental_inventory_holds
    where booking_id = p_booking_id
      and status in ('held', 'confirmed')
    order by created_at desc
    limit 1;
  end if;

  if v_hold_id is null then
    return jsonb_build_object('ok', false, 'error', 'hold_missing');
  end if;

  v_confirm := public.confirm_rental_inventory_hold(v_hold_id, p_booking_id);
  if coalesce((v_confirm->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_confirm->>'error', 'confirm_hold_failed'),
      'hold', v_confirm
    );
  end if;

  v_snap := coalesce(v_row.purchase_snapshot, '{}'::jsonb)
    || jsonb_build_object('rentalOpsStatus', 'awaiting_pickup', 'holdId', v_hold_id);

  update public.bookings
  set purchase_snapshot = v_snap
  where id = p_booking_id;

  perform public.record_rental_booking_event(
    p_booking_id,
    v_row.listing_id,
    'checkout_paid_hold_confirmed',
    'system',
    null,
    jsonb_build_object('hold_id', v_hold_id)
  );

  return jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'hold_id', v_hold_id);
end;
$$;

revoke all on function public.confirm_rental_checkout_paid(uuid) from public;
grant execute on function public.confirm_rental_checkout_paid(uuid) to service_role;

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
    hold_expires_at = null
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

create or replace function public.set_rental_ops_status(
  p_booking_id uuid,
  p_ops_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_ops text := lower(trim(coalesce(p_ops_status, '')));
  v_snap jsonb;
  v_prev text;
begin
  if v_ops not in ('awaiting_pickup', 'collected', 'returned', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'invalid_ops_status');
  end if;

  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if coalesce(v_row.purchase_snapshot->>'inventoryFamily', '') is distinct from 'rental' then
    return jsonb_build_object('ok', false, 'error', 'not_a_rental_booking');
  end if;

  if not public.is_supplier_account_side((
    select supplier_id from public.listings where id = v_row.listing_id
  )) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_row.payment_status is distinct from 'paid' or v_row.status is distinct from 'confirmed' then
    if v_ops in ('collected', 'returned') then
      return jsonb_build_object('ok', false, 'error', 'booking_not_ready_for_handover');
    end if;
  end if;

  v_prev := coalesce(v_row.purchase_snapshot->>'rentalOpsStatus', 'awaiting_pickup');

  if v_ops = 'collected' and v_prev not in ('awaiting_pickup', 'collected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_handover_from_state');
  end if;
  if v_ops = 'returned' and v_prev not in ('collected', 'returned') then
    return jsonb_build_object('ok', false, 'error', 'collect_before_return');
  end if;
  if v_ops = v_prev then
    return jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'rentalOpsStatus', v_ops, 'idempotent', true);
  end if;

  v_snap := coalesce(v_row.purchase_snapshot, '{}'::jsonb)
    || jsonb_build_object('rentalOpsStatus', v_ops);

  update public.bookings
  set purchase_snapshot = v_snap
  where id = p_booking_id;

  perform public.record_rental_booking_event(
    p_booking_id,
    v_row.listing_id,
    'ops_status_' || v_ops,
    'supplier',
    auth.uid(),
    jsonb_build_object('from', v_prev, 'to', v_ops)
  );

  return jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'rentalOpsStatus', v_ops);
end;
$$;

revoke all on function public.set_rental_ops_status(uuid, text) from public;
grant execute on function public.set_rental_ops_status(uuid, text) to authenticated, service_role;

comment on function public.promote_paid_checkout_booking(uuid, text, text, numeric, text, timestamptz, jsonb, time, text) is
  'Paid promote without bookings.updated_at (column absent). Rental confirms hold; tour/stay assert inventory.';
