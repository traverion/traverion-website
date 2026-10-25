-- Bridge rental inventory holds ↔ bookings for checkout (additive).
-- Public publication remains blocked by migration 282.
-- Edge must keep RENTAL_CHECKOUT_ENABLED off until release approval.

-- Auditable rental lifecycle events (handover / cancel / recovery).
create table if not exists public.rental_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  event_type text not null,
  actor_role text,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint rental_booking_events_type_len check (char_length(event_type) between 1 and 64)
);

create index if not exists rental_booking_events_booking_idx
  on public.rental_booking_events (booking_id, created_at desc);

alter table public.rental_booking_events enable row level security;

drop policy if exists "Suppliers read rental booking events" on public.rental_booking_events;
create policy "Suppliers read rental booking events"
  on public.rental_booking_events for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = rental_booking_events.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

-- Guests can read events for their own bookings.
drop policy if exists "Guests read own rental booking events" on public.rental_booking_events;
create policy "Guests read own rental booking events"
  on public.rental_booking_events for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = rental_booking_events.booking_id
        and b.guest_user_id = auth.uid()
    )
  );

create or replace function public.record_rental_booking_event(
  p_booking_id uuid,
  p_listing_id uuid,
  p_event_type text,
  p_actor_role text default null,
  p_actor_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.rental_booking_events (
    booking_id, listing_id, event_type, actor_role, actor_user_id, payload
  ) values (
    p_booking_id,
    p_listing_id,
    left(trim(p_event_type), 64),
    nullif(trim(coalesce(p_actor_role, '')), ''),
    p_actor_user_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_rental_booking_event(uuid, uuid, text, text, uuid, jsonb) from public;
grant execute on function public.record_rental_booking_event(uuid, uuid, text, text, uuid, jsonb) to service_role;

/**
 * Atomic rental checkout claim:
 * 1) advisory lock via claim_rental_inventory_hold
 * 2) insert pending bookings row
 * 3) link hold.booking_id
 */
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

  -- Idempotent: prior booking with same checkout idempotency in snapshot
  select b.id into v_existing
  from public.bookings b
  where b.listing_id = p_listing_id
    and b.purchase_snapshot->>'inventoryFamily' = 'rental'
    and b.purchase_snapshot->>'checkoutIdempotencyKey' = v_key
  order by b.created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'booking_id', v_existing, 'idempotent', true);
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
    -- Best-effort release if booking insert failed after hold
    if v_hold_id is not null then
      perform public.release_rental_inventory_hold(v_hold_id, 'claim_rollback');
    end if;
    return jsonb_build_object('ok', false, 'error', 'claim_failed', 'detail', sqlerrm);
end;
$$;

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
  set purchase_snapshot = v_snap,
      updated_at = now()
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

-- Supplier-authorized ops status update (handover / return).
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
  if v_ops = 'returned' and v_prev not in ('collected', 'returned') then
    return jsonb_build_object('ok', false, 'error', 'collect_before_return');
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

revoke all on function public.claim_rental_checkout_booking(uuid, text, integer, timestamptz, timestamptz, text, text, uuid, numeric, text, jsonb, text, timestamptz, integer) from public;
revoke all on function public.confirm_rental_checkout_paid(uuid) from public;
revoke all on function public.release_rental_checkout_booking(uuid, text) from public;
revoke all on function public.set_rental_ops_status(uuid, text) from public;

grant execute on function public.claim_rental_checkout_booking(uuid, text, integer, timestamptz, timestamptz, text, text, uuid, numeric, text, jsonb, text, timestamptz, integer) to service_role;
grant execute on function public.confirm_rental_checkout_paid(uuid) to service_role;
grant execute on function public.release_rental_checkout_booking(uuid, text) to service_role;
grant execute on function public.set_rental_ops_status(uuid, text) to authenticated, service_role;

comment on function public.claim_rental_checkout_booking is
  'Creates pending rental booking + inventory hold. service_role only. Publish gate 282 still applies.';
comment on function public.confirm_rental_checkout_paid is
  'After verified payment: confirm inventory hold linked to booking.';
comment on function public.set_rental_ops_status is
  'Supplier handover/return status on purchase_snapshot.rentalOpsStatus.';
