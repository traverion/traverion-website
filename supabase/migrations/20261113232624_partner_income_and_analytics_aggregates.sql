-- Performance 2.2: exact income totals and analytics ranges without downloading every booking.
-- Security invoker so bookings, snapshot, and earning-item RLS still apply.
-- Does not change commission, refund, payout, or ledger rules.

create or replace function public.partner_local_date(ts timestamptz, tz text)
returns date
language plpgsql
stable
as $$
begin
  if ts is null then
    return null;
  end if;
  begin
    return (ts at time zone coalesce(nullif(tz, ''), 'Europe/Helsinki'))::date;
  exception when others then
    return (ts at time zone 'Europe/Helsinki')::date;
  end;
end;
$$;

revoke all on function public.partner_local_date(timestamptz, text) from public, anon;
grant execute on function public.partner_local_date(timestamptz, text) to authenticated;

create or replace function public.partner_income_summary()
returns table (
  currency text,
  snapshot_count bigint,
  snapshot_gross_minor bigint,
  snapshot_commission_minor bigint,
  snapshot_supplier_minor bigint,
  item_count bigint,
  item_pending_minor bigint,
  item_eligible_minor bigint,
  item_included_minor bigint,
  item_paid_minor bigint,
  legacy_collected_count bigint,
  legacy_collected_major numeric,
  refund_due_count bigint,
  refund_due_major numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with snap as (
    select
      upper(coalesce(nullif(s.currency, ''), 'EUR')) as currency,
      count(*)::bigint as snapshot_count,
      coalesce(sum(s.remaining_gross_minor), 0)::bigint as snapshot_gross_minor,
      coalesce(sum(s.remaining_commission_minor), 0)::bigint as snapshot_commission_minor,
      coalesce(sum(s.remaining_supplier_minor), 0)::bigint as snapshot_supplier_minor
    from public.booking_commercial_snapshots s
    group by 1
  ),
  item as (
    select
      upper(coalesce(nullif(i.currency, ''), 'EUR')) as currency,
      count(*)::bigint as item_count,
      coalesce(sum(i.amount_minor) filter (where i.status = 'pending'), 0)::bigint as item_pending_minor,
      coalesce(sum(i.amount_minor) filter (where i.status = 'eligible'), 0)::bigint as item_eligible_minor,
      coalesce(sum(i.amount_minor) filter (where i.status = 'included'), 0)::bigint as item_included_minor,
      coalesce(sum(i.amount_minor) filter (where i.status = 'paid'), 0)::bigint as item_paid_minor
    from public.supplier_earning_items i
    group by 1
  ),
  refund as (
    select
      upper(coalesce(nullif(b.currency, ''), 'EUR')) as currency,
      count(*)::bigint as refund_due_count,
      coalesce(sum(b.amount_paid), 0) as refund_due_major
    from public.bookings b
    where lower(coalesce(b.status, '')) = 'cancelled'
      and lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
      and (b.refund_choice is null or lower(b.refund_choice) <> 'no_refund')
      and (
        b.dispute_status is null
        or lower(b.dispute_status) not in ('open', 'needs_response', 'under_review', 'lost')
      )
    group by 1
  ),
  legacy as (
    select
      upper(coalesce(nullif(b.currency, ''), 'EUR')) as currency,
      count(*)::bigint as legacy_collected_count,
      coalesce(sum(b.amount_paid), 0) as legacy_collected_major
    from public.bookings b
    where lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
      and coalesce(b.amount_paid, 0) > 0
      and (
        lower(coalesce(b.status, '')) <> 'cancelled'
        or lower(coalesce(b.refund_choice, '')) = 'no_refund'
      )
    group by 1
  ),
  keys as (
    select currency from snap
    union
    select currency from item
    union
    select currency from refund
    union
    select currency from legacy
  )
  select
    k.currency,
    coalesce(snap.snapshot_count, 0),
    coalesce(snap.snapshot_gross_minor, 0),
    coalesce(snap.snapshot_commission_minor, 0),
    coalesce(snap.snapshot_supplier_minor, 0),
    coalesce(item.item_count, 0),
    coalesce(item.item_pending_minor, 0),
    coalesce(item.item_eligible_minor, 0),
    coalesce(item.item_included_minor, 0),
    coalesce(item.item_paid_minor, 0),
    coalesce(legacy.legacy_collected_count, 0),
    coalesce(legacy.legacy_collected_major, 0),
    coalesce(refund.refund_due_count, 0),
    coalesce(refund.refund_due_major, 0)
  from keys k
  left join snap on snap.currency = k.currency
  left join item on item.currency = k.currency
  left join refund on refund.currency = k.currency
  left join legacy on legacy.currency = k.currency;
$$;

revoke all on function public.partner_income_summary() from public, anon;
grant execute on function public.partner_income_summary() to authenticated;

create or replace function public.partner_income_history(
  p_limit integer default 20,
  p_offset integer default 0,
  p_not_after timestamptz default null,
  p_not_after_id uuid default null,
  p_listing_id uuid default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_sort text default 'activity'
)
returns table (
  id uuid,
  listing_id uuid,
  currency text,
  amount_paid numeric,
  booking_date date,
  created_at timestamptz,
  guest_name text,
  public_reference text,
  booking_number bigint,
  purchase_snapshot jsonb,
  status text,
  payment_status text,
  check_out date,
  nights integer,
  refund_choice text,
  listing_title text,
  snap_currency text,
  remaining_gross_minor bigint,
  remaining_commission_minor bigint,
  remaining_supplier_minor bigint,
  commission_bps integer,
  item_currency text,
  item_amount_minor bigint,
  item_status text,
  item_experience_at timestamptz,
  item_sold_at timestamptz,
  item_service_completed_at timestamptz,
  item_gross_minor bigint,
  item_commission_minor bigint,
  item_commission_bps integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with matched as (
    select
      b.id,
      b.listing_id,
      b.currency,
      b.amount_paid,
      b.booking_date,
      b.created_at,
      b.guest_name,
      b.public_reference,
      b.booking_number,
      b.purchase_snapshot,
      b.status,
      b.payment_status,
      b.check_out,
      b.nights,
      b.refund_choice,
      l.title as listing_title,
      s.currency as snap_currency,
      s.remaining_gross_minor,
      s.remaining_commission_minor,
      s.remaining_supplier_minor,
      s.commission_bps,
      i.currency as item_currency,
      i.amount_minor as item_amount_minor,
      i.status as item_status,
      i.experience_at as item_experience_at,
      i.sold_at as item_sold_at,
      i.service_completed_at as item_service_completed_at,
      i.gross_minor as item_gross_minor,
      i.commission_minor as item_commission_minor,
      i.commission_bps as item_commission_bps,
      coalesce(
        i.service_completed_at::date,
        i.experience_at::date,
        b.booking_date
      ) as activity_day,
      case
        when i.status = 'reversed' then 0
        when s.booking_id is not null then coalesce(s.remaining_supplier_minor, 0)
        when i.booking_id is not null then coalesce(i.amount_minor, 0)
        when coalesce(b.amount_paid, 0) > 0 then round(b.amount_paid * 100)::bigint
        else 0
      end as net_minor
    from public.bookings b
    left join public.listings l on l.id = b.listing_id
    left join lateral (
      select snap.booking_id, snap.currency, snap.remaining_gross_minor, snap.remaining_commission_minor, snap.remaining_supplier_minor, snap.commission_bps
      from public.booking_commercial_snapshots snap
      where snap.booking_id = b.id
      limit 1
    ) s on true
    left join lateral (
      select it.booking_id, it.currency, it.amount_minor, it.status, it.experience_at, it.sold_at, it.service_completed_at, it.gross_minor, it.commission_minor, it.commission_bps
      from public.supplier_earning_items it
      where it.booking_id = b.id
      limit 1
    ) i on true
    where (
      (
        lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
        and coalesce(b.amount_paid, 0) > 0
        and (
          lower(coalesce(b.status, '')) <> 'cancelled'
          or lower(coalesce(b.refund_choice, '')) = 'no_refund'
        )
      )
      or (
        lower(coalesce(b.status, '')) = 'cancelled'
        and lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
        and (b.refund_choice is null or lower(b.refund_choice) <> 'no_refund')
        and (
          b.dispute_status is null
          or lower(b.dispute_status) not in ('open', 'needs_response', 'under_review', 'lost')
        )
      )
    )
      and (p_listing_id is null or b.listing_id = p_listing_id)
      and (
        p_not_after is null
        or b.created_at < p_not_after
        or (b.created_at = p_not_after and (p_not_after_id is null or b.id <= p_not_after_id))
      )
      and (
        p_status is null
        or p_status = ''
        or p_status = 'all'
        or coalesce(i.status, 'recorded') = p_status
      )
      and (
        p_from is null
        or coalesce(i.service_completed_at::date, i.experience_at::date, b.booking_date) >= p_from
      )
      and (
        p_to is null
        or coalesce(i.service_completed_at::date, i.experience_at::date, b.booking_date) <= p_to
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or b.guest_name ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%'
        or coalesce(b.public_reference, '') ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%'
        or coalesce(b.purchase_snapshot->>'title', '') ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%'
        or coalesce(l.title, '') ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%'
        or b.booking_number::text = btrim(p_search)
      )
  ),
  counted as (
    select count(*)::bigint as total_count from matched
  ),
  page as (
    select *
    from matched
    order by
      case when p_sort = 'earnings' then net_minor end desc nulls last,
      case when p_sort = 'purchase' then created_at end desc nulls last,
      case when coalesce(p_sort, 'activity') = 'activity' then activity_day end desc nulls last,
      id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    page.id,
    page.listing_id,
    page.currency,
    page.amount_paid,
    page.booking_date,
    page.created_at,
    page.guest_name,
    page.public_reference,
    page.booking_number,
    page.purchase_snapshot,
    page.status,
    page.payment_status,
    page.check_out,
    page.nights,
    page.refund_choice,
    page.listing_title,
    page.snap_currency,
    page.remaining_gross_minor,
    page.remaining_commission_minor,
    page.remaining_supplier_minor,
    page.commission_bps,
    page.item_currency,
    page.item_amount_minor,
    page.item_status,
    page.item_experience_at,
    page.item_sold_at,
    page.item_service_completed_at,
    page.item_gross_minor,
    page.item_commission_minor,
    page.item_commission_bps,
    counted.total_count
  from counted
  left join page on true;
$$;

revoke all on function public.partner_income_history(integer, integer, timestamptz, uuid, uuid, text, date, date, text, text) from public, anon;
grant execute on function public.partner_income_history(integer, integer, timestamptz, uuid, uuid, text, date, date, text, text) to authenticated;

drop function if exists public.partner_analytics_daily();

create function public.partner_analytics_daily(
  p_from date default null,
  p_to date default null,
  p_basis text default 'service'
)
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
    count(*) filter (where lower(coalesce(b.status, '')) = 'cancelled')::bigint as cancel_count,
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
    and (
      p_from is null
      or case
        when p_basis = 'booking' then (b.created_at at time zone 'utc')::date
        else b.booking_date
      end >= p_from
    )
    and (
      p_to is null
      or case
        when p_basis = 'booking' then (b.created_at at time zone 'utc')::date
        else b.booking_date
      end <= p_to
    )
  group by 1, 2, 3, 4, 5, 6;
$$;

revoke all on function public.partner_analytics_daily(date, date, text) from public, anon;
grant execute on function public.partner_analytics_daily(date, date, text) to authenticated;

create or replace function public.partner_analytics_distributions(
  p_from date default null,
  p_to date default null,
  p_basis text default 'service'
)
returns table (
  kind text,
  bucket text,
  listing_id uuid,
  booking_count bigint,
  metric numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with collected as (
    select
      b.listing_id,
      b.guests,
      b.booking_date,
      public.partner_local_date(b.created_at, b.purchase_snapshot->>'departureTimezone') as created_local
    from public.bookings b
    where lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded')
      and coalesce(b.amount_paid, 0) > 0
      and (
        lower(coalesce(b.status, '')) <> 'cancelled'
        or lower(coalesce(b.refund_choice, '')) = 'no_refund'
      )
      and (
        p_from is null
        or case
          when p_basis = 'booking' then (b.created_at at time zone 'utc')::date
          else b.booking_date
        end >= p_from
      )
      and (
        p_to is null
        or case
          when p_basis = 'booking' then (b.created_at at time zone 'utc')::date
          else b.booking_date
        end <= p_to
      )
  ),
  lead as (
    select
      listing_id,
      case
        when booking_date is null or created_local is null then 'unknown'
        when (booking_date - created_local) < 0 then 'unknown'
        when (booking_date - created_local) < 1 then 'same_day'
        when (booking_date - created_local) <= 3 then '1_3'
        when (booking_date - created_local) <= 7 then '4_7'
        when (booking_date - created_local) <= 14 then '8_14'
        when (booking_date - created_local) <= 30 then '15_30'
        else '30_plus'
      end as bucket,
      (booking_date - created_local) as lead_days
    from collected
  )
  select 'lead'::text, lead.bucket, lead.listing_id, count(*)::bigint, null::numeric
  from lead
  group by lead.bucket, lead.listing_id
  union all
  select
    'lead_sum'::text,
    'days'::text,
    lead.listing_id,
    count(*) filter (where lead_days is not null and lead_days >= 0)::bigint,
    coalesce(sum(lead_days) filter (where lead_days is not null and lead_days >= 0), 0)
  from lead
  group by lead.listing_id
  union all
  select
    'party'::text,
    case
      when coalesce(guests, 0) <= 1 then '1'
      when guests = 2 then '2'
      when guests <= 4 then '3_4'
      when guests <= 8 then '5_8'
      else '9_plus'
    end,
    listing_id,
    count(*)::bigint,
    null::numeric
  from collected
  group by 2, 3;
$$;

revoke all on function public.partner_analytics_distributions(date, date, text) from public, anon;
grant execute on function public.partner_analytics_distributions(date, date, text) to authenticated;
