do $$
declare
  v_supplier uuid := 'a11ce001-d000-4000-8000-000000000001';
  v_listing uuid;
  v_booking uuid;
  v_res jsonb;
  v_status text;
  v_bstatus text;
  v_pay text;
begin
  insert into public.listings (
    supplier_id, title, destination, duration, description, status, city, country,
    price_starting_from, price_currency, image
  ) values (
    v_supplier,
    'Phase1003 moderation probe',
    'Rovaniemi',
    '2 hours',
    'Temporary listing for staff force-unpublish certification. Safe to draft.',
    'published',
    'Rovaniemi',
    'Finland',
    10,
    'EUR',
    'http://127.0.0.1:5173/vacation1.jpg'
  ) returning id into v_listing;

  insert into public.bookings (
    listing_id, guest_email, guest_name, guests, booking_date, status, payment_status, amount_paid, currency
  ) values (
    v_listing, 'probe1003@example.com', 'Probe Guest', 1,
    (timezone('utc', now()))::date + 14,
    'confirmed', 'paid', 10, 'EUR'
  ) returning id into v_booking;

  v_res := public.admin_force_unpublish_listing(v_listing, 'Phase 1003 certification probe', null, 'phase1003@traverion.test');
  if (v_res->>'ok')::boolean is not true or coalesce((v_res->>'skipped')::boolean, false) is true then
    raise exception 'force unpublish failed: %', v_res;
  end if;
  if (v_res->>'upcoming_paid_bookings')::int < 1 then
    raise exception 'expected upcoming paid >=1, got %', v_res;
  end if;

  select status into v_status from public.listings where id = v_listing;
  if v_status <> 'draft' then raise exception 'listing not draft: %', v_status; end if;

  select status, payment_status into v_bstatus, v_pay from public.bookings where id = v_booking;
  if v_bstatus <> 'confirmed' or v_pay <> 'paid' then
    raise exception 'booking corrupted: % / %', v_bstatus, v_pay;
  end if;

  delete from public.bookings where id = v_booking;
  delete from public.admin_listing_moderation_events where listing_id = v_listing;
  delete from public.listings where id = v_listing;

  raise notice 'PHASE_1003_PASS';
end;
$$;
