-- B2B.9.3: Read-only Tour supplier payout readiness (balances + drill-down).
-- service_role only. No Stripe transfers / payouts / financial mutations.
-- Reuses Phase 5 eligibility + B2B.9.2 ledger reconcile flags (fail closed).

create or replace function public.admin_tour_payout_readiness(
  p_limit integer default 200,
  p_supplier_id uuid default null,
  p_booking_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_now timestamptz := coalesce(p_now, now());
  v_items jsonb := '[]'::jsonb;
  v_suppliers jsonb := '[]'::jsonb;
  v_ready integer := 0;
  v_held integer := 0;
begin
  with tour_earnings as (
    select
      e.id as earning_item_id,
      e.booking_id,
      e.supplier_id,
      upper(trim(coalesce(e.currency, 'EUR'))) as currency,
      e.amount_minor,
      e.status as earning_status,
      e.eligible_at,
      coalesce(e.service_completed_at, public.booking_service_completion_at(e.booking_id)) as service_completed_at,
      e.payout_period_id,
      e.gross_minor as earning_gross_minor,
      e.commission_minor as earning_commission_minor,
      e.payment_intent_id as earning_payment_intent_id,
      b.public_reference,
      b.status as booking_status,
      b.payment_status,
      b.dispute_status,
      b.currency as booking_currency,
      b.amount_paid,
      b.checkout_session_id,
      b.payment_intent_id,
      b.paid_at,
      b.created_at,
      coalesce(nullif(trim(both from l.listing_extras->>'inventoryFamily'), ''), 'tour') as inventory_family,
      exists (
        select 1 from public.supplier_profiles sp where sp.id = e.supplier_id
      ) as supplier_exists,
      public.booking_blocks_payout_eligibility(e.booking_id) as blocks_payout,
      public.commercial_amount_to_minor(b.amount_paid) as amount_paid_minor,
      coalesce(s.remaining_gross_minor, s.gross_minor) as gross_minor,
      coalesce(s.remaining_commission_minor, s.commission_minor) as commission_minor,
      coalesce(s.remaining_supplier_minor, s.supplier_minor) as supplier_minor,
      s.booking_id is not null as has_snapshot,
      (
        select count(*)::int
        from public.supplier_earning_items e2
        where e2.booking_id = e.booking_id
      ) as earning_count,
      case
        when b.payment_intent_id is null or btrim(b.payment_intent_id) = '' then 0
        else (
          select count(*)::int
          from public.bookings b2
          where b2.payment_intent_id = b.payment_intent_id
        )
      end as payment_intent_booking_count,
      case
        when b.checkout_session_id is null or btrim(b.checkout_session_id) = '' then 0
        else (
          select count(*)::int
          from public.bookings b3
          where b3.checkout_session_id = b.checkout_session_id
        )
      end as checkout_session_booking_count
    from public.supplier_earning_items e
    join public.bookings b on b.id = e.booking_id
    join public.listings l on l.id = b.listing_id
    left join public.booking_commercial_snapshots s on s.booking_id = e.booking_id
    where coalesce(nullif(trim(both from l.listing_extras->>'inventoryFamily'), ''), 'tour') = 'tour'
      and (p_supplier_id is null or e.supplier_id = p_supplier_id)
      and (p_booking_id is null or e.booking_id = p_booking_id)
  ),
  -- Also surface paid tour bookings with NO earning row (historical B2B.9.2 fixtures).
  orphan_paid as (
    select
      null::uuid as earning_item_id,
      b.id as booking_id,
      l.supplier_id,
      upper(trim(coalesce(b.currency, 'EUR'))) as currency,
      0::bigint as amount_minor,
      null::text as earning_status,
      null::timestamptz as eligible_at,
      public.booking_service_completion_at(b.id) as service_completed_at,
      null::uuid as payout_period_id,
      null::bigint as earning_gross_minor,
      null::bigint as earning_commission_minor,
      null::text as earning_payment_intent_id,
      b.public_reference,
      b.status as booking_status,
      b.payment_status,
      b.dispute_status,
      b.currency as booking_currency,
      b.amount_paid,
      b.checkout_session_id,
      b.payment_intent_id,
      b.paid_at,
      b.created_at,
      coalesce(nullif(trim(both from l.listing_extras->>'inventoryFamily'), ''), 'tour') as inventory_family,
      exists (
        select 1 from public.supplier_profiles sp where sp.id = l.supplier_id
      ) as supplier_exists,
      public.booking_blocks_payout_eligibility(b.id) as blocks_payout,
      public.commercial_amount_to_minor(b.amount_paid) as amount_paid_minor,
      coalesce(s.remaining_gross_minor, s.gross_minor) as gross_minor,
      coalesce(s.remaining_commission_minor, s.commission_minor) as commission_minor,
      coalesce(s.remaining_supplier_minor, s.supplier_minor) as supplier_minor,
      s.booking_id is not null as has_snapshot,
      0 as earning_count,
      case
        when b.payment_intent_id is null or btrim(b.payment_intent_id) = '' then 0
        else (
          select count(*)::int from public.bookings b2 where b2.payment_intent_id = b.payment_intent_id
        )
      end as payment_intent_booking_count,
      case
        when b.checkout_session_id is null or btrim(b.checkout_session_id) = '' then 0
        else (
          select count(*)::int from public.bookings b3 where b3.checkout_session_id = b.checkout_session_id
        )
      end as checkout_session_booking_count
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    left join public.booking_commercial_snapshots s on s.booking_id = b.id
    where coalesce(nullif(trim(both from l.listing_extras->>'inventoryFamily'), ''), 'tour') = 'tour'
      and lower(coalesce(b.payment_status, '')) in ('paid', 'complete', 'succeeded', 'refunded')
      and not exists (
        select 1 from public.supplier_earning_items e where e.booking_id = b.id
      )
      and (p_supplier_id is null or l.supplier_id = p_supplier_id)
      and (p_booking_id is null or b.id = p_booking_id)
  ),
  base as (
    select * from tour_earnings
    union all
    select * from orphan_paid
  ),
  flagged as (
    select
      x.*,
      coalesce(
        (
          select jsonb_agg(flag order by ord)
          from (
            values
              (
                1,
                case
                  when lower(coalesce(x.payment_status, '')) in ('paid', 'complete', 'succeeded', 'refunded')
                    and not x.has_snapshot
                  then 'missing_snapshot'
                end
              ),
              (
                2,
                case
                  when lower(coalesce(x.payment_status, '')) in ('paid', 'complete', 'succeeded', 'refunded')
                    and x.earning_count = 0
                  then 'missing_earning'
                end
              ),
              (3, case when x.earning_count > 1 then 'duplicate_earning' end),
              (
                4,
                case
                  when lower(coalesce(x.payment_status, '')) in ('paid', 'complete', 'succeeded')
                    and x.gross_minor is not null
                    and x.amount_paid_minor is not null
                    and x.amount_paid_minor is distinct from x.gross_minor
                  then 'amount_mismatch'
                end
              ),
              (
                5,
                case
                  when x.gross_minor is not null
                    and x.commission_minor is not null
                    and x.supplier_minor is not null
                    and x.gross_minor is distinct from (x.commission_minor + x.supplier_minor)
                  then 'split_mismatch'
                end
              ),
              (
                6,
                case
                  when lower(coalesce(x.payment_status, '')) in ('paid', 'complete', 'succeeded')
                    and x.earning_count > 0
                    and x.supplier_minor is not null
                    and x.amount_minor is not null
                    and lower(coalesce(x.earning_status, '')) is distinct from 'reversed'
                    and x.amount_minor is distinct from x.supplier_minor
                  then 'earning_net_mismatch'
                end
              ),
              (
                7,
                case
                  when lower(coalesce(x.payment_status, '')) = 'refunded'
                    and x.earning_count > 0
                    and (
                      lower(coalesce(x.earning_status, '')) is distinct from 'reversed'
                      or coalesce(x.amount_minor, 0) <> 0
                    )
                  then 'refunded_still_payable'
                end
              ),
              (
                8,
                case
                  when lower(coalesce(x.payment_status, '')) in ('paid', 'complete', 'succeeded')
                    and lower(coalesce(x.earning_status, '')) = 'reversed'
                  then 'paid_but_reversed'
                end
              ),
              (
                9,
                case
                  when lower(coalesce(x.payment_status, '')) in ('pending', 'failed', 'authorized')
                    and x.earning_count > 0
                    and lower(coalesce(x.earning_status, '')) is distinct from 'reversed'
                  then 'failed_or_pending_has_earnings'
                end
              ),
              (
                10,
                case when x.payment_intent_booking_count > 1 then 'duplicate_payment_intent' end
              ),
              (
                11,
                case when x.checkout_session_booking_count > 1 then 'duplicate_checkout_session' end
              )
          ) as v(ord, flag)
          where flag is not null
        ),
        '[]'::jsonb
      ) as reconcile_flags
    from base x
  ),
  classified as (
    select
      f.*,
      case
        when jsonb_array_length(f.reconcile_flags) > 0 then 'discrepancy'
        else 'ok'
      end as reconciliation_status,
      (
        select coalesce(jsonb_agg(reason order by ord), '[]'::jsonb)
        from (
          values
            (1, case when f.inventory_family is distinct from 'tour' then 'not_tour' end),
            (
              2,
              case
                when f.supplier_id is null or not coalesce(f.supplier_exists, false)
                then 'invalid_supplier'
              end
            ),
            (
              3,
              case
                when jsonb_array_length(f.reconcile_flags) > 0 then 'unreconciled'
              end
            ),
            (
              4,
              case
                when nullif(trim(coalesce(f.payment_status, '')), '') is null then 'payment_unknown'
                when lower(trim(f.payment_status)) not in (
                  'pending', 'authorized', 'paid', 'complete', 'succeeded', 'failed', 'refunded'
                ) then 'payment_unknown'
                when lower(trim(f.payment_status)) = 'refunded' then 'payment_refunded'
                when lower(trim(f.payment_status)) not in ('paid', 'complete', 'succeeded')
                  then 'payment_not_confirmed'
              end
            ),
            (
              5,
              case
                when nullif(trim(coalesce(f.booking_status, '')), '') is null then 'booking_status_unknown'
                when lower(trim(f.booking_status)) not in (
                  'pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'refunded'
                ) then 'booking_status_unknown'
                when lower(trim(f.booking_status)) = 'cancelled' then 'booking_cancelled'
              end
            ),
            (
              6,
              case
                when lower(trim(coalesce(f.dispute_status, ''))) in (
                  'open', 'needs_response', 'under_review', 'lost'
                ) then 'disputed'
              end
            ),
            (7, case when coalesce(f.blocks_payout, false) then 'blocked_by_policy' end),
            (
              8,
              case
                when f.earning_status is null or btrim(f.earning_status) = '' then 'missing_earning'
                when lower(trim(f.earning_status)) not in (
                  'pending', 'eligible', 'included', 'paid', 'reversed'
                ) then 'unknown_earning_status'
              end
            ),
            (9, case when lower(trim(coalesce(f.earning_status, ''))) = 'reversed' then 'reversed' end),
            (10, case when lower(trim(coalesce(f.earning_status, ''))) = 'paid' then 'already_paid' end),
            (
              11,
              case when lower(trim(coalesce(f.earning_status, ''))) = 'included' then 'already_included' end
            ),
            (
              12,
              case
                when lower(trim(coalesce(f.earning_status, ''))) is distinct from 'reversed'
                  and coalesce(f.amount_minor, 0) <= 0
                then 'zero_or_negative_amount'
              end
            ),
            (
              13,
              case
                when f.service_completed_at is null or f.service_completed_at > v_now
                then 'service_not_completed'
              end
            ),
            (
              14,
              case
                when f.eligible_at is null or f.eligible_at > v_now then 'hold_period_active'
              end
            )
        ) as r(ord, reason)
        where reason is not null
      ) as blocking_reasons_base
    from flagged f
  ),
  scored as (
    select
      c.*,
      (
        select coalesce(jsonb_agg(distinct elem), '[]'::jsonb)
        from (
          select jsonb_array_elements_text(c.blocking_reasons_base) as elem
          union
          select jsonb_array_elements_text(c.reconcile_flags)
        ) u
      ) as blocking_reasons,
      case
        when lower(trim(coalesce(c.earning_status, ''))) = 'reversed' then 'reversed'
        when lower(trim(coalesce(c.earning_status, ''))) in ('paid', 'included') then 'already_paid'
        when exists (
          select 1
          from jsonb_array_elements_text(
            (
              select coalesce(jsonb_agg(distinct elem), '[]'::jsonb)
              from (
                select jsonb_array_elements_text(c.blocking_reasons_base) as elem
                union
                select jsonb_array_elements_text(c.reconcile_flags)
              ) u
            )
          ) br(reason)
          where br.reason in (
            'not_tour',
            'invalid_supplier',
            'missing_earning',
            'missing_snapshot',
            'unreconciled',
            'payment_not_confirmed',
            'payment_refunded',
            'payment_unknown',
            'booking_cancelled',
            'booking_status_unknown',
            'blocked_by_policy',
            'disputed',
            'duplicate_earning',
            'zero_or_negative_amount',
            'unknown_earning_status',
            'amount_mismatch',
            'split_mismatch',
            'earning_net_mismatch',
            'refunded_still_payable',
            'paid_but_reversed',
            'failed_or_pending_has_earnings',
            'duplicate_payment_intent',
            'duplicate_checkout_session',
            'already_paid',
            'already_included',
            'reversed'
          )
        ) then 'held'
        when exists (
          select 1
          from jsonb_array_elements_text(
            (
              select coalesce(jsonb_agg(distinct elem), '[]'::jsonb)
              from (
                select jsonb_array_elements_text(c.blocking_reasons_base) as elem
                union
                select jsonb_array_elements_text(c.reconcile_flags)
              ) u
            )
          ) br(reason)
          where br.reason in ('service_not_completed', 'hold_period_active')
        ) then 'pending_not_eligible'
        else 'eligible'
      end as bucket
    from classified c
  ),
  limited as (
    select *
    from scored
    order by
      case
        when bucket = 'eligible' then 0
        when bucket = 'pending_not_eligible' then 1
        when bucket = 'held' then 2
        when bucket = 'already_paid' then 3
        else 4
      end,
      paid_at desc nulls last,
      created_at desc
    limit v_limit
  ),
  item_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'earning_item_id', l.earning_item_id,
          'booking_id', l.booking_id,
          'public_reference', l.public_reference,
          'supplier_id', l.supplier_id,
          'currency', l.currency,
          'amount_minor', l.amount_minor,
          'earning_status', l.earning_status,
          'booking_status', l.booking_status,
          'payment_status', l.payment_status,
          'dispute_status', l.dispute_status,
          'payment_intent_id', l.payment_intent_id,
          'checkout_session_id', l.checkout_session_id,
          'gross_minor', l.gross_minor,
          'commission_minor', l.commission_minor,
          'supplier_minor', l.supplier_minor,
          'service_completed_at', l.service_completed_at,
          'eligible_at', l.eligible_at,
          'blocks_payout', l.blocks_payout,
          'reconciliation_status', l.reconciliation_status,
          'reconcile_flags', l.reconcile_flags,
          'blocking_reasons', case when l.bucket = 'eligible' then '[]'::jsonb else l.blocking_reasons end,
          'bucket', l.bucket,
          'ready', (l.bucket = 'eligible')
        )
        order by
          case
            when l.bucket = 'eligible' then 0
            when l.bucket = 'pending_not_eligible' then 1
            when l.bucket = 'held' then 2
            when l.bucket = 'already_paid' then 3
            else 4
          end,
          l.paid_at desc nulls last,
          l.created_at desc
      ),
      '[]'::jsonb
    ) as rows
    from limited l
  ),
  supplier_agg as (
    select
      s.supplier_id,
      s.currency,
      sum(case when s.bucket = 'reversed' then 0 else coalesce(s.amount_minor, 0) end)::bigint as total_earned_minor,
      sum(case when s.bucket = 'pending_not_eligible' then coalesce(s.amount_minor, 0) else 0 end)::bigint
        as pending_not_eligible_minor,
      sum(case when s.bucket = 'eligible' then coalesce(s.amount_minor, 0) else 0 end)::bigint
        as eligible_for_payout_minor,
      sum(
        case
          when s.bucket in ('held', 'ineligible') then coalesce(s.amount_minor, 0)
          else 0
        end
      )::bigint as held_disputed_minor,
      sum(case when s.bucket = 'already_paid' then coalesce(s.amount_minor, 0) else 0 end)::bigint
        as already_paid_minor,
      count(*)::int as item_count,
      count(*) filter (where s.bucket = 'eligible')::int as ready_count,
      (
        select coalesce(jsonb_agg(distinct r order by r), '[]'::jsonb)
        from (
          select jsonb_array_elements_text(s2.blocking_reasons) as r
          from limited s2
          where s2.supplier_id = s.supplier_id
            and s2.currency = s.currency
            and s2.bucket is distinct from 'eligible'
        ) q
        where r is not null
      ) as blocking_reasons
    from limited s
    group by s.supplier_id, s.currency
  ),
  supplier_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'supplier_id', a.supplier_id,
          'currency', a.currency,
          'total_earned_minor', a.total_earned_minor,
          'pending_not_eligible_minor', a.pending_not_eligible_minor,
          'eligible_for_payout_minor', a.eligible_for_payout_minor,
          'held_disputed_minor', a.held_disputed_minor,
          'already_paid_minor', a.already_paid_minor,
          'item_count', a.item_count,
          'ready_count', a.ready_count,
          'blocking_reasons', a.blocking_reasons
        )
        order by a.eligible_for_payout_minor desc, a.held_disputed_minor desc, a.supplier_id
      ),
      '[]'::jsonb
    ) as rows
    from supplier_agg a
  )
  select
    (select rows from item_json),
    (select rows from supplier_json),
    coalesce((select count(*)::int from limited where bucket = 'eligible'), 0),
    coalesce((select count(*)::int from limited where bucket = 'held'), 0)
  into v_items, v_suppliers, v_ready, v_held;

  return jsonb_build_object(
    'ok', true,
    'scope', 'tour',
    'read_only', true,
    'generated_at', v_now,
    'limit', v_limit,
    'supplier_id_filter', p_supplier_id,
    'booking_id_filter', p_booking_id,
    'ready_count', v_ready,
    'held_count', v_held,
    'item_count', jsonb_array_length(v_items),
    'supplier_count', jsonb_array_length(v_suppliers),
    'missing_policies', jsonb_build_array(
      'tour_service_completion_is_inferred_from_official_start_plus_duration_default_3h_not_operator_attested',
      'prepare_due_supplier_payouts_does_not_yet_require_b2b92_ledger_reconcile_ok',
      'no_explicit_no_show_or_completion_attestation_gate_for_tour_payouts'
    ),
    'suppliers', v_suppliers,
    'items', v_items
  );
end;
$$;

comment on function public.admin_tour_payout_readiness(integer, uuid, uuid, timestamptz) is
  'B2B.9.3 read-only Tour payout readiness. Flags eligibility/blocking; never mutates money or executes payouts.';

revoke all on function public.admin_tour_payout_readiness(integer, uuid, uuid, timestamptz) from public;
revoke all on function public.admin_tour_payout_readiness(integer, uuid, uuid, timestamptz) from anon, authenticated;
grant execute on function public.admin_tour_payout_readiness(integer, uuid, uuid, timestamptz) to service_role;
