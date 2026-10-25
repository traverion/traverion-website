-- Rental inventory claim / release / evaluate (additive).
-- Public checkout stays disabled (282). Holds are server-authoritative only.
-- Interval semantics: half-open [starts_at, ends_at); buffer applied after return.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.rental_listing_variant_stock(
  p_listing_id uuid,
  p_variant_id text
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_extras jsonb;
  v_family text;
  v_variants jsonb;
  v_row jsonb;
  v_qty integer := 0;
begin
  if p_listing_id is null or nullif(trim(p_variant_id), '') is null then
    return 0;
  end if;

  select listing_extras into v_extras
  from public.listings
  where id = p_listing_id;

  if v_extras is null then
    return 0;
  end if;

  v_family := coalesce(nullif(trim(v_extras->>'inventoryFamily'), ''), 'tour');
  if v_family is distinct from 'rental' then
    return 0;
  end if;

  v_variants := coalesce(v_extras->'rental'->'variants', '[]'::jsonb);
  if jsonb_typeof(v_variants) is distinct from 'array' then
    return 0;
  end if;

  for v_row in select * from jsonb_array_elements(v_variants)
  loop
    if trim(coalesce(v_row->>'id', '')) = trim(p_variant_id) then
      begin
        v_qty := greatest(0, floor(coalesce((v_row->>'quantity')::numeric, 0))::integer);
      exception when others then
        v_qty := 0;
      end;
      return v_qty;
    end if;
  end loop;

  return 0;
end;
$$;

create or replace function public.rental_listing_buffer_minutes(p_listing_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_buf integer;
begin
  select greatest(
    0,
    least(
      24 * 60,
      coalesce(
        nullif((listing_extras->'rental'->>'bufferMinutes')::numeric, null)::integer,
        0
      )
    )
  )
  into v_buf
  from public.listings
  where id = p_listing_id;

  return coalesce(v_buf, 0);
exception when others then
  return 0;
end;
$$;

create or replace function public.rental_occupied_end(
  p_ends_at timestamptz,
  p_buffer_minutes integer
)
returns timestamptz
language sql
immutable
as $$
  select p_ends_at + make_interval(mins => greatest(0, coalesce(p_buffer_minutes, 0)));
$$;

-- ---------------------------------------------------------------------------
-- Evaluate availability (read-only authoritative)
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_rental_availability(
  p_listing_id uuid,
  p_variant_id text,
  p_quantity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_hold_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_buffer integer;
  v_occ_end timestamptz;
  v_reserved integer;
  v_available integer;
  v_blocked boolean;
begin
  perform public.expire_stale_rental_holds(p_listing_id);

  if p_listing_id is null or nullif(trim(p_variant_id), '') is null then
    return jsonb_build_object('ok', false, 'error', 'listing_and_variant_required');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return jsonb_build_object('ok', false, 'error', 'invalid_interval');
  end if;

  v_stock := public.rental_listing_variant_stock(p_listing_id, p_variant_id);
  if v_stock < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_stock', 'available', 0, 'stock', 0);
  end if;

  v_buffer := public.rental_listing_buffer_minutes(p_listing_id);
  v_occ_end := public.rental_occupied_end(p_ends_at, v_buffer);

  select exists (
    select 1
    from public.rental_availability_blocks b
    where b.listing_id = p_listing_id
      and (b.variant_id is null or b.variant_id = trim(p_variant_id))
      and b.starts_at < v_occ_end
      and p_starts_at < b.ends_at
  ) into v_blocked;

  if v_blocked then
    return jsonb_build_object(
      'ok', false,
      'error', 'blocked',
      'available', 0,
      'stock', v_stock,
      'occupied_start', p_starts_at,
      'occupied_end', v_occ_end
    );
  end if;

  select coalesce(sum(h.quantity), 0)
  into v_reserved
  from public.rental_inventory_holds h
  where h.listing_id = p_listing_id
    and h.variant_id = trim(p_variant_id)
    and h.status in ('held', 'confirmed')
    and (p_exclude_hold_id is null or h.id <> p_exclude_hold_id)
    and h.starts_at < v_occ_end
    and p_starts_at < h.ends_at
    and (
      h.status = 'confirmed'
      or h.hold_expires_at is null
      or h.hold_expires_at > now()
    );

  v_available := greatest(0, v_stock - coalesce(v_reserved, 0));

  if p_quantity > v_available then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_stock',
      'available', v_available,
      'stock', v_stock,
      'reserved', coalesce(v_reserved, 0),
      'occupied_start', p_starts_at,
      'occupied_end', v_occ_end
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'available', v_available,
    'stock', v_stock,
    'reserved', coalesce(v_reserved, 0),
    'occupied_start', p_starts_at,
    'occupied_end', v_occ_end,
    'buffer_minutes', v_buffer
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic claim
-- ---------------------------------------------------------------------------

create or replace function public.claim_rental_inventory_hold(
  p_listing_id uuid,
  p_variant_id text,
  p_quantity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_idempotency_key text,
  p_hold_ttl_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_key bigint;
  v_eval jsonb;
  v_hold public.rental_inventory_holds%rowtype;
  v_ttl integer;
  v_buffer integer;
  v_occ_end timestamptz;
  v_key text;
  v_family text;
begin
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
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

  select coalesce(nullif(trim(listing_extras->>'inventoryFamily'), ''), 'tour')
  into v_family
  from public.listings
  where id = p_listing_id;

  if v_family is distinct from 'rental' then
    return jsonb_build_object('ok', false, 'error', 'not_a_rental_listing');
  end if;

  -- Idempotent replay before lock when possible
  select * into v_hold
  from public.rental_inventory_holds
  where listing_id = p_listing_id
    and idempotency_key = v_key;

  if found then
    if v_hold.status in ('held', 'confirmed')
       and v_hold.variant_id = trim(p_variant_id)
       and v_hold.quantity = p_quantity
       and v_hold.starts_at = p_starts_at
       and abs(extract(epoch from (v_hold.ends_at - public.rental_occupied_end(
         p_ends_at, public.rental_listing_buffer_minutes(p_listing_id)
       )))) < 1
    then
      return jsonb_build_object(
        'ok', true,
        'hold_id', v_hold.id,
        'status', v_hold.status,
        'idempotent', true,
        'hold_expires_at', v_hold.hold_expires_at
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'idempotency_conflict', 'hold_id', v_hold.id);
  end if;

  v_lock_key := hashtext('rental|' || p_listing_id::text || '|' || trim(p_variant_id))::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Re-check idempotency under lock
  select * into v_hold
  from public.rental_inventory_holds
  where listing_id = p_listing_id
    and idempotency_key = v_key;
  if found then
    return jsonb_build_object(
      'ok', true,
      'hold_id', v_hold.id,
      'status', v_hold.status,
      'idempotent', true,
      'hold_expires_at', v_hold.hold_expires_at
    );
  end if;

  v_eval := public.evaluate_rental_availability(
    p_listing_id, trim(p_variant_id), p_quantity, p_starts_at, p_ends_at, null
  );
  if coalesce((v_eval->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_eval->>'error', 'unavailable'),
      'available', coalesce((v_eval->>'available')::integer, 0),
      'stock', (v_eval->>'stock')::integer,
      'reserved', (v_eval->>'reserved')::integer
    );
  end if;

  v_buffer := public.rental_listing_buffer_minutes(p_listing_id);
  v_occ_end := public.rental_occupied_end(p_ends_at, v_buffer);
  v_ttl := greatest(1, least(120, coalesce(p_hold_ttl_minutes, 15)));

  insert into public.rental_inventory_holds (
    listing_id,
    variant_id,
    quantity,
    starts_at,
    ends_at,
    status,
    hold_expires_at,
    idempotency_key
  ) values (
    p_listing_id,
    trim(p_variant_id),
    p_quantity,
    p_starts_at,
    v_occ_end,
    'held',
    now() + make_interval(mins => v_ttl),
    v_key
  )
  returning * into v_hold;

  return jsonb_build_object(
    'ok', true,
    'hold_id', v_hold.id,
    'status', v_hold.status,
    'idempotent', false,
    'hold_expires_at', v_hold.hold_expires_at,
    'occupied_start', v_hold.starts_at,
    'occupied_end', v_hold.ends_at,
    'available_after', coalesce((v_eval->>'available')::integer, 0) - p_quantity
  );
exception
  when unique_violation then
    select * into v_hold
    from public.rental_inventory_holds
    where listing_id = p_listing_id and idempotency_key = v_key;
    if found then
      return jsonb_build_object(
        'ok', true,
        'hold_id', v_hold.id,
        'status', v_hold.status,
        'idempotent', true,
        'hold_expires_at', v_hold.hold_expires_at
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
end;
$$;

-- ---------------------------------------------------------------------------
-- Release / confirm
-- ---------------------------------------------------------------------------

create or replace function public.release_rental_inventory_hold(
  p_hold_id uuid,
  p_reason text default 'released'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.rental_inventory_holds%rowtype;
begin
  if p_hold_id is null then
    return jsonb_build_object('ok', false, 'error', 'hold_required');
  end if;

  update public.rental_inventory_holds
  set status = 'released',
      updated_at = now(),
      hold_expires_at = coalesce(hold_expires_at, now())
  where id = p_hold_id
    and status in ('held', 'confirmed')
  returning * into v_hold;

  if not found then
    select * into v_hold from public.rental_inventory_holds where id = p_hold_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'hold_not_found');
    end if;
    -- Already terminal — idempotent success
    if v_hold.status in ('released', 'expired') then
      return jsonb_build_object('ok', true, 'hold_id', v_hold.id, 'status', v_hold.status, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_hold.status);
  end if;

  return jsonb_build_object(
    'ok', true,
    'hold_id', v_hold.id,
    'status', v_hold.status,
    'reason', left(coalesce(p_reason, 'released'), 80)
  );
end;
$$;

create or replace function public.confirm_rental_inventory_hold(
  p_hold_id uuid,
  p_booking_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.rental_inventory_holds%rowtype;
begin
  if p_hold_id is null then
    return jsonb_build_object('ok', false, 'error', 'hold_required');
  end if;

  perform public.expire_stale_rental_holds(null);

  select * into v_hold from public.rental_inventory_holds where id = p_hold_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'hold_not_found');
  end if;

  if v_hold.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'hold_id', v_hold.id, 'status', 'confirmed', 'idempotent', true);
  end if;

  if v_hold.status is distinct from 'held' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_hold.status);
  end if;

  if v_hold.hold_expires_at is not null and v_hold.hold_expires_at < now() then
    update public.rental_inventory_holds
    set status = 'expired', updated_at = now()
    where id = p_hold_id;
    return jsonb_build_object('ok', false, 'error', 'hold_expired');
  end if;

  update public.rental_inventory_holds
  set status = 'confirmed',
      booking_id = coalesce(p_booking_id, booking_id),
      hold_expires_at = null,
      updated_at = now()
  where id = p_hold_id
  returning * into v_hold;

  return jsonb_build_object('ok', true, 'hold_id', v_hold.id, 'status', 'confirmed', 'booking_id', v_hold.booking_id);
end;
$$;

-- Reserved qty for a variant over an optional window (null window = all future/active).
create or replace function public.rental_variant_reserved_quantity(
  p_listing_id uuid,
  p_variant_id text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved integer;
  v_start timestamptz := coalesce(p_starts_at, '-infinity'::timestamptz);
  v_end timestamptz := coalesce(p_ends_at, 'infinity'::timestamptz);
begin
  perform public.expire_stale_rental_holds(p_listing_id);

  select coalesce(sum(h.quantity), 0)
  into v_reserved
  from public.rental_inventory_holds h
  where h.listing_id = p_listing_id
    and h.variant_id = trim(p_variant_id)
    and h.status in ('held', 'confirmed')
    and h.starts_at < v_end
    and v_start < h.ends_at
    and (
      h.status = 'confirmed'
      or h.hold_expires_at is null
      or h.hold_expires_at > now()
    );

  return coalesce(v_reserved, 0);
end;
$$;

revoke all on function public.rental_listing_variant_stock(uuid, text) from public;
revoke all on function public.rental_listing_buffer_minutes(uuid) from public;
revoke all on function public.rental_occupied_end(timestamptz, integer) from public;
revoke all on function public.evaluate_rental_availability(uuid, text, integer, timestamptz, timestamptz, uuid) from public;
revoke all on function public.claim_rental_inventory_hold(uuid, text, integer, timestamptz, timestamptz, text, integer) from public;
revoke all on function public.release_rental_inventory_hold(uuid, text) from public;
revoke all on function public.confirm_rental_inventory_hold(uuid, uuid) from public;
revoke all on function public.rental_variant_reserved_quantity(uuid, text, timestamptz, timestamptz) from public;

-- Claim/confirm/release: service role only (checkout edge functions later).
grant execute on function public.claim_rental_inventory_hold(uuid, text, integer, timestamptz, timestamptz, text, integer) to service_role;
grant execute on function public.release_rental_inventory_hold(uuid, text) to service_role;
grant execute on function public.confirm_rental_inventory_hold(uuid, uuid) to service_role;

-- Evaluate + reserved: suppliers (partner calendar) and service role.
grant execute on function public.evaluate_rental_availability(uuid, text, integer, timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.rental_variant_reserved_quantity(uuid, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.rental_listing_variant_stock(uuid, text) to authenticated, service_role;
grant execute on function public.rental_listing_buffer_minutes(uuid) to authenticated, service_role;

comment on function public.claim_rental_inventory_hold(uuid, text, integer, timestamptz, timestamptz, text, integer) is
  'Atomic rental hold with listing+variant advisory lock. Not wired to public checkout.';
comment on function public.evaluate_rental_availability(uuid, text, integer, timestamptz, timestamptz, uuid) is
  'Authoritative rental availability against blocks + live holds.';
