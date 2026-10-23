-- Archive previous Express (or other) connected account when starting native Custom onboarding in TEST.
-- Never deletes Stripe objects; preserves rollback reference.

alter table public.supplier_profiles
  add column if not exists connect_legacy_account_id text;

comment on column public.supplier_profiles.connect_legacy_account_id is
  'Previously linked Stripe connected account id archived when switching to Traverion-native Custom onboarding (TEST). Not used for transfers.';
