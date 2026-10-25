-- Last-unit rental claim certification (linked DB).
-- Sequential under advisory lock path: first claim wins, second fails, idempotent replay ok.

do $$
declare
  v_listing uuid;
  v_supplier uuid;
  v_a jsonb;
  v_b jsonb;
  v_replay jsonb;
  v_start timestamptz := timestamptz '2030-06-01 09:00:00+00';
  v_end timestamptz := timestamptz '2030-06-03 18:00:00+00';
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
    'RENTAL CLAIM TEST — DELETE',
    'Test',
    '1 day',
    'adventure',
    20,
    'EUR',
    'draft',
    jsonb_build_object(
      'inventoryFamily', 'rental',
      'rental', jsonb_build_object(
        'bufferMinutes', 60,
        'durationMode', 'daily',
        'variants', jsonb_build_array(
          jsonb_build_object('id', 'var-m', 'name', 'M', 'quantity', 1)
        )
      )
    )
  ) returning id into v_listing;

  v_a := public.claim_rental_inventory_hold(
    v_listing, 'var-m', 1, v_start, v_end, 'test-claim-a-' || v_listing::text, 30
  );
  v_b := public.claim_rental_inventory_hold(
    v_listing, 'var-m', 1, v_start, v_end, 'test-claim-b-' || v_listing::text, 30
  );

  if coalesce((v_a->>'ok')::boolean, false) is not true then
    raise exception 'first claim should succeed: %', v_a;
  end if;
  if coalesce((v_b->>'ok')::boolean, false) is true then
    raise exception 'second claim must fail: %', v_b;
  end if;

  v_replay := public.claim_rental_inventory_hold(
    v_listing, 'var-m', 1, v_start, v_end, 'test-claim-a-' || v_listing::text, 30
  );
  if coalesce((v_replay->>'idempotent')::boolean, false) is not true then
    raise exception 'idempotent replay failed: %', v_replay;
  end if;

  perform public.release_rental_inventory_hold((v_a->>'hold_id')::uuid, 'test_cleanup');
  delete from public.rental_inventory_holds where listing_id = v_listing;
  delete from public.listings where id = v_listing;

  raise notice 'rental_last_unit_claim_ok';
end $$;
