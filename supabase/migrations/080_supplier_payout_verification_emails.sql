-- Payout verification decisions never emailed the supplier (business verification
-- has done this since migration 074). A supplier whose IBAN/BIC is rejected blocks
-- listing publish (see isSupplierReadyToPublishTours) but had no way to learn that
-- short of re-opening the partner portal. Add the same idempotency markers used for
-- business verification so admin-supplier-verification can send matching emails.

alter table public.supplier_profiles
  add column if not exists payout_verified_email_sent_at timestamptz,
  add column if not exists payout_rejected_email_sent_at timestamptz;

comment on column public.supplier_profiles.payout_verified_email_sent_at is
  'When Traverion last emailed the supplier that payout (IBAN/BIC) verification was approved. Used to avoid duplicate approval emails on admin retry.';
comment on column public.supplier_profiles.payout_rejected_email_sent_at is
  'When Traverion last emailed the supplier that payout (IBAN/BIC) verification was rejected. Cleared when staff re-approves.';
