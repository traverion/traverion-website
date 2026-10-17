-- Checkout inserts a booking hold before Stripe. The BEFORE INSERT trigger
-- calls booking_public_reference(), which used unqualified gen_random_bytes().
-- On this project pgcrypto lives in the extensions schema, and the API role
-- search_path does not include it, so Postgres raised:
--   function gen_random_bytes(integer) does not exist
-- Qualify the CSPRNG and pin search_path. Do not replace it with random().
-- pgcrypto is already installed in the extensions schema on Supabase.

create or replace function public.booking_public_reference()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea;
  out text := 'TV-';
  i int;
begin
  raw := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end;
$$;

comment on function public.booking_public_reference() is
  'Customer-facing TV- code. Uses extensions.gen_random_bytes so a checkout insert works when search_path is public only.';
