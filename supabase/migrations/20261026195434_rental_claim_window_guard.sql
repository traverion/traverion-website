-- Rental claim window guard.
-- Checkout and publication stay disabled. This only rejects invalid intervals,
-- reserved preview ids, closed hours, booking notice, and duration limits.
-- Interval occupancy remains half-open [starts_at, occupied_end).

create or replace function public.rental_window_issue(
  p_listing_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_unit text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_extras jsonb;
  v_rental jsonb;
  v_tz text;
  v_mode text;
  v_days jsonb;
  v_local_start timestamp;
  v_local_end timestamp;
  v_dow integer;
  v_keys text[] := array['sun','mon','tue','wed','thu','fri','sat'];
  v_pickup_key text;
  v_return_key text;
  v_pickup_day jsonb;
  v_return_day jsonb;
  v_hm text;
  v_earliest text;
  v_latest text;
  v_notice numeric;
  v_hours integer;
  v_span integer;
  v_count integer;
  v_min integer;
  v_max integer;
begin
  if p_listing_id is null or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return 'Choose valid pickup and return times.';
  end if;

  select listing_extras into v_extras
  from public.listings
  where id = p_listing_id;

  v_rental := coalesce(v_extras->'rental', '{}'::jsonb);
  v_tz := nullif(trim(coalesce(v_extras->>'departureTimezone', '')), '');
  if v_tz is null then
    return 'This rental is missing a valid timezone, so it cannot be reserved.';
  end if;

  begin
    v_local_start := timezone(v_tz, p_starts_at);
    v_local_end := timezone(v_tz, p_ends_at);
  exception
    when others then
      return 'This rental is missing a valid timezone, so it cannot be reserved.';
  end;

  if v_local_end::date < v_local_start::date then
    return 'Return date must be on or after the pickup date.';
  end if;

  v_mode := coalesce(nullif(trim(v_rental->>'durationMode'), ''), 'daily');
  if p_duration_unit = 'hour' and v_mode not in ('hourly', 'both') then
    return 'This rental does not offer hourly pricing.';
  end if;
  if p_duration_unit = 'day' and v_mode not in ('daily', 'both') then
    return 'This rental does not offer daily pricing.';
  end if;

  v_days := v_rental->'operatingDays';
  if jsonb_typeof(v_days) = 'array' and jsonb_array_length(v_days) > 0 then
    v_dow := extract(dow from v_local_start)::integer;
    v_pickup_key := v_keys[v_dow + 1];
    v_dow := extract(dow from v_local_end)::integer;
    v_return_key := v_keys[v_dow + 1];

    select elem into v_pickup_day
    from jsonb_array_elements(v_days) elem
    where elem->>'day' = v_pickup_key
    limit 1;
    select elem into v_return_day
    from jsonb_array_elements(v_days) elem
    where elem->>'day' = v_return_key
    limit 1;

    if v_pickup_day is null or coalesce(v_pickup_day->'open', 'false'::jsonb) is distinct from 'true'::jsonb then
      return 'Pickup is outside the opening days.';
    end if;
    if v_return_day is null or coalesce(v_return_day->'open', 'false'::jsonb) is distinct from 'true'::jsonb then
      return 'Return is outside the opening days.';
    end if;

    v_hm := to_char(v_local_start, 'HH24:MI');
    v_earliest := nullif(trim(coalesce(v_pickup_day->>'earliestPickupHm', '')), '');
    v_latest := nullif(trim(coalesce(v_pickup_day->>'latestPickupHm', '')), '');
    if v_earliest ~ '^\d{2}:\d{2}$' and v_latest ~ '^\d{2}:\d{2}$' then
      if v_hm::time < v_earliest::time or v_hm::time > v_latest::time then
        return format('Pickup time must be between %s and %s.', v_earliest, v_latest);
      end if;
    end if;

    v_hm := to_char(v_local_end, 'HH24:MI');
    v_earliest := nullif(trim(coalesce(v_return_day->>'earliestReturnHm', '')), '');
    v_latest := nullif(trim(coalesce(v_return_day->>'latestReturnHm', '')), '');
    if v_earliest ~ '^\d{2}:\d{2}$' and v_latest ~ '^\d{2}:\d{2}$' then
      if v_hm::time < v_earliest::time or v_hm::time > v_latest::time then
        return format('Return time must be between %s and %s.', v_earliest, v_latest);
      end if;
    end if;
  end if;

  begin
    v_notice := coalesce((v_rental->>'bookingNoticeHours')::numeric, 0);
  exception
    when others then
      v_notice := 0;
  end;
  if v_notice > 0 and p_starts_at < now() + make_interval(mins => round(v_notice * 60)::integer) then
    return format('Book at least %s hour%s before pickup.', trim(to_char(v_notice, 'FM999990.99')), case when v_notice = 1 then '' else 's' end);
  end if;

  v_hours := ceil(extract(epoch from (p_ends_at - p_starts_at)) / 3600.0)::integer;
  v_span := (v_local_end::date - v_local_start::date);
  v_count := case when v_span <= 0 then 1 else v_span end;

  if coalesce(v_rental->>'minDurationHours', '') ~ '^\d+(\.\d+)?$' then
    v_min := greatest(1, round((v_rental->>'minDurationHours')::numeric)::integer);
  else
    v_min := 1;
  end if;
  if coalesce(v_rental->>'maxDurationHours', '') ~ '^\d+(\.\d+)?$' then
    v_max := greatest(v_min, round((v_rental->>'maxDurationHours')::numeric)::integer);
  else
    v_max := greatest(v_min, 720);
  end if;
  if v_mode = 'hourly' or p_duration_unit = 'hour' then
    if v_hours < v_min then
      return format('Minimum rental is %s hour%s.', v_min, case when v_min = 1 then '' else 's' end);
    end if;
    if v_hours > v_max then
      return format('Maximum rental is %s hours.', v_max);
    end if;
  elsif v_mode = 'daily' or p_duration_unit = 'day' then
    if coalesce(v_rental->>'minDurationDays', '') ~ '^\d+(\.\d+)?$' then
      v_min := greatest(1, round((v_rental->>'minDurationDays')::numeric)::integer);
    else
      v_min := 1;
    end if;
    if coalesce(v_rental->>'maxDurationDays', '') ~ '^\d+(\.\d+)?$' then
      v_max := greatest(v_min, round((v_rental->>'maxDurationDays')::numeric)::integer);
    else
      v_max := greatest(v_min, 90);
    end if;
    if v_count < v_min then
      return format('Minimum rental is %s day%s.', v_min, case when v_min = 1 then '' else 's' end);
    end if;
    if v_count > v_max then
      return format('Maximum rental is %s days.', v_max);
    end if;
  elsif v_mode = 'both' and p_duration_unit is null then
    if not (v_hours between v_min and v_max) then
      if coalesce(v_rental->>'minDurationDays', '') ~ '^\d+(\.\d+)?$' then
        v_min := greatest(1, round((v_rental->>'minDurationDays')::numeric)::integer);
      else
        v_min := 1;
      end if;
      if coalesce(v_rental->>'maxDurationDays', '') ~ '^\d+(\.\d+)?$' then
        v_max := greatest(v_min, round((v_rental->>'maxDurationDays')::numeric)::integer);
      else
        v_max := greatest(v_min, 90);
      end if;
      if v_count < v_min or v_count > v_max then
        return 'This rental length is outside the allowed duration.';
      end if;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.rental_window_issue(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.rental_window_issue(uuid, timestamptz, timestamptz, text) to service_role;

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
  v_issue text;
begin
  if p_listing_id in (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid,
    '00000000-0000-4000-8000-000000000004'::uuid,
    '00000000-0000-4000-8000-000000000005'::uuid,
    '00000000-0000-4000-8000-000000000006'::uuid
  ) then
    return jsonb_build_object('ok', false, 'error', 'Development preview rentals cannot be booked.');
  end if;

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

  v_issue := public.rental_window_issue(p_listing_id, p_starts_at, p_ends_at, null);
  if v_issue is not null then
    return jsonb_build_object('ok', false, 'error', v_issue);
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

revoke all on function public.evaluate_rental_availability(uuid, text, integer, timestamptz, timestamptz, uuid) from public;
grant execute on function public.evaluate_rental_availability(uuid, text, integer, timestamptz, timestamptz, uuid) to authenticated, service_role;

comment on function public.rental_window_issue(uuid, timestamptz, timestamptz, text) is
  'Rejects rental intervals outside listing timezone, opening hours, notice, and duration limits. Does not enable checkout.';
