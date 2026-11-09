-- B2B.9.2: Read-only Tour payment ↔ ledger reconciliation report.
-- service_role only. No financial mutations.

create or replace function public.admin_tour_payment_ledger_reconcile(
  p_limit integer default 100,
  p_only_discrepancies boolean default true,
  p_booking_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_rows jsonb := '[]'::jsonb;
  v_disc integer := 0;
begin
  with tour_bookings as (
    select
      b.id,
      b.public_reference,
      b.status as booking_status,
      b.payment_status,
      b.currency,
      b.amount_paid,
      b.checkout_session_id,
      b.payment_intent_id,
      b.paid_at,
      b.listing_id,
      b.created_at
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where coalesce(nullif(trim(both from l.listing_extras->>'inventoryFamily'), ''), 'tour') = 'tour'
      and (p_booking_id is null or b.id = p_booking_id)
  ),
  enriched as (
    select
      tb.*,
      public.commercial_amount_to_minor(tb.amount_paid) as amount_paid_minor,
      coalesce(s.remaining_gross_minor, s.gross_minor) as gross_minor,
      coalesce(s.remaining_commission_minor, s.commission_minor) as commission_minor,
      coalesce(s.remaining_supplier_minor, s.supplier_minor) as supplier_minor,
      s.booking_id is not null as has_snapshot,
      (
        select count(*)::int
        from public.supplier_earning_items e
        where e.booking_id = tb.id
      ) as earning_count,
      (
        select e.status
        from public.supplier_earning_items e
        where e.booking_id = tb.id
        order by e.created_at desc
        limit 1
      ) as earning_status,
      (
        select e.amount_minor
        from public.supplier_earning_items e
        where e.booking_id = tb.id
        order by e.created_at desc
        limit 1
      ) as earning_amount_minor,
      (
        select e.id::text
        from public.supplier_earning_items e
        where e.booking_id = tb.id
        order by e.created_at desc
        limit 1
      ) as earning_item_id,
      (
        select count(*)::int
        from public.booking_refund_instructions r
        where r.booking_id = tb.id
      ) as refund_instruction_count,
      (
        select r.stripe_refund_id
        from public.booking_refund_instructions r
        where r.booking_id = tb.id
          and r.stripe_refund_id is not null
        order by r.updated_at desc nulls last, r.created_at desc
        limit 1
      ) as latest_stripe_refund_id,
      case
        when tb.payment_intent_id is null or btrim(tb.payment_intent_id) = '' then 0
        else (
          select count(*)::int
          from public.bookings b2
          where b2.payment_intent_id = tb.payment_intent_id
        )
      end as payment_intent_booking_count,
      case
        when tb.checkout_session_id is null or btrim(tb.checkout_session_id) = '' then 0
        else (
          select count(*)::int
          from public.bookings b3
          where b3.checkout_session_id = tb.checkout_session_id
        )
      end as checkout_session_booking_count
    from tour_bookings tb
    left join public.booking_commercial_snapshots s on s.booking_id = tb.id
  ),
  flagged as (
    select
      e.*,
      coalesce(
        (
          select jsonb_agg(flag order by ord)
          from (
            values
              (
                1,
                case
                  when lower(coalesce(e.payment_status, '')) in ('paid', 'complete', 'succeeded', 'refunded')
                    and not e.has_snapshot
                  then 'missing_snapshot'
                end
              ),
              (
                2,
                case
                  when lower(coalesce(e.payment_status, '')) in ('paid', 'complete', 'succeeded', 'refunded')
                    and e.earning_count = 0
                  then 'missing_earning'
                end
              ),
              (3, case when e.earning_count > 1 then 'duplicate_earning' end),
              (
                4,
                case
                  when lower(coalesce(e.payment_status, '')) in ('paid', 'complete', 'succeeded')
                    and e.gross_minor is not null
                    and e.amount_paid_minor is not null
                    and e.amount_paid_minor is distinct from e.gross_minor
                  then 'amount_mismatch'
                end
              ),
              (
                5,
                case
                  when e.gross_minor is not null
                    and e.commission_minor is not null
                    and e.supplier_minor is not null
                    and e.gross_minor is distinct from (e.commission_minor + e.supplier_minor)
                  then 'split_mismatch'
                end
              ),
              (
                6,
                case
                  when lower(coalesce(e.payment_status, '')) in ('paid', 'complete', 'succeeded')
                    and e.earning_count > 0
                    and e.supplier_minor is not null
                    and e.earning_amount_minor is not null
                    and lower(coalesce(e.earning_status, '')) is distinct from 'reversed'
                    and e.earning_amount_minor is distinct from e.supplier_minor
                  then 'earning_net_mismatch'
                end
              ),
              (
                7,
                case
                  when lower(coalesce(e.payment_status, '')) = 'refunded'
                    and e.earning_count > 0
                    and (
                      lower(coalesce(e.earning_status, '')) is distinct from 'reversed'
                      or coalesce(e.earning_amount_minor, 0) <> 0
                    )
                  then 'refunded_still_payable'
                end
              ),
              (
                8,
                case
                  when lower(coalesce(e.payment_status, '')) in ('paid', 'complete', 'succeeded')
                    and lower(coalesce(e.earning_status, '')) = 'reversed'
                  then 'paid_but_reversed'
                end
              ),
              (
                9,
                case
                  when lower(coalesce(e.payment_status, '')) in ('pending', 'failed', 'authorized')
                    and e.earning_count > 0
                    and lower(coalesce(e.earning_status, '')) is distinct from 'reversed'
                  then 'failed_or_pending_has_earnings'
                end
              ),
              (
                10,
                case
                  when e.payment_intent_booking_count > 1 then 'duplicate_payment_intent'
                end
              ),
              (
                11,
                case
                  when e.checkout_session_booking_count > 1 then 'duplicate_checkout_session'
                end
              )
          ) as v(ord, flag)
          where flag is not null
        ),
        '[]'::jsonb
      ) as flags
    from enriched e
  ),
  scored as (
    select
      f.*,
      case
        when jsonb_array_length(f.flags) > 0 then 'discrepancy'
        else 'ok'
      end as reconciliation_status
    from flagged f
  ),
  filtered as (
    select *
    from scored
    where
      p_booking_id is not null
      or p_only_discrepancies is not true
      or reconciliation_status = 'discrepancy'
    order by
      case when reconciliation_status = 'discrepancy' then 0 else 1 end,
      paid_at desc nulls last,
      created_at desc
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'booking_id', f.id,
          'public_reference', f.public_reference,
          'booking_status', f.booking_status,
          'payment_status', f.payment_status,
          'currency', f.currency,
          'amount_paid_major', f.amount_paid,
          'amount_paid_minor', f.amount_paid_minor,
          'checkout_session_id', f.checkout_session_id,
          'payment_intent_id', f.payment_intent_id,
          'gross_minor', f.gross_minor,
          'commission_minor', f.commission_minor,
          'supplier_minor', f.supplier_minor,
          'earning_item_id', f.earning_item_id,
          'earning_status', f.earning_status,
          'earning_amount_minor', f.earning_amount_minor,
          'earning_count', f.earning_count,
          'refund_instruction_count', f.refund_instruction_count,
          'latest_stripe_refund_id', f.latest_stripe_refund_id,
          'payment_intent_booking_count', f.payment_intent_booking_count,
          'checkout_session_booking_count', f.checkout_session_booking_count,
          'flags', f.flags,
          'reconciliation_status', f.reconciliation_status
        )
        order by
          case when f.reconciliation_status = 'discrepancy' then 0 else 1 end,
          f.paid_at desc nulls last,
          f.created_at desc
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select count(*)::int
        from scored s
        where s.reconciliation_status = 'discrepancy'
      ),
      0
    )
  into v_rows, v_disc
  from filtered f;

  return jsonb_build_object(
    'ok', true,
    'scope', 'tour',
    'read_only', true,
    'generated_at', now(),
    'only_discrepancies', coalesce(p_only_discrepancies, true),
    'limit', v_limit,
    'booking_id_filter', p_booking_id,
    'row_count', jsonb_array_length(v_rows),
    'discrepancy_count', v_disc,
    'rows', v_rows
  );
end;
$$;

comment on function public.admin_tour_payment_ledger_reconcile(integer, boolean, uuid) is
  'B2B.9.2 read-only Tour payment/ledger reconciliation. Flags mismatches; never mutates money.';

revoke all on function public.admin_tour_payment_ledger_reconcile(integer, boolean, uuid) from public;
revoke all on function public.admin_tour_payment_ledger_reconcile(integer, boolean, uuid) from anon, authenticated;
grant execute on function public.admin_tour_payment_ledger_reconcile(integer, boolean, uuid) to service_role;
