-- supplier_profiles_enforce_verification_lock() references address_street, address_country, address_city,
-- address_postal_code. If 030 was skipped, any UPDATE (e.g. business_logo_url) errors with:
--   record "new" has no field "address_street"
-- This migration is idempotent (IF NOT EXISTS).

alter table public.supplier_profiles
  add column if not exists address_street text,
  add column if not exists address_country text,
  add column if not exists address_city text,
  add column if not exists address_postal_code text;

comment on column public.supplier_profiles.address_street is 'Street / line 1 (building, street).';
comment on column public.supplier_profiles.address_country is 'Country as shown on registration.';
comment on column public.supplier_profiles.address_city is 'City or locality.';
comment on column public.supplier_profiles.address_postal_code is 'Postal or ZIP code.';
