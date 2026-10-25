-- Certify cancel → rental hold release trigger (mig 287).
-- Safe: creates temp listing/booking/hold, cancels, asserts hold released, cleans up.

do $$
declare
  v_listing uuid;
  v_booking uuid;
  v_hold uuid;
  v_status text;
  v_supplier uuid;
begin
  select id into v_supplier from auth.users limit 1;
  if v_supplier is null then
    raise exception 'FAIL: no auth user for supplier_id';
  end if;

  insert into public.listings (
    id, supplier_id, title, destination, duration, style,
    status, price_starting_from, price_currency, listing_extras
  ) values (
    gen_random_uuid(),
    v_supplier,
    'CERT rental cancel release',
    'Test',
    '1 day',
    'adventure',
    'draft',
    10,
    'EUR',
    jsonb_build_object(
      'inventoryFamily', 'rental',
      'rental', jsonb_build_object(
        'durationMode', 'daily',
        'variants', jsonb_build_array(
          jsonb_build_object('id', 'cert-v', 'name', 'Unit', 'quantity', 1)
        )
      )
    )
  )
  returning id into v_listing;

  insert into public.rental_inventory_holds (
    listing_id, variant_id, quantity, starts_at, ends_at, status, hold_expires_at, idempotency_key
  ) values (
    v_listing, 'cert-v', 1,
    timestamptz '2032-01-01 09:00:00+00',
    timestamptz '2032-01-02 18:00:00+00',
    'held',
    now() + interval '1 hour',
    'cert-cancel-' || v_listing::text
  )
  returning id into v_hold;

  insert into public.bookings (
    listing_id, guest_email, guests, booking_date, check_out, nights,
    status, payment_status, total_amount, currency, booking_option_id, purchase_snapshot
  ) values (
    v_listing, 'cert-rental-cancel@example.com', 1, '2032-01-01', '2032-01-02', 1,
    'pending', 'pending', 10, 'EUR', 'cert-v',
    jsonb_build_object(
      'inventoryFamily', 'rental',
      'holdId', v_hold,
      'variantId', 'cert-v',
      'quantity', 1,
      'pickupAt', '2032-01-01T09:00:00Z',
      'returnAt', '2032-01-02T18:00:00Z',
      'durationCount', 1,
      'durationUnit', 'day',
      'unitMinor', 1000,
      'customerTotalMinor', 1000,
      'commissionMinor', 150,
      'supplierEarningsMinor', 850,
      'commissionBps', 1500,
      'discountApplied', false,
      'currency', 'EUR',
      'rentalOpsStatus', 'awaiting_pickup'
    )
  )
  returning id into v_booking;

  update public.rental_inventory_holds set booking_id = v_booking where id = v_hold;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking;

  select status into v_status from public.rental_inventory_holds where id = v_hold;
  if v_status is distinct from 'released' then
    raise exception 'FAIL: expected hold released, got %', v_status;
  end if;

  delete from public.rental_inventory_holds where listing_id = v_listing;
  delete from public.bookings where id = v_booking;
  delete from public.listings where id = v_listing;

  raise notice 'PASS: cancel released rental hold';
end $$;
