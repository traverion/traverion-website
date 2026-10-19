-- Stay Request to Book: authorized payment hold + host approval window.
-- Instant booking (default) is unchanged. payment_status gains 'authorized'.

alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'authorized', 'paid', 'failed', 'refunded'));

alter table public.bookings
  add column if not exists approval_status text
  check (
    approval_status is null
    or approval_status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')
  );

alter table public.bookings
  add column if not exists approval_expires_at timestamptz;

alter table public.bookings
  add column if not exists approval_decided_at timestamptz;

alter table public.bookings
  add column if not exists approval_decided_by uuid references auth.users (id) on delete set null;

comment on column public.bookings.approval_status is
  'Stay Request to Book host decision. Null for Instant booking and tours.';

comment on column public.bookings.approval_expires_at is
  'When a pending Request to Book must be accepted by. Usually matches hold_expires_at (24h).';

create index if not exists bookings_approval_pending_expire_idx
  on public.bookings (approval_expires_at)
  where approval_status = 'pending' and payment_status = 'authorized';

-- Occupancy: authorized Request-to-Book rows block inventory until expire/cancel.
create or replace function public.booking_occupies_inventory(
  p_status text,
  p_payment_status text,
  p_hold_expires_at timestamptz,
  p_created_at timestamptz
) returns boolean
language sql
stable
as $$
  select case
    when lower(trim(coalesce(p_status, ''))) = 'cancelled' then false
    when lower(trim(coalesce(p_payment_status, 'pending'))) in ('paid', 'complete', 'succeeded') then true
    when lower(trim(coalesce(p_payment_status, 'pending'))) = 'authorized' then
      case
        when p_hold_expires_at is not null then p_hold_expires_at > now()
        else coalesce(p_created_at, now()) > now() - interval '24 hours'
      end
    when lower(trim(coalesce(p_payment_status, 'pending'))) = 'pending' then
      case
        when p_hold_expires_at is not null then p_hold_expires_at > now()
        else coalesce(p_created_at, now()) > now() - interval '60 minutes'
      end
    else false
  end;
$$;

comment on function public.booking_occupies_inventory(text, text, timestamptz, timestamptz) is
  'Paid bookings always occupy. Pending checkout holds use hold_expires_at (60m fallback). Authorized Request-to-Book holds use hold_expires_at (24h fallback).';
