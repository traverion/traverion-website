insert into public.listings (
  id, supplier_id, title, destination, duration, style,
  price_starting_from, price_currency, status, listing_extras
)
select
  gen_random_uuid(),
  u.id,
  'RENTAL RACE TEST — DELETE',
  'Test',
  '1 day',
  'adventure',
  20,
  'EUR',
  'draft',
  jsonb_build_object(
    'inventoryFamily', 'rental',
    'rental', jsonb_build_object(
      'bufferMinutes', 0,
      'durationMode', 'daily',
      'variants', jsonb_build_array(
        jsonb_build_object('id', 'race-m', 'name', 'M', 'quantity', 1)
      )
    )
  )
from auth.users u
limit 1
returning id;
