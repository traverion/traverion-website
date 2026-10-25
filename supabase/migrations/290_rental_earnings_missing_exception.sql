-- Show paid rentals whose commercial snapshot never landed.
-- record_paid_booking_earnings runs after promote_paid_checkout_booking commits.
-- A supplier_profiles FK failure leaves the booking paid and the webhook failed.
-- This arm makes that gap visible. It does not enable rental publication or checkout.

create or replace view public.admin_rental_ops_exceptions
with (security_invoker = true)
as
select
  'stuck_hold'::text as exception_kind,
  h.id as entity_id,
  h.booking_id,
  h.listing_id,
  h.status as hold_status,
  null::text as booking_status,
  null::text as payment_status,
  h.hold_expires_at,
  h.updated_at as observed_at,
  jsonb_build_object(
    'variant_id', h.variant_id,
    'quantity', h.quantity,
    'starts_at', h.starts_at,
    'ends_at', h.ends_at,
    'idempotency_key', h.idempotency_key
  ) as detail
from public.rental_inventory_holds h
where h.status = 'held'
  and h.hold_expires_at is not null
  and h.hold_expires_at < now()

union all

select
  'pending_hold_expired'::text,
  b.id,
  b.id,
  b.listing_id,
  h.status,
  b.status,
  b.payment_status,
  b.hold_expires_at,
  b.created_at,
  jsonb_build_object(
    'checkout_session_id', b.checkout_session_id,
    'payment_intent_id', b.payment_intent_id,
    'public_reference', b.public_reference,
    'hold_id', h.id
  )
from public.bookings b
left join public.rental_inventory_holds h on h.booking_id = b.id
where coalesce(b.purchase_snapshot->>'inventoryFamily', '') = 'rental'
  and lower(coalesce(b.status, '')) = 'pending'
  and lower(coalesce(b.payment_status, '')) = 'pending'
  and b.hold_expires_at is not null
  and b.hold_expires_at < now()

union all

select
  'paid_unconfirmed'::text,
  b.id,
  b.id,
  b.listing_id,
  h.status,
  b.status,
  b.payment_status,
  b.hold_expires_at,
  b.created_at,
  jsonb_build_object(
    'checkout_session_id', b.checkout_session_id,
    'payment_intent_id', b.payment_intent_id,
    'amount_paid', b.amount_paid,
    'public_reference', b.public_reference
  )
from public.bookings b
left join public.rental_inventory_holds h on h.booking_id = b.id
where coalesce(b.purchase_snapshot->>'inventoryFamily', '') = 'rental'
  and nullif(trim(coalesce(b.payment_intent_id, '')), '') is not null
  and lower(coalesce(b.payment_status, '')) in ('pending', 'failed')
  and lower(coalesce(b.status, '')) is distinct from 'cancelled'

union all

select
  'failed_refund'::text,
  b.id,
  b.id,
  b.listing_id,
  null::text,
  b.status,
  b.payment_status,
  null::timestamptz,
  coalesce(b.auto_refund_updated_at, b.cancelled_at, b.created_at),
  jsonb_build_object(
    'refund_choice', b.refund_choice,
    'auto_refund_status', b.auto_refund_status,
    'auto_refund_error', b.auto_refund_error,
    'auto_refund_stripe_id', b.auto_refund_stripe_id,
    'payment_intent_id', b.payment_intent_id
  )
from public.bookings b
where coalesce(b.purchase_snapshot->>'inventoryFamily', '') = 'rental'
  and lower(coalesce(b.status, '')) = 'cancelled'
  and lower(coalesce(b.refund_choice, '')) = 'full_refund'
  and (
    lower(coalesce(b.auto_refund_status, '')) in ('failed', 'processing')
    or (
      lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
      and b.cancelled_at is not null
      and b.cancelled_at < now() - interval '15 minutes'
    )
  )

union all

-- Paid and confirmed, but the earnings snapshot never committed.
select
  'earnings_missing'::text,
  b.id,
  b.id,
  b.listing_id,
  h.status,
  b.status,
  b.payment_status,
  b.hold_expires_at,
  coalesce(b.paid_at, b.created_at),
  jsonb_build_object(
    'checkout_session_id', b.checkout_session_id,
    'payment_intent_id', b.payment_intent_id,
    'public_reference', b.public_reference,
    'supplier_id', l.supplier_id
  )
from public.bookings b
join public.listings l on l.id = b.listing_id
left join lateral (
  select h.status
  from public.rental_inventory_holds h
  where h.booking_id = b.id and h.status = 'confirmed'
  order by h.created_at
  limit 1
) h on true
where coalesce(b.purchase_snapshot->>'inventoryFamily', '') = 'rental'
  and lower(coalesce(b.status, '')) = 'confirmed'
  and lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
  and not exists (
    select 1 from public.booking_commercial_snapshots s where s.booking_id = b.id
  );

comment on view public.admin_rental_ops_exceptions is
  'Rental ops triage: stuck holds, expired pending checkouts, paid-unconfirmed, failed refunds, paid bookings missing an earnings snapshot.';

revoke all on public.admin_rental_ops_exceptions from public, anon, authenticated;
grant select on public.admin_rental_ops_exceptions to service_role;
