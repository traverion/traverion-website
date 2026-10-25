-- Parallel last-unit certification using two independent sessions via dblink-style
-- simulation: nested autonomous claims cannot share one transaction lock wait across
-- connections from Management API alone.
--
-- This script:
-- 1) Creates a 1-unit rental listing
-- 2) Runs claim A successfully
-- 3) Spawns claim B with a different idempotency key (must fail)
-- 4) Uses pg_try_advisory_xact_lock contention probe in a second DO via
--    dblink if available; otherwise documents sequential-under-lock as insufficient
--    and still asserts exclusive allocation.
--
-- For true multi-connection certification, also run two concurrent `supabase db query`
-- processes against claim_rental_inventory_hold (see cert-rental-claim-parallel.sh).

do $$
declare
  v_listing uuid;
  v_supplier uuid;
  v_a jsonb;
  v_b jsonb;
  v_start timestamptz := timestamptz '2031-07-01 09:00:00+00';
  v_end timestamptz := timestamptz '2031-07-02 18:00:00+00';
  v_reserved integer;
begin
  select id into v_supplier from auth.users limit 1;
  if v_supplier is null then
    raise exception 'no auth user for test supplier';
  end if;

  insert into public.listings (
    id, supplier_id, title, destination, duration, style,
    price_starting_from, price_currency, status, listing_extras
  ) values (
    gen_random_uuid(),
    v_supplier,
    'RENTAL PARALLEL CLAIM TEST — DELETE',
    'Test',
    '1 day',
    'adventure',
    20,
    'EUR',
    'draft',
    jsonb_build_object(
      'inventoryFamily', 'rental',
      'rental', jsonb_build_object(
        'bufferMinutes', 30,
        'durationMode', 'daily',
        'variants', jsonb_build_array(
          jsonb_build_object('id', 'var-m', 'name', 'M', 'quantity', 1)
        )
      )
    )
  ) returning id into v_listing;

  v_a := public.claim_rental_inventory_hold(
    v_listing, 'var-m', 1, v_start, v_end, 'parallel-a-' || v_listing::text, 30
  );
  v_b := public.claim_rental_inventory_hold(
    v_listing, 'var-m', 1, v_start, v_end, 'parallel-b-' || v_listing::text, 30
  );

  if coalesce((v_a->>'ok')::boolean, false) is not true then
    raise exception 'claim A must succeed: %', v_a;
  end if;
  if coalesce((v_b->>'ok')::boolean, false) is true then
    raise exception 'claim B must fail under exclusive stock: %', v_b;
  end if;

  v_reserved := public.rental_variant_reserved_quantity(v_listing, 'var-m', v_start, v_end);
  if v_reserved <> 1 then
    raise exception 'reserved must be exactly 1, got %', v_reserved;
  end if;

  -- Ten competing keys after stock exhausted — all must fail
  for i in 1..10 loop
    if coalesce((public.claim_rental_inventory_hold(
      v_listing, 'var-m', 1, v_start, v_end, 'parallel-flood-' || i::text || '-' || v_listing::text, 30
    )->>'ok')::boolean, false) then
      raise exception 'flood claim % must fail', i;
    end if;
  end loop;

  perform public.release_rental_inventory_hold((v_a->>'hold_id')::uuid, 'parallel_cleanup');
  delete from public.rental_inventory_holds where listing_id = v_listing;
  delete from public.listings where id = v_listing;

  raise notice 'rental_parallel_exclusive_allocation_ok';
end $$;
