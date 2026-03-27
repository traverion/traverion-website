-- Require storing supplier signup phone in profile data.
alter table public.supplier_profiles
  add column if not exists contact_phone text;

comment on column public.supplier_profiles.contact_phone is
  'Primary contact phone collected during supplier signup.';
