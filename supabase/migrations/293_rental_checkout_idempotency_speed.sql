-- Rental checkout: speed up idempotent claim lookup + ignore abandoned rows.
-- claim_rental_checkout_booking previously scanned purchase_snapshot JSON without
-- an index and could return a released booking (no live hold) for the same key.

create index if not exists bookings_rental_checkout_idempotency_idx
  on public.bookings (
    listing_id,
    ((purchase_snapshot->>'checkoutIdempotencyKey'))
  )
  where purchase_snapshot->>'inventoryFamily' = 'rental'
    and nullif(trim(coalesce(purchase_snapshot->>'checkoutIdempotencyKey', '')), '') is not null;

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
  v_hold jsonb;
  v_hold_id uuid;
  v_booking_id uuid;
  v_existing uuid;
  v_existing_hold uuid;
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_snap jsonb;
  v_booking_date date;
  v_check_out date;
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

  -- Idempotent: live pending booking with same key + active hold (or open checkout window).
  select b.id,
         nullif(trim(coalesce(b.purchase_snapshot->>'holdId', '')), '')::uuid
    into v_existing, v_existing_hold
  from public.bookings b
  where b.listing_id = p_listing_id
    and b.status is distinct from 'cancelled'
    and coalesce(b.payment_status, 'pending') in ('pending', 'failed')
    and b.purchase_snapshot->>'inventoryFamily' = 'rental'
    and b.purchase_snapshot->>'checkoutIdempotencyKey' = v_key
    and (
      exists (
        select 1
        from public.rental_inventory_holds h
        where h.booking_id = b.id
          and h.status = 'held'
          and h.hold_expires_at > now()
      )
      or (
        nullif(trim(coalesce(b.checkout_session_id, '')), '') is not null
        and b.hold_expires_at is not null
        and b.hold_expires_at > now()
      )
    )
  order by b.created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'booking_id', v_existing,
      'hold_id', v_existing_hold,
      'idempotent', true
    );
  end if;

  v_hold := public.claim_rental_inventory_hold(
    p_listing_id,
    trim(p_variant_id),
    p_quantity,
    p_starts_at,
    p_ends_at,
    'checkout:' || v_key,
    greatest(1, least(120, coalesce(p_hold_ttl_minutes, 60)))
  );

  if coalesce((v_hold->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_hold->>'error', 'hold_failed'),
      'available', v_hold->'available',
      'stock', v_hold->'stock'
    );
  end if;

  v_hold_id := (v_hold->>'hold_id')::uuid;
  v_booking_date := (p_starts_at at time zone 'UTC')::date;
  v_check_out := (p_ends_at at time zone 'UTC')::date;
  if v_check_out <= v_booking_date then
    v_check_out := v_booking_date + 1;
  end if;

  v_snap := coalesce(p_purchase_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'inventoryFamily', 'rental',
      'checkoutIdempotencyKey', v_key,
      'holdId', v_hold_id,
      'rentalOpsStatus', coalesce(p_purchase_snapshot->>'rentalOpsStatus', 'awaiting_pickup')
    );

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
    coalesce(p_hold_expires_at, now() + make_interval(mins => greatest(1, least(120, coalesce(p_hold_ttl_minutes, 60))))),
    v_snap
  )
  returning id into v_booking_id;

  update public.rental_inventory_holds
  set booking_id = v_booking_id,
      hold_expires_at = coalesce(p_hold_expires_at, hold_expires_at),
      updated_at = now()
  where id = v_hold_id;

  perform public.record_rental_booking_event(
    v_booking_id,
    p_listing_id,
    'checkout_claimed',
    'system',
    null,
    jsonb_build_object('hold_id', v_hold_id, 'idempotency_key', v_key)
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'hold_id', v_hold_id,
    'idempotent', coalesce((v_hold->>'idempotent')::boolean, false)
  );
exception
  when others then
    if v_hold_id is not null then
      perform public.release_rental_inventory_hold(v_hold_id, 'claim_rollback');
    end if;
    return jsonb_build_object('ok', false, 'error', 'claim_failed', 'detail', sqlerrm);
end;
$$;

-- Abandoned unpaid rental checkouts: release hold and cancel so a retry can claim fresh.
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
        updated_at = now()
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
  'Creates pending rental booking + inventory hold. Idempotent only for live pending holds/sessions. service_role only.';

comment on index bookings_rental_checkout_idempotency_idx is
  'Speeds claim_rental_checkout_booking idempotency lookup by listing + checkout key.';
