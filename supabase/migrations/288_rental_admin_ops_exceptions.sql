-- Admin-facing rental ops exceptions (stuck holds, paid/unconfirmed, failed refunds).
-- Read-only view + SECURITY DEFINER helper for service_role / admin edge.
-- Does not enable public rental checkout or publication.

create or replace view public.admin_rental_ops_exceptions
with (security_invoker = true)
as
-- Stuck / expired inventory holds still marked held
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

-- Pending rental bookings past hold expiry (abandon / webhook miss risk)
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

-- Stripe PI present but booking still pending (paid-orphan risk)
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

-- Failed / stuck auto-refunds on rental cancellations
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
  );

comment on view public.admin_rental_ops_exceptions is
  'Rental ops triage: stuck holds, expired pending checkouts, paid-unconfirmed, failed refunds. Admin/service only.';

revoke all on public.admin_rental_ops_exceptions from public, anon, authenticated;
grant select on public.admin_rental_ops_exceptions to service_role;

create or replace function public.admin_list_rental_ops_exceptions(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(500, coalesce(p_limit, 100)));
  v_items jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.observed_at desc nulls last), '[]'::jsonb)
  into v_items
  from (
    select * from public.admin_rental_ops_exceptions
    order by observed_at desc nulls last
    limit v_limit
  ) t;

  return jsonb_build_object(
    'ok', true,
    'count', jsonb_array_length(v_items),
    'items', v_items
  );
end;
$$;

revoke all on function public.admin_list_rental_ops_exceptions(integer) from public, anon, authenticated;
grant execute on function public.admin_list_rental_ops_exceptions(integer) to service_role;

comment on function public.admin_list_rental_ops_exceptions(integer) is
  'Service-role rental exception inbox for admin-supplier-verification.';
