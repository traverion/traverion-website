-- Rental cancel → inventory release + public evaluate for booking widget.
-- Does not lift mig 282 publish gate or enable RENTAL_CHECKOUT_ENABLED.

-- Traveler booking widget needs read-only availability evaluation.
-- Claim/confirm remain service_role only.
grant execute on function public.evaluate_rental_availability(
  uuid, text, integer, timestamptz, timestamptz, uuid
) to anon, authenticated, service_role;

grant execute on function public.expire_stale_rental_holds(uuid) to anon, authenticated, service_role;

-- When any path cancels a rental booking, release the linked inventory hold.
create or replace function public.trg_release_rental_hold_on_booking_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if lower(trim(coalesce(new.status, ''))) is distinct from 'cancelled' then
    return new;
  end if;
  if lower(trim(coalesce(old.status, ''))) = 'cancelled' then
    return new;
  end if;
  if coalesce(new.purchase_snapshot->>'inventoryFamily', '') is distinct from 'rental' then
    return new;
  end if;

  perform public.release_rental_checkout_booking(new.id, 'booking_cancelled');
  return new;
exception
  when others then
    -- Never block cancellation on hold release failure; ops can reconcile holds.
    perform public.record_rental_booking_event(
      new.id,
      new.listing_id,
      'hold_release_failed_on_cancel',
      'system',
      null,
      jsonb_build_object('error', sqlerrm)
    );
    return new;
end;
$$;

drop trigger if exists trg_release_rental_hold_on_booking_cancel on public.bookings;
create trigger trg_release_rental_hold_on_booking_cancel
  after update of status on public.bookings
  for each row
  execute function public.trg_release_rental_hold_on_booking_cancel();

comment on function public.trg_release_rental_hold_on_booking_cancel() is
  'Releases rental inventory when a booking becomes cancelled (any cancellation path).';

-- Tighten handover transitions: collected only from awaiting_pickup (or already collected).
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
  set purchase_snapshot = v_snap,
      updated_at = now()
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
