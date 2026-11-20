-- Disabled GetYourGuide ingestion ledger.
-- No anon or authenticated policies. The worker cannot write here until ingestion is approved.

create table if not exists public.external_booking_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('getyourguide')),
  external_id text not null,
  event_type text not null check (event_type in ('booking', 'cancellation', 'availability')),
  idempotency_key text not null,
  status text not null default 'received' check (status in ('received', 'applied', 'duplicate', 'failed')),
  received_at timestamptz not null default now(),
  unique (provider, idempotency_key)
);

alter table public.external_booking_events enable row level security;

revoke all on table public.external_booking_events from public, anon, authenticated;
grant select, insert, update, delete on table public.external_booking_events to service_role;
