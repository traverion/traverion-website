-- Instant Book: unpaid pending checkouts must NOT block Stay/Tour inventory.
-- Opening Stripe Checkout is not a booking. Inventory is claimed atomically at
-- promote_paid_checkout_booking (first successful payment wins; losers refunded).
-- Request-to-Book authorized holds continue to occupy until accept/decline/expire.

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
    -- Instant Book pending / failed / refunded / other: do not occupy.
    else false
  end;
$$;

comment on function public.booking_occupies_inventory(text, text, timestamptz, timestamptz) is
  'Paid bookings always occupy. Authorized Request-to-Book occupies while hold_expires_at is live (24h fallback). Instant Book unpaid pending never occupies — claim nights only on successful paid promote.';
