-- Native Traverion API onboarding uses Custom connected accounts (TEST).
-- Existing Express account IDs remain valid; type is mirrored from Stripe when known.

alter table public.supplier_profiles
  add column if not exists connect_account_type text;

alter table public.supplier_profiles
  drop constraint if exists supplier_profiles_connect_account_type_check;

alter table public.supplier_profiles
  add constraint supplier_profiles_connect_account_type_check
  check (
    connect_account_type is null
    or connect_account_type in ('express', 'custom', 'standard')
  );

comment on column public.supplier_profiles.connect_account_type is
  'Stripe connected account type mirrored for routing (custom = Traverion API forms; express = embedded/hosted). Never trust browser-supplied values.';
