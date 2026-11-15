-- P2: Harden payout integrity for refund-due / refunded cancels.
-- Supplier-retained cancels (refund_choice = no_refund) remain payable (migration 305).
-- This adds an audited, idempotent repair that reverses stale earning items that must
-- never enter payout allocation, and teaches refresh to reverse those pending/eligible rows.

create table if not exists public.supplier_earning_repair_audit (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  earning_item_id uuid not null,
  prior_status text not null,
  prior_amount_minor bigint not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists supplier_earning_repair_audit_booking_idx
  on public.supplier_earning_repair_audit (booking_id, created_at desc);

alter table public.supplier_earning_repair_audit enable row level security;

revoke all on table public.supplier_earning_repair_audit from public;
revoke all on table public.supplier_earning_repair_audit from anon, authenticated;
grant select, insert on table public.supplier_earning_repair_audit to service_role;

comment on table public.supplier_earning_repair_audit is
  'Audited repairs that reverse stale supplier_earning_items blocked from payout (never retained no_refund cancels).';

create or replace function public.booking_requires_earning_reversal(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_pay text;
begin
  -- Retained late cancels keep earnings — never reverse via this gate.
  if public.booking_is_supplier_retained_cancel(p_booking_id) then
    return false;
  end if;

  select
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, '')))
  into v_status, v_pay
  from public.bookings b
  where b.id = p_booking_id;

  if v_status is null then
    return false;
  end if;

  if v_pay in ('refunded', 'failed') then
    return true;
  end if;

  -- Cancelled / no_show without retained-earnings exception must leave the payout path.
  if v_status in ('cancelled', 'canceled', 'no_show') then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.booking_requires_earning_reversal(uuid) is
  'True when earning items for this booking must be reversed and excluded from payout allocation. False for supplier-retained no_refund cancels.';

revoke all on function public.booking_requires_earning_reversal(uuid) from public;
revoke all on function public.booking_requires_earning_reversal(uuid) from anon, authenticated;
grant execute on function public.booking_requires_earning_reversal(uuid) to service_role;

create or replace function public.repair_stale_blocked_supplier_earning_items(
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  v_row record;
  v_reversed integer := 0;
  v_skipped integer := 0;
  v_result jsonb;
  v_ids uuid[] := array[]::uuid[];
begin
  for v_row in
    select e.id as earning_item_id, e.booking_id, e.status, e.amount_minor
    from public.supplier_earning_items e
    where e.status in ('pending', 'eligible', 'included')
      and e.amount_minor > 0
      and public.booking_requires_earning_reversal(e.booking_id)
    order by e.updated_at asc nulls first
    limit v_limit
  loop
    -- Idempotent: already-reversed rows are filtered out by status/amount.
    v_result := public.reverse_paid_booking_earnings(v_row.booking_id);

    insert into public.supplier_earning_repair_audit (
      booking_id, earning_item_id, prior_status, prior_amount_minor, action, detail
    ) values (
      v_row.booking_id,
      v_row.earning_item_id,
      v_row.status,
      v_row.amount_minor,
      'reverse_stale_blocked_earning',
      jsonb_build_object(
        'ok', coalesce((v_result ->> 'ok')::boolean, false),
        'reverse', v_result,
        'reason', 'booking_requires_earning_reversal'
      )
    );

    if coalesce((v_result ->> 'ok')::boolean, false) then
      v_reversed := v_reversed + 1;
      v_ids := array_append(v_ids, v_row.booking_id);
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reversed', v_reversed,
    'skipped', v_skipped,
    'booking_ids', to_jsonb(v_ids),
    'note', 'Does not reverse supplier-retained no_refund cancels'
  );
end;
$$;

comment on function public.repair_stale_blocked_supplier_earning_items(integer) is
  'Idempotent audited repair: reverse pending/eligible/included earning items for refunded or non-retained cancelled bookings. Safe to re-run.';

revoke all on function public.repair_stale_blocked_supplier_earning_items(integer) from public;
revoke all on function public.repair_stale_blocked_supplier_earning_items(integer) from anon, authenticated;
grant execute on function public.repair_stale_blocked_supplier_earning_items(integer) to service_role;

-- Teach refresh to reverse blocked non-retained items instead of leaving them pending forever.
create or replace function public.refresh_supplier_earning_eligibility(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  v_demoted integer := 0;
  v_hold_hours integer;
  v_completed integer := 0;
  v_gate_demoted integer := 0;
  v_retained_touched integer := 0;
  v_stale_reversed integer := 0;
  v_repair jsonb;
begin
  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 48);

  -- First: reverse stale refund-due / refunded items (idempotent; skips retained cancels).
  v_repair := public.repair_stale_blocked_supplier_earning_items(500);
  v_stale_reversed := coalesce((v_repair ->> 'reversed')::integer, 0);

  -- Supplier-retained cancels: settle without tour fulfillment attestation.
  update public.supplier_earning_items e
    set
      service_completed_at = coalesce(
        e.service_completed_at,
        (select b.cancelled_at from public.bookings b where b.id = e.booking_id),
        public.booking_service_completion_at(e.booking_id),
        e.experience_at
      ),
      experience_at = coalesce(
        e.experience_at,
        (select b.cancelled_at from public.bookings b where b.id = e.booking_id),
        public.booking_service_completion_at(e.booking_id)
      ),
      eligible_at = coalesce(
        e.service_completed_at,
        (select b.cancelled_at from public.bookings b where b.id = e.booking_id),
        public.booking_service_completion_at(e.booking_id),
        e.experience_at
      ) + make_interval(hours => v_hold_hours),
      updated_at = now()
  where e.status in ('pending', 'eligible')
    and e.amount_minor > 0
    and public.booking_is_supplier_retained_cancel(e.booking_id);
  get diagnostics v_retained_touched = row_count;

  -- Backfill completion clocks for active bookings.
  update public.supplier_earning_items e
    set
      service_completed_at = case
        when public.booking_is_supplier_retained_cancel(e.booking_id) then e.service_completed_at
        when public.booking_is_tour(e.booking_id) then
          case
            when exists (
              select 1 from public.bookings b
              where b.id = e.booking_id
                and lower(coalesce(b.service_fulfillment_status, '')) = 'completed'
            ) then coalesce(
              e.service_completed_at,
              (
                select b.service_fulfilled_at from public.bookings b where b.id = e.booking_id
              ),
              public.booking_service_completion_at(e.booking_id)
            )
            else null
          end
        else coalesce(e.service_completed_at, public.booking_service_completion_at(e.booking_id))
      end,
      experience_at = case
        when public.booking_is_supplier_retained_cancel(e.booking_id) then e.experience_at
        when public.booking_is_tour(e.booking_id) then
          case
            when exists (
              select 1 from public.bookings b
              where b.id = e.booking_id
                and lower(coalesce(b.service_fulfillment_status, '')) = 'completed'
            ) then coalesce(
              e.experience_at,
              (
                select b.service_fulfilled_at from public.bookings b where b.id = e.booking_id
              ),
              public.booking_service_completion_at(e.booking_id)
            )
            else e.experience_at
          end
        else coalesce(e.experience_at, public.booking_service_completion_at(e.booking_id))
      end,
      eligible_at = case
        when public.booking_is_supplier_retained_cancel(e.booking_id) then e.eligible_at
        when public.booking_is_tour(e.booking_id)
          and not exists (
            select 1 from public.bookings b
            where b.id = e.booking_id
              and lower(coalesce(b.service_fulfillment_status, '')) = 'completed'
          )
        then null
        when public.booking_is_tour(e.booking_id) then
          coalesce(
            (
              select b.service_fulfilled_at from public.bookings b where b.id = e.booking_id
            ),
            public.booking_service_completion_at(e.booking_id)
          ) + make_interval(hours => v_hold_hours)
        when public.booking_service_completion_at(e.booking_id) is null then e.eligible_at
        else public.booking_service_completion_at(e.booking_id)
          + make_interval(hours => v_hold_hours)
      end,
      updated_at = now()
  where e.status in ('pending', 'eligible')
    and e.amount_minor > 0
    and not public.booking_is_supplier_retained_cancel(e.booking_id);
  get diagnostics v_completed = row_count;

  update public.supplier_earning_items e
    set status = case when e.amount_minor = 0 then 'reversed' else 'pending' end,
        updated_at = now()
  where e.status = 'eligible'
    and public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_demoted = row_count;

  update public.supplier_earning_items e
    set status = 'pending', updated_at = now()
  where e.status = 'eligible'
    and not public.booking_payout_include_allowed(e.booking_id);
  get diagnostics v_gate_demoted = row_count;

  update public.supplier_earning_items e
    set status = 'eligible', updated_at = now()
  where e.status = 'pending'
    and e.eligible_at is not null
    and e.eligible_at <= p_now
    and e.service_completed_at is not null
    and e.service_completed_at <= p_now
    and e.amount_minor > 0
    and not public.booking_blocks_payout_eligibility(e.booking_id)
    and public.booking_payout_include_allowed(e.booking_id)
    and not public.booking_requires_earning_reversal(e.booking_id);
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'ok', true,
    'promoted', v_n,
    'demoted', coalesce(v_demoted, 0),
    'gate_demoted', coalesce(v_gate_demoted, 0),
    'completion_backfill_touched', coalesce(v_completed, 0),
    'retained_cancel_touched', coalesce(v_retained_touched, 0),
    'stale_blocked_reversed', coalesce(v_stale_reversed, 0),
    'payout_hold_hours', v_hold_hours,
    'requires_tour_fulfillment_attestation', true,
    'requires_ledger_reconcile_ok', true
  );
end;
$$;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from anon, authenticated;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;
CREATE OR REPLACE FUNCTION public.prepare_due_supplier_payouts(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_day integer := extract(day from (v_now at time zone 'UTC'))::integer;
  v_date date := (v_now at time zone 'UTC')::date;
  r record;
  v_terms public.supplier_commercial_terms;
  v_period_id uuid;
  v_amount bigint;
  v_count integer;
  v_created integer := 0;
  v_items integer := 0;
  v_skipped_gate integer := 0;
  v_period_key text;
  v_period_start date;
  v_debt bigint;
  v_net bigint;
  v_applied_debt bigint;
begin
  -- Serialize concurrent prepare runs (idempotent period upsert + skip locked items).
  perform pg_advisory_xact_lock(hashtext('prepare_due_supplier_payouts'));

  perform public.refresh_supplier_earning_eligibility(v_now);

  for r in
    select distinct e.supplier_id, e.currency
    from public.supplier_earning_items e
    where e.status = 'eligible'
      and e.amount_minor > 0
      and public.booking_payout_include_allowed(e.booking_id)
      and not public.booking_requires_earning_reversal(e.booking_id)
  loop
    v_terms := public.supplier_active_commercial_terms(r.supplier_id, v_now);
    if v_terms.id is null then
      continue;
    end if;

    if v_terms.payout_cadence = 'monthly' and v_day <> 1 then
      continue;
    end if;
    if v_terms.payout_cadence = 'semimonthly' and v_day not in (1, 15) then
      continue;
    end if;

    if exists (
      select 1 from public.booking_financial_holds h
      where h.supplier_id = r.supplier_id
        and h.active
        and h.reason_code in ('fraud_review', 'verification', 'manual_review')
    ) then
      continue;
    end if;

    v_period_key := to_char(v_date, 'YYYY-MM-DD');
    if v_terms.payout_cadence = 'monthly' then
      v_period_start := (date_trunc('month', v_date) - interval '1 month')::date;
    elsif v_day = 1 then
      v_period_start := (date_trunc('month', v_date) - interval '1 month' + interval '14 days')::date;
    else
      v_period_start := date_trunc('month', v_date)::date;
    end if;

    insert into public.supplier_payout_periods (
      supplier_id, currency, cadence, period_key, period_start, period_end,
      scheduled_for, status, amount_minor, item_count
    ) values (
      r.supplier_id, r.currency, v_terms.payout_cadence, v_period_key,
      v_period_start, v_date, v_date, 'ready', 0, 0
    )
    on conflict (supplier_id, currency, period_key) do update
      set updated_at = now()
    returning id into v_period_id;

    -- Lock candidate rows to avoid concurrent double-include.
    perform 1
    from public.supplier_earning_items e
    where e.supplier_id = r.supplier_id
      and e.currency = r.currency
      and e.status = 'eligible'
      and e.amount_minor > 0
      and e.payout_period_id is null
    for update skip locked;

    with candidates as (
      select e.id
      from public.supplier_earning_items e
      where e.supplier_id = r.supplier_id
        and e.currency = r.currency
        and e.status = 'eligible'
        and e.amount_minor > 0
        and e.payout_period_id is null
        and e.eligible_at is not null
        and e.eligible_at::date <= v_date
        and e.service_completed_at is not null
        and e.service_completed_at::date <= v_date
        and public.booking_payout_include_allowed(e.booking_id)
        and not public.booking_requires_earning_reversal(e.booking_id)
      for update skip locked
    ),
    moved as (
      update public.supplier_earning_items e
        set status = 'included',
            payout_period_id = v_period_id,
            updated_at = now()
      where e.id in (select id from candidates)
      returning e.id, e.booking_id, e.amount_minor
    )
    insert into public.supplier_payout_period_items (period_id, earning_item_id, booking_id, amount_minor)
    select v_period_id, m.id, m.booking_id, m.amount_minor
    from moved m
    on conflict (earning_item_id) do nothing;

    select count(*)::int into v_skipped_gate
    from public.supplier_earning_items e
    where e.supplier_id = r.supplier_id
      and e.currency = r.currency
      and e.status = 'eligible'
      and not public.booking_payout_include_allowed(e.booking_id);

    select coalesce(sum(amount_minor), 0), count(*)::integer
      into v_amount, v_count
    from public.supplier_payout_period_items
    where period_id = v_period_id;

    v_debt := public.supplier_outstanding_recovery_minor(r.supplier_id, r.currency);
    v_applied_debt := least(v_debt, v_amount);
    v_net := greatest(v_amount - v_applied_debt, 0);

    update public.supplier_payout_periods
      set amount_minor = v_net,
          item_count = v_count,
          updated_at = now(),
          note = case
            when v_applied_debt > 0 then
              coalesce(note || E'\n', '') ||
              'Phase 5: applied recovery debt ' || v_applied_debt::text ||
              ' minor against period gross ' || v_amount::text ||
              ' → net ' || v_net::text
            else note
          end
    where id = v_period_id;

    if v_count > 0 then
      v_items := v_items + v_count;
      v_created := v_created + 1;
    end if;

    if v_applied_debt > 0 then
      insert into public.supplier_ledger_entries (
        supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
      ) values (
        r.supplier_id,
        null,
        'supplier_recovery',
        public.commercial_minor_to_amount(v_applied_debt),
        r.currency,
        'Recovery debt applied to payout period (reduces net payable; never negative payout)',
        'payout-debt-apply:' || v_period_id::text,
        'traverion_phase5_debt_v1'
      )
      on conflict (kind, source_id) do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'periods_touched', v_created,
    'items_included', v_items,
    'eligible_skipped_unready_gate', coalesce(v_skipped_gate, 0),
    'stripe_transfer', false,
    'requires_ledger_reconcile_ok', true,
    'requires_tour_fulfillment_attestation', true,
    'payout_execution_enabled', false,
    'note', 'READY periods only — no Stripe Connect transfer or bank payout; include gated by booking_payout_include_allowed + booking_requires_earning_reversal'
  );
end;
$function$;

revoke all on function public.prepare_due_supplier_payouts(timestamptz) from public;
revoke all on function public.prepare_due_supplier_payouts(timestamptz) from anon, authenticated;
grant execute on function public.prepare_due_supplier_payouts(timestamptz) to service_role;
