-- Stripe Phase 1: payment fields on bookings (idempotent; safe if already applied manually)

alter table public.bookings
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_provider text not null default 'stripe',
  add column if not exists checkout_session_id text,
  add column if not exists payment_intent_id text,
  add column if not exists amount_paid numeric(12,2),
  add column if not exists paid_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_payment_status_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_payment_status_check
      check (payment_status in ('pending','paid','failed','refunded'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_payment_provider_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_payment_provider_check
      check (payment_provider in ('stripe'));
  end if;
end $$;

create unique index if not exists bookings_checkout_session_id_uidx
  on public.bookings (checkout_session_id)
  where checkout_session_id is not null;

create index if not exists bookings_payment_intent_id_idx
  on public.bookings (payment_intent_id)
  where payment_intent_id is not null;

create index if not exists bookings_payment_status_idx
  on public.bookings (payment_status);
