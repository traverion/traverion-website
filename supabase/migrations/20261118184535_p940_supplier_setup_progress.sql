-- P9.40: Canonical non-sensitive supplier setup progress (unified onboarding).
-- Never store IBAN, bank tokens, identity document bytes, or full DOB here.
-- Business draft fields may mirror local resume; Traverion verification + Connect remain SoT.

alter table public.supplier_profiles
  add column if not exists setup_progress jsonb not null default '{}'::jsonb;

alter table public.supplier_profiles
  add column if not exists setup_progress_updated_at timestamptz;

comment on column public.supplier_profiles.setup_progress is
  'P9.40 unified supplier onboarding progress (phase markers, redacted business draft). No IBAN/tokens/full DOB.';

comment on column public.supplier_profiles.setup_progress_updated_at is
  'Last time setup_progress was written by the partner portal.';
