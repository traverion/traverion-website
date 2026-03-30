-- Privacy policy and terms & conditions text shown to guests for this supplier's bookings.
alter table public.supplier_profiles
  add column if not exists privacy_policy_text text,
  add column if not exists terms_conditions_text text;

comment on column public.supplier_profiles.privacy_policy_text is
  'Operator-authored privacy policy; public read; shown on listing/booking flows.';
comment on column public.supplier_profiles.terms_conditions_text is
  'Operator-authored terms & conditions; public read; shown on listing/booking flows.';
