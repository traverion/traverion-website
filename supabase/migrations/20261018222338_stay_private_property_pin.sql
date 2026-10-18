-- Exact property pin and structured address parts stay with the private arrival address.
-- Public listing_extras is unchanged. Nullable columns keep older rows valid.

alter table public.listing_stay_private
  add column if not exists address_street text,
  add column if not exists address_unit text,
  add column if not exists address_postal text,
  add column if not exists pin_lat double precision,
  add column if not exists pin_lng double precision,
  add column if not exists pin_place_id text;

alter table public.listing_stay_private
  drop constraint if exists listing_stay_private_address_street_len,
  drop constraint if exists listing_stay_private_address_unit_len,
  drop constraint if exists listing_stay_private_address_postal_len,
  drop constraint if exists listing_stay_private_pin_place_len,
  drop constraint if exists listing_stay_private_pin_range;

alter table public.listing_stay_private
  add constraint listing_stay_private_address_street_len check (
    address_street is null or char_length(address_street) <= 160
  ),
  add constraint listing_stay_private_address_unit_len check (
    address_unit is null or char_length(address_unit) <= 40
  ),
  add constraint listing_stay_private_address_postal_len check (
    address_postal is null or char_length(address_postal) <= 16
  ),
  add constraint listing_stay_private_pin_place_len check (
    pin_place_id is null or char_length(pin_place_id) <= 200
  ),
  add constraint listing_stay_private_pin_range check (
    (pin_lat is null and pin_lng is null)
    or (
      pin_lat between -90 and 90
      and pin_lng between -180 and 180
    )
  );

comment on column public.listing_stay_private.pin_lat is
  'Property pin from a resolved street address or a supplier drag. Not the public city center.';
comment on column public.listing_stay_private.pin_place_id is
  'Places id for the private property address. Not the public destination place.';
