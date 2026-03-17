-- Supplier payout method (bank / PayPal) – stored for when payment is integrated
-- Run after 009

alter table public.supplier_profiles
  add column if not exists payout_method text check (payout_method in ('bank', 'paypal', 'none') or payout_method is null),
  add column if not exists payout_iban text,
  add column if not exists payout_bic text,
  add column if not exists payout_paypal_email text;

comment on column public.supplier_profiles.payout_method is 'bank | paypal | none – used when payouts are implemented';
comment on column public.supplier_profiles.payout_iban is 'IBAN for bank payouts';
comment on column public.supplier_profiles.payout_bic is 'BIC/SWIFT for bank payouts';
comment on column public.supplier_profiles.payout_paypal_email is 'PayPal email for payouts';
