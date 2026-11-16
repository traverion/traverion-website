-- Signing secret for the Accounts v2 thin-event destination.
-- Service role only. No supplier or client access.

create table if not exists public.stripe_webhook_signing_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_webhook_signing_secrets enable row level security;

revoke all on table public.stripe_webhook_signing_secrets from anon, authenticated;
