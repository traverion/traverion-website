-- Structured business address (street, country, city, postal). business_address remains as combined copy for templates / legacy.
alter table public.supplier_profiles
  add column if not exists address_street text,
  add column if not exists address_country text,
  add column if not exists address_city text,
  add column if not exists address_postal_code text;

comment on column public.supplier_profiles.address_street is 'Street / line 1 (building, street).';
comment on column public.supplier_profiles.address_country is 'Country as shown on registration.';
comment on column public.supplier_profiles.address_city is 'City or locality.';
comment on column public.supplier_profiles.address_postal_code is 'Postal or ZIP code.';
