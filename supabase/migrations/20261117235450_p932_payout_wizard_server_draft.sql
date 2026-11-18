-- P9.32: Durable non-sensitive payout wizard progress on supplier_profiles.
-- Never store IBAN, bank tokens, identity document bytes, or full DOB here.
-- Full DOB is submitted only to Stripe when Connect create is allowed.

alter table public.supplier_profiles
  add column if not exists payout_wizard_draft jsonb not null default '{}'::jsonb;

alter table public.supplier_profiles
  add column if not exists payout_wizard_draft_updated_at timestamptz;

comment on column public.supplier_profiles.payout_wizard_draft is
  'P9.32 non-sensitive payout wizard progress (step markers, redacted rep fields). No IBAN/tokens/full DOB.';

comment on column public.supplier_profiles.payout_wizard_draft_updated_at is
  'Last time payout_wizard_draft was written by connect-supplier-onboarding.';
