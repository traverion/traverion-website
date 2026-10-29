-- Public rental PDP needs occupancy for intelligent slot guidance without unpaid holds.
-- Re-grant evaluate (7-arg) to anon after mig 292 dropped the public 6-arg grant.
-- Occupancy RPC returns anonymized windows only (no guest PII).

grant execute on function public.evaluate_rental_availability(
  uuid, text, integer, timestamptz, timestamptz, uuid, text
) to anon, authenticated, service_role;

create or replace function public.rental_public_occupancy(
  p_listing_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_family text;
  v_has_rental boolean;
  v_rows jsonb;
  v_blocks jsonb;
begin
  if p_listing_id is null or p_range_start is null or p_range_end is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;
  if p_range_end <= p_range_start then
    return jsonb_build_object('ok', false, 'error', 'invalid_range');
  end if;

  select lower(trim(coalesce(status, ''))),
         lower(trim(coalesce(listing_extras->>'inventoryFamily', ''))),
         (listing_extras ? 'rental')
    into v_status, v_family, v_has_rental
  from public.listings
  where id = p_listing_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'listing_not_found');
  end if;
  if v_status is distinct from 'published' then
    return jsonb_build_object('ok', false, 'error', 'listing_not_public');
  end if;
  if v_family is distinct from 'rental' and v_has_rental is not true then
    return jsonb_build_object('ok', false, 'error', 'not_a_rental');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variantId', h.variant_id,
        'quantity', h.quantity,
        'startsAt', h.starts_at,
        'endsAt', h.ends_at
      )
      order by h.starts_at
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.rental_inventory_holds h
  where h.listing_id = p_listing_id
    and h.status in ('held', 'confirmed')
    and (
      h.status = 'confirmed'
      or h.hold_expires_at is null
      or h.hold_expires_at > now()
    )
    and h.starts_at < p_range_end
    and h.ends_at > p_range_start;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variantId', b.variant_id,
        'startsAt', b.starts_at,
        'endsAt', b.ends_at
      )
      order by b.starts_at
    ),
    '[]'::jsonb
  )
  into v_blocks
  from public.rental_availability_blocks b
  where b.listing_id = p_listing_id
    and b.starts_at < p_range_end
    and b.ends_at > p_range_start;

  return jsonb_build_object(
    'ok', true,
    'bufferMinutes', public.rental_listing_buffer_minutes(p_listing_id),
    'occupancies', v_rows,
    'blocks', v_blocks
  );
end;
$$;

revoke all on function public.rental_public_occupancy(uuid, timestamptz, timestamptz) from public;
grant execute on function public.rental_public_occupancy(uuid, timestamptz, timestamptz)
  to anon, authenticated, service_role;

comment on function public.rental_public_occupancy(uuid, timestamptz, timestamptz) is
  'Anonymized rental occupancy + blocks for published listings. Powers PDP slot guidance without unpaid holds.';
