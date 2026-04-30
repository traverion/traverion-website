-- Stripe webhook idempotency + payment audit (idempotent)

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  error_message text
);

create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at desc);

create table if not exists public.booking_payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_id text,
  event_type text not null,
  payment_intent_id text,
  checkout_session_id text,
  amount numeric(12,2),
  currency text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_payment_events_booking_id_idx
  on public.booking_payment_events (booking_id);

create index if not exists booking_payment_events_event_id_idx
  on public.booking_payment_events (event_id);
