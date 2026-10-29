-- Instant Book rentals: no pre-payment inventory hold.
-- Pending checkout is a payment attempt only (hold_expires_at = Stripe session TTL).
-- Inventory is claimed atomically inside confirm_rental_checkout_paid at paid promote.
-- Also fixes release_rental_checkout_booking writing nonexistent bookings.updated_at (mig 293).

-- Release any leftover temporary checkout holds so abandoned sessions stop blocking stock.
-- Confirmed (paid) rows are untouched.
select public.expire_stale_rental_holds(null);

update public.rental_inventory_holds h
set status = 'released',
    updated_at = now(),
    hold_expires_at = least(coalesce(h.hold_expires_at, now()), now())
where h.status = 'held';

-- ---------------------------------------------------------------------------
-- Checkout claim: soft availability check + pending booking only (no held row)
-- ---------------------------------------------------------------------------
create or replace function public.claim_rental_checkout_booking(
  p_listing_id uuid,
  p_variant_id text,
  p_quantity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_guest_email text,
  p_guest_name text,
  p_guest_user_id uuid,
  p_total_amount numeric,
  p_currency text,
  p_purchase_snapshot jsonb,
  p_idempotency_key text,
  p_hold_expires_at timestamptz,
  p_hold_ttl_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family text;
  v_eval jsonb;
  v_booking_id uuid;
  v_existing uuid;
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_snap jsonb;
  v_booking_date date;
  v_check_out date;
  v_duration_unit text;
  v_issue text;
begin
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  end if;
  if p_listing_id is null or nullif(trim(p_variant_id), '') is null then
    return jsonb_build_object('ok', false, 'error', 'listing_and_variant_required');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return jsonb_build_object('ok', false, 'error', 'invalid_interval');
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if nullif(trim(coalesce(p_guest_email, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'guest_email_required');
  end if;

  select coalesce(nullif(trim(listing_extras->>'inventoryFamily'), ''), 'tour')
  into v_family
  from public.listings
  where id = p_listing_id;

  if v_family is distinct from 'rental' then
    return jsonb_build_object('ok', false, 'error', 'not_a_rental_listing');
  end if;

  -- Idempotent: open unpaid payment attempt with same checkout key (session TTL).
  select b.id into v_existing
  from public.bookings b
  where b.listing_id = p_listing_id
    and b.status is distinct from 'cancelled'
    and coalesce(b.payment_status, 'pending') in ('pending', 'failed')
    and b.purchase_snapshot->>'inventoryFamily' = 'rental'
    and b.purchase_snapshot->>'checkoutIdempotencyKey' = v_key
    and b.hold_expires_at is not null
    and b.hold_expires_at > now()
  order by b.created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'booking_id', v_existing,
      'hold_id', null,
      'idempotent', true
    );
  end if;

  -- Soft availability: prefer 7-arg evaluate (mig 292+); fall back to 6-arg.
  v_duration_unit := nullif(trim(coalesce(p_purchase_snapshot->>'durationUnit', '')), '');
  if to_regprocedure(
    'public.evaluate_rental_availability(uuid,text,integer,timestamptz,timestamptz,uuid,text)'
  ) is not null then
    execute
      'select public.evaluate_rental_availability($1,$2,$3,$4,$5,$6::uuid,$7)'
      into v_eval
      using p_listing_id, trim(p_variant_id), p_quantity, p_starts_at, p_ends_at, null, v_duration_unit;
  else
    if v_duration_unit is not null
       and to_regprocedure('public.rental_window_issue(uuid,timestamptz,timestamptz,text,text)') is not null then
      v_issue := public.rental_window_issue(
        p_listing_id, p_starts_at, p_ends_at, v_duration_unit, trim(p_variant_id)
      );
      if v_issue is not null then
        return jsonb_build_object('ok', false, 'error', v_issue);
      end if;
    end if;
    v_eval := public.evaluate_rental_availability(
      p_listing_id,
      trim(p_variant_id),
      p_quantity,
      p_starts_at,
      p_ends_at,
      null::uuid
    );
  end if;
  if coalesce((v_eval->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_eval->>'error', 'unavailable'),
      'available', v_eval->'available',
      'stock', v_eval->'stock'
    );
  end if;

  v_booking_date := (p_starts_at at time zone 'UTC')::date;
  v_check_out := (p_ends_at at time zone 'UTC')::date;
  if v_check_out <= v_booking_date then
    v_check_out := v_booking_date + 1;
  end if;

  v_snap := coalesce(p_purchase_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'inventoryFamily', 'rental',
      'checkoutIdempotencyKey', v_key,
      'rentalOpsStatus', coalesce(p_purchase_snapshot->>'rentalOpsStatus', 'awaiting_pickup')
    );
  -- Never leave a stale holdId from a client/resume snapshot — allocate on paid.
  v_snap := v_snap - 'holdId';

  insert into public.bookings (
    listing_id,
    guest_email,
    guest_name,
    guest_user_id,
    guests,
    booking_date,
    check_out,
    nights,
    status,
    payment_status,
    total_amount,
    currency,
    booking_option_id,
    hold_expires_at,
    purchase_snapshot
  ) values (
    p_listing_id,
    lower(trim(p_guest_email)),
    nullif(trim(coalesce(p_guest_name, '')), ''),
    p_guest_user_id,
    p_quantity,
    v_booking_date,
    v_check_out,
    greatest(1, (v_check_out - v_booking_date)),
    'pending',
    'pending',
    p_total_amount,
    upper(left(trim(coalesce(p_currency, 'EUR')), 3)),
    trim(p_variant_id),
    coalesce(
      p_hold_expires_at,
      now() + make_interval(mins => greatest(1, least(120, coalesce(p_hold_ttl_minutes, 60))))
    ),
    v_snap
  )
  returning id into v_booking_id;

  perform public.record_rental_booking_event(
    v_booking_id,
    p_listing_id,
    'checkout_claimed',
    'system',
    null,
    jsonb_build_object(
      'idempotency_key', v_key,
      'inventory_reserved', false,
      'mode', 'instant_book_no_hold'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'hold_id', null,
    'idempotent', false
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', 'claim_failed', 'detail', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- Paid confirm: allocate inventory now (legacy held rows still supported)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_rental_checkout_paid(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_hold_id uuid;
  v_claim jsonb;
  v_confirm jsonb;
  v_snap jsonb;
  v_variant text;
  v_qty integer;
  v_starts timestamptz;
  v_ends timestamptz;
  v_key text;
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

  -- Legacy path: temporary hold created before Instant Book no-hold cutover.
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
    v_variant := nullif(trim(coalesce(
      v_row.purchase_snapshot->>'variantId',
      v_row.booking_option_id,
      ''
    )), '');
    v_qty := greatest(1, coalesce((v_row.purchase_snapshot->>'quantity')::integer, v_row.guests, 1));
    begin
      v_starts := (v_row.purchase_snapshot->>'pickupAt')::timestamptz;
      v_ends := (v_row.purchase_snapshot->>'returnAt')::timestamptz;
    exception
      when others then
        v_starts := null;
        v_ends := null;
    end;
    if v_variant is null or v_starts is null or v_ends is null or v_ends <= v_starts then
      return jsonb_build_object('ok', false, 'error', 'rental_interval_missing');
    end if;

    v_key := 'paid:' || p_booking_id::text;
    v_claim := public.claim_rental_inventory_hold(
      v_row.listing_id,
      v_variant,
      v_qty,
      v_starts,
      v_ends,
      v_key,
      60
    );
    if coalesce((v_claim->>'ok')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false,
        'error', coalesce(v_claim->>'error', 'insufficient_stock'),
        'available', v_claim->'available',
        'stock', v_claim->'stock',
        'claim', v_claim
      );
    end if;
    v_hold_id := (v_claim->>'hold_id')::uuid;

    update public.rental_inventory_holds
    set booking_id = p_booking_id,
        updated_at = now()
    where id = v_hold_id
      and booking_id is null;
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
    jsonb_build_object('hold_id', v_hold_id, 'allocated_on_paid', true)
  );

  return jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'hold_id', v_hold_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Release unpaid checkout: no bookings.updated_at (column does not exist)
-- ---------------------------------------------------------------------------
create or replace function public.release_rental_checkout_booking(
  p_booking_id uuid,
  p_reason text default 'released'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_hold_id uuid;
  v_rel jsonb;
begin
  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if coalesce(v_row.purchase_snapshot->>'inventoryFamily', '') is distinct from 'rental' then
    return jsonb_build_object('ok', false, 'error', 'not_a_rental_booking');
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

  if v_hold_id is not null then
    v_rel := public.release_rental_inventory_hold(v_hold_id, coalesce(p_reason, 'released'));
  end if;

  if v_row.status is distinct from 'cancelled'
     and coalesce(v_row.payment_status, 'pending') is distinct from 'paid'
     and coalesce(v_row.payment_status, 'pending') is distinct from 'authorized' then
    perform set_config('app.bypass_booking_cancellation_guard', 'true', true);
    update public.bookings
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancellation_reason = left(coalesce(p_reason, 'released'), 120),
        hold_expires_at = least(coalesce(hold_expires_at, now()), now())
    where id = p_booking_id;
  end if;

  perform public.record_rental_booking_event(
    p_booking_id,
    v_row.listing_id,
    'checkout_released',
    'system',
    null,
    jsonb_build_object('hold_id', v_hold_id, 'reason', left(coalesce(p_reason, 'released'), 80))
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'hold_release', coalesce(v_rel, jsonb_build_object('skipped', true))
  );
end;
$$;

comment on function public.claim_rental_checkout_booking is
  'Instant Book: pending payment attempt only. Soft availability check; no inventory hold until paid promote.';
comment on function public.confirm_rental_checkout_paid is
  'On paid promote: atomically claim+confirm rental inventory (or confirm legacy held). Failures map to inventory_conflict + refund.';
comment on function public.release_rental_checkout_booking is
  'Release optional hold and cancel unpaid rental payment attempt. Does not write bookings.updated_at.';
