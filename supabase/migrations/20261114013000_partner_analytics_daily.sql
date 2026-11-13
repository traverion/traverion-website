-- Bounded All time analytics. One grouped row per day, listing, and currency.
-- Security invoker so bookings and snapshot RLS still apply.
-- Money matches moneyForBooking: snapshot remaining minors, otherwise amount_paid.
-- Does not change bookings, refunds, inventory, or payouts.

create or replace function public.partner_analytics_daily()
returns table (
  service_day date,
  created_day date,
  listing_id uuid,
  currency text,
  booking_currency text,
  bucket text,
  booking_count bigint,
  guest_count bigint,
  gross_minor bigint,
  commission_minor bigint,
  supplier_minor bigint,
  legacy_gross numeric,
  cancel_count bigint,
  supplier_cancel_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.booking_date::date as service_day,
    (b.created_at at time zone 'utc')::date as created_day,
    b.listing_id,
    upper(coalesce(nullif(s.currency, ''), nullif(b.currency, ''), 'EUR')) as currency,
    upper(coalesce(nullif(b.currency, ''), 'EUR')) as booking_currency,
    case
      when coalesce(b.amount_paid, 0) > 0
        and (
          lower(coalesce(b.status, '')) <> 'cancelled'
          or lower(coalesce(b.refund_choice, '')) = 'no_refund'
        )
      then 'collected'
      else 'cancelled'
    end as bucket,
    count(*)::bigint as booking_count,
    coalesce(sum(
      case
        when coalesce(b.amount_paid, 0) > 0
          and (
            lower(coalesce(b.status, '')) <> 'cancelled'
            or lower(coalesce(b.refund_choice, '')) = 'no_refund'
          )
          and coalesce(b.guests, 0) > 0
        then b.guests
        else 0
      end
    ), 0)::bigint as guest_count,
    coalesce(sum(
      case
        when coalesce(b.amount_paid, 0) > 0
          and (
            lower(coalesce(b.status, '')) <> 'cancelled'
            or lower(coalesce(b.refund_choice, '')) = 'no_refund'
          )
          and s.booking_id is not null
        then coalesce(s.remaining_gross_minor, 0)
        else 0
      end
    ), 0)::bigint as gross_minor,
    coalesce(sum(
      case
        when coalesce(b.amount_paid, 0) > 0
          and (
            lower(coalesce(b.status, '')) <> 'cancelled'
            or lower(coalesce(b.refund_choice, '')) = 'no_refund'
          )
          and s.booking_id is not null
        then coalesce(s.remaining_commission_minor, 0)
        else 0
      end
    ), 0)::bigint as commission_minor,
    coalesce(sum(
      case
        when coalesce(b.amount_paid, 0) > 0
          and (
            lower(coalesce(b.status, '')) <> 'cancelled'
            or lower(coalesce(b.refund_choice, '')) = 'no_refund'
          )
          and s.booking_id is not null
        then coalesce(s.remaining_supplier_minor, 0)
        else 0
      end
    ), 0)::bigint as supplier_minor,
    coalesce(sum(
      case
        when coalesce(b.amount_paid, 0) > 0
          and (
            lower(coalesce(b.status, '')) <> 'cancelled'
            or lower(coalesce(b.refund_choice, '')) = 'no_refund'
          )
          and s.booking_id is null
        then b.amount_paid
        else 0
      end
    ), 0) as legacy_gross,
    count(*) filter (
      where lower(coalesce(b.status, '')) = 'cancelled'
    )::bigint as cancel_count,
    count(*) filter (
      where lower(coalesce(b.status, '')) = 'cancelled'
        and (
          lower(coalesce(b.cancellation_reason, '')) like '%supplier%'
          or lower(coalesce(b.cancellation_reason, '')) like '%host%'
          or lower(coalesce(b.cancellation_reason, '')) like '%operator%'
          or lower(coalesce(b.cancellation_reason, '')) like 'partner_%'
          or lower(coalesce(b.cancellation_reason, '')) = 'unpaid_release'
        )
    )::bigint as supplier_cancel_count
  from public.bookings b
  left join lateral (
    select
      snap.booking_id,
      snap.currency,
      snap.remaining_gross_minor,
      snap.remaining_commission_minor,
      snap.remaining_supplier_minor
    from public.booking_commercial_snapshots snap
    where snap.booking_id = b.id
    limit 1
  ) s on true
  where lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
    and (
      (
        coalesce(b.amount_paid, 0) > 0
        and (
          lower(coalesce(b.status, '')) <> 'cancelled'
          or lower(coalesce(b.refund_choice, '')) = 'no_refund'
        )
      )
      or lower(coalesce(b.status, '')) = 'cancelled'
    )
  group by 1, 2, 3, 4, 5, 6;
$$;

revoke all on function public.partner_analytics_daily() from public, anon;
grant execute on function public.partner_analytics_daily() to authenticated;
