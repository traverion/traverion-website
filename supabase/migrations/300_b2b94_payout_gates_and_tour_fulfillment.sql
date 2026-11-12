-- B2B.9.4: Align payout preparation with readiness gates + Tour fulfillment attestation.
-- Read-mostly financial safety. Does NOT enable Stripe payout execution.
-- payout_execution_enabled defaults false (fail closed).

-- ---------------------------------------------------------------------------
-- Runtime kill switch: actual payout execution (mark paid / transfers)
-- ---------------------------------------------------------------------------
insert into public.commercial_runtime_config (key, value_int, note)
values (
  'payout_execution_enabled',
  0,
  'B2B.9.4: 0=disabled (default). 1=authorized. Blocks admin mark-paid and Connect transfer execution until separately authorized.'
)
on conflict (key) do update
  set note = excluded.note,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Tour service fulfillment (server-controlled; not inferred from duration alone)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists service_fulfillment_status text,
  add column if not exists service_fulfilled_at timestamptz,
  add column if not exists service_fulfilled_by uuid,
  add column if not exists service_fulfillment_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_service_fulfillment_status_chk'
  ) then
    alter table public.bookings
      add constraint bookings_service_fulfillment_status_chk
      check (
        service_fulfillment_status is null
        or service_fulfillment_status in (
          'scheduled', 'in_progress', 'completed', 'no_show', 'disputed'
        )
      );
  end if;
end $$;

create table if not exists public.booking_service_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  supplier_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('supplier', 'admin', 'system')),
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists booking_service_fulfillment_events_booking_idx
  on public.booking_service_fulfillment_events (booking_id, created_at desc);

alter table public.booking_service_fulfillment_events enable row level security;
revoke all on table public.booking_service_fulfillment_events from anon, authenticated;
grant select on table public.booking_service_fulfillment_events to authenticated;

drop policy if exists booking_service_fulfillment_events_select on public.booking_service_fulfillment_events;
create policy booking_service_fulfillment_events_select
  on public.booking_service_fulfillment_events for select
  using (
    public.is_traverion_panel_admin()
    or (supplier_id is not null and public.is_supplier_account_side(supplier_id))
  );

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.booking_is_tour(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(nullif(trim(both from l.listing_extras->>'inventoryFamily'), ''), 'tour') = 'tour'
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = p_booking_id
    ),
    false
  );
$$;

revoke all on function public.booking_is_tour(uuid) from public;
grant execute on function public.booking_is_tour(uuid) to authenticated, service_role;

create or replace function public.booking_ledger_reconcile_flags(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pay text;
  v_amount_paid_minor bigint;
  v_gross bigint;
  v_commission bigint;
  v_supplier bigint;
  v_has_snapshot boolean;
  v_earning_count int;
  v_earning_status text;
  v_earning_amount bigint;
  v_pi text;
  v_cs text;
  v_pi_count int;
  v_cs_count int;
  v_flags jsonb := '[]'::jsonb;
begin
  select
    lower(trim(coalesce(b.payment_status, ''))),
    public.commercial_amount_to_minor(b.amount_paid),
    b.payment_intent_id,
    b.checkout_session_id
  into v_pay, v_amount_paid_minor, v_pi, v_cs
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return jsonb_build_array('booking_not_found');
  end if;

  select
    coalesce(s.remaining_gross_minor, s.gross_minor),
    coalesce(s.remaining_commission_minor, s.commission_minor),
    coalesce(s.remaining_supplier_minor, s.supplier_minor),
    true
  into v_gross, v_commission, v_supplier, v_has_snapshot
  from public.booking_commercial_snapshots s
  where s.booking_id = p_booking_id;

  v_has_snapshot := coalesce(v_has_snapshot, false);

  select count(*)::int into v_earning_count
  from public.supplier_earning_items e where e.booking_id = p_booking_id;

  select e.status, e.amount_minor
  into v_earning_status, v_earning_amount
  from public.supplier_earning_items e
  where e.booking_id = p_booking_id
  order by e.created_at desc
  limit 1;

  if v_pi is null or btrim(v_pi) = '' then
    v_pi_count := 0;
  else
    select count(*)::int into v_pi_count from public.bookings b2 where b2.payment_intent_id = v_pi;
  end if;

  if v_cs is null or btrim(v_cs) = '' then
    v_cs_count := 0;
  else
    select count(*)::int into v_cs_count from public.bookings b3 where b3.checkout_session_id = v_cs;
  end if;

  if v_pay in ('paid', 'complete', 'succeeded', 'refunded') and not v_has_snapshot then
    v_flags := v_flags || jsonb_build_array('missing_snapshot');
  end if;
  if v_pay in ('paid', 'complete', 'succeeded', 'refunded') and coalesce(v_earning_count, 0) = 0 then
    v_flags := v_flags || jsonb_build_array('missing_earning');
  end if;
  if coalesce(v_earning_count, 0) > 1 then
    v_flags := v_flags || jsonb_build_array('duplicate_earning');
  end if;
  if v_pay in ('paid', 'complete', 'succeeded')
     and v_gross is not null
     and v_amount_paid_minor is not null
     and v_amount_paid_minor is distinct from v_gross then
    v_flags := v_flags || jsonb_build_array('amount_mismatch');
  end if;
  if v_gross is not null and v_commission is not null and v_supplier is not null
     and v_gross is distinct from (v_commission + v_supplier) then
    v_flags := v_flags || jsonb_build_array('split_mismatch');
  end if;
  if v_pay in ('paid', 'complete', 'succeeded')
     and coalesce(v_earning_count, 0) > 0
     and v_supplier is not null
     and v_earning_amount is not null
     and lower(coalesce(v_earning_status, '')) is distinct from 'reversed'
     and v_earning_amount is distinct from v_supplier then
    v_flags := v_flags || jsonb_build_array('earning_net_mismatch');
  end if;
  if v_pay = 'refunded'
     and coalesce(v_earning_count, 0) > 0
     and (
       lower(coalesce(v_earning_status, '')) is distinct from 'reversed'
       or coalesce(v_earning_amount, 0) <> 0
     ) then
    v_flags := v_flags || jsonb_build_array('refunded_still_payable');
  end if;
  if v_pay in ('paid', 'complete', 'succeeded')
     and lower(coalesce(v_earning_status, '')) = 'reversed' then
    v_flags := v_flags || jsonb_build_array('paid_but_reversed');
  end if;
  if v_pay in ('pending', 'failed', 'authorized')
     and coalesce(v_earning_count, 0) > 0
     and lower(coalesce(v_earning_status, '')) is distinct from 'reversed' then
    v_flags := v_flags || jsonb_build_array('failed_or_pending_has_earnings');
  end if;
  if coalesce(v_pi_count, 0) > 1 then
    v_flags := v_flags || jsonb_build_array('duplicate_payment_intent');
  end if;
  if coalesce(v_cs_count, 0) > 1 then
    v_flags := v_flags || jsonb_build_array('duplicate_checkout_session');
  end if;

  return v_flags;
end;
$$;

revoke all on function public.booking_ledger_reconcile_flags(uuid) from public;
revoke all on function public.booking_ledger_reconcile_flags(uuid) from anon, authenticated;
grant execute on function public.booking_ledger_reconcile_flags(uuid) to service_role;

create or replace function public.booking_payout_include_blocked_reasons(p_booking_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reasons text[] := array[]::text[];
  v_pay text;
  v_status text;
  v_fulfill text;
  v_supplier_id uuid;
  v_flags jsonb;
  v_flag text;
  v_is_tour boolean;
begin
  select
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.service_fulfillment_status, ''))),
    l.supplier_id,
    public.booking_is_tour(b.id)
  into v_pay, v_status, v_fulfill, v_supplier_id, v_is_tour
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if not found then
    return array['booking_not_found'];
  end if;

  if public.booking_blocks_payout_eligibility(p_booking_id) then
    v_reasons := array_append(v_reasons, 'blocked_by_policy');
  end if;

  if v_status = 'cancelled' then
    v_reasons := array_append(v_reasons, 'booking_cancelled');
  end if;
  if v_status = 'no_show' or v_fulfill = 'no_show' then
    v_reasons := array_append(v_reasons, 'no_show');
  end if;
  if v_fulfill = 'disputed' then
    v_reasons := array_append(v_reasons, 'fulfillment_disputed');
  end if;

  if v_pay = '' then
    v_reasons := array_append(v_reasons, 'payment_unknown');
  elsif v_pay = 'refunded' then
    v_reasons := array_append(v_reasons, 'payment_refunded');
  elsif v_pay not in ('paid', 'complete', 'succeeded') then
    v_reasons := array_append(v_reasons, 'payment_not_confirmed');
  end if;

  if v_supplier_id is null
     or not exists (select 1 from public.supplier_profiles sp where sp.id = v_supplier_id) then
    v_reasons := array_append(v_reasons, 'invalid_supplier');
  end if;

  -- Tours: require explicit completed attestation (never duration-only).
  if coalesce(v_is_tour, false) then
    if v_fulfill is distinct from 'completed' then
      v_reasons := array_append(v_reasons, 'tour_fulfillment_not_attested');
      if v_fulfill is null or v_fulfill = '' or v_fulfill = 'scheduled' then
        v_reasons := array_append(v_reasons, 'missing_policy_inferred_completion_disabled');
      end if;
    end if;
  end if;

  v_flags := public.booking_ledger_reconcile_flags(p_booking_id);
  if jsonb_array_length(coalesce(v_flags, '[]'::jsonb)) > 0 then
    v_reasons := array_append(v_reasons, 'unreconciled');
    for v_flag in select jsonb_array_elements_text(v_flags)
    loop
      if not (v_flag = any (v_reasons)) then
        v_reasons := array_append(v_reasons, v_flag);
      end if;
    end loop;
  end if;

  return v_reasons;
end;
$$;

revoke all on function public.booking_payout_include_blocked_reasons(uuid) from public;
revoke all on function public.booking_payout_include_blocked_reasons(uuid) from anon, authenticated;
grant execute on function public.booking_payout_include_blocked_reasons(uuid) to service_role;

create or replace function public.booking_payout_include_allowed(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cardinality(public.booking_payout_include_blocked_reasons(p_booking_id)) = 0;
$$;

revoke all on function public.booking_payout_include_allowed(uuid) from public;
revoke all on function public.booking_payout_include_allowed(uuid) from anon, authenticated;
grant execute on function public.booking_payout_include_allowed(uuid) to service_role;

-- Harden classic block helper: no_show / disputed fulfillment always block.
create or replace function public.booking_blocks_payout_eligibility(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_pay text;
  v_dispute text;
  v_resolution text;
  v_fulfill text;
  v_hold boolean;
  v_support boolean;
begin
  select
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.dispute_status, ''))),
    lower(trim(coalesce(b.cancellation_resolution, ''))),
    lower(trim(coalesce(b.service_fulfillment_status, '')))
  into v_status, v_pay, v_dispute, v_resolution, v_fulfill
  from public.bookings b
  where b.id = p_booking_id;

  if v_status is null then
    return true;
  end if;
  if v_status in ('cancelled', 'no_show') then
    return true;
  end if;
  if v_pay in ('refunded', 'failed') then
    return true;
  end if;
  if v_resolution in ('pending_customer_choice', 'reschedule') then
    return true;
  end if;
  if v_dispute in ('open', 'needs_response', 'under_review', 'lost') then
    return true;
  end if;
  if v_fulfill in ('no_show', 'disputed') then
    return true;
  end if;

  select exists (
    select 1 from public.booking_financial_holds h
    where h.booking_id = p_booking_id and h.active
  ) into v_hold;
  if coalesce(v_hold, false) then
    return true;
  end if;

  select exists (
    select 1 from public.booking_support_cases c
    where c.booking_id = p_booking_id
      and c.status in ('submitted', 'under_review', 'waiting_operator', 'escalated')
  ) into v_support;
  if coalesce(v_support, false) then
    return true;
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Refresh eligibility: demote unreconciled / unattested; never promote on duration alone for tours
-- ---------------------------------------------------------------------------
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
begin
  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 48);

  -- Backfill completion clocks.
  -- Tours: only from explicit fulfillment attestation (never inferred duration alone).
  update public.supplier_earning_items e
    set
      service_completed_at = case
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
    and e.amount_minor > 0;
  get diagnostics v_completed = row_count;

  update public.supplier_earning_items e
    set status = case when e.amount_minor = 0 then 'reversed' else 'pending' end,
        updated_at = now()
  where e.status = 'eligible'
    and public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_demoted = row_count;

  -- Demote items that fail readiness/reconcile/attestation gates.
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
    and public.booking_payout_include_allowed(e.booking_id);
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'ok', true,
    'promoted', v_n,
    'demoted', coalesce(v_demoted, 0),
    'gate_demoted', coalesce(v_gate_demoted, 0),
    'completion_backfill_touched', coalesce(v_completed, 0),
    'payout_hold_hours', v_hold_hours,
    'requires_tour_fulfillment_attestation', true,
    'requires_ledger_reconcile_ok', true
  );
end;
$$;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- prepare_due: same gates as readiness; advisory lock; skip locked; idempotent
-- ---------------------------------------------------------------------------
create or replace function public.prepare_due_supplier_payouts(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'note', 'READY periods only — no Stripe Connect transfer or bank payout; include gated by booking_payout_include_allowed'
  );
end;
$$;

revoke all on function public.prepare_due_supplier_payouts(timestamptz) from public;
grant execute on function public.prepare_due_supplier_payouts(timestamptz) to service_role;

comment on function public.prepare_due_supplier_payouts(timestamptz) is
  'B2B.9.4: prepare READY payout periods only when booking_payout_include_allowed (reconcile ok + tour attested). Does NOT call Stripe.';

-- ---------------------------------------------------------------------------
-- Mark paid: revalidate every included item; fail closed unless execution enabled
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_payout_period_paid(
  p_period_id uuid,
  p_note text default null,
  p_actor_id uuid default null,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.supplier_payout_periods;
  v_earn_id uuid;
  v_ref text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_exec boolean := false;
  v_blocked jsonb := '[]'::jsonb;
begin
  select coalesce(value_int, 0) = 1 into v_exec
  from public.commercial_runtime_config
  where key = 'payout_execution_enabled';
  if not coalesce(v_exec, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'payout_execution_disabled',
      'note', 'B2B.9.4: payout execution is disabled until separately authorized'
    );
  end if;

  select * into v_period from public.supplier_payout_periods where id = p_period_id for update;
  if v_period.id is null then
    return jsonb_build_object('ok', false, 'error', 'period_not_found');
  end if;
  if v_period.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_period.status not in ('ready', 'processing') then
    return jsonb_build_object('ok', false, 'error', 'period_not_ready');
  end if;
  if v_period.amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_period');
  end if;
  if v_ref is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'payment_reference_required',
      'note', 'Cannot mark paid without a payment confirmation reference'
    );
  end if;

  -- Revalidate eligibility immediately before execution.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'booking_id', e.booking_id,
        'earning_item_id', e.id,
        'reasons', to_jsonb(public.booking_payout_include_blocked_reasons(e.booking_id))
      )
    ),
    '[]'::jsonb
  )
  into v_blocked
  from public.supplier_earning_items e
  where e.payout_period_id = p_period_id
    and e.status = 'included'
    and not public.booking_payout_include_allowed(e.booking_id);

  if jsonb_array_length(coalesce(v_blocked, '[]'::jsonb)) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'included_items_no_longer_eligible',
      'blocked_items', v_blocked
    );
  end if;

  insert into public.supplier_earnings (
    supplier_id, period_start, period_end, amount, currency, status, note, recorded_by
  ) values (
    v_period.supplier_id,
    v_period.period_start,
    v_period.period_end,
    public.commercial_minor_to_amount(v_period.amount_minor),
    v_period.currency,
    'paid',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Payout period ' || v_period.period_key || ' · ref ' || v_ref),
    p_actor_id
  )
  returning id into v_earn_id;

  update public.supplier_earning_items
    set status = 'paid', updated_at = now()
  where payout_period_id = p_period_id and status = 'included';

  update public.supplier_payout_periods
    set status = 'paid',
        paid_at = now(),
        paid_via = 'manual_admin:' || left(v_ref, 120),
        note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
        updated_at = now()
  where id = p_period_id;

  insert into public.financial_audit_log (
    actor_id, action, supplier_id, amount_minor, currency, reason, provider_ref, after_state
  ) values (
    p_actor_id,
    'admin_mark_payout_period_paid',
    v_period.supplier_id,
    v_period.amount_minor,
    v_period.currency,
    'Marked payout period paid after include-gate revalidation',
    v_ref,
    jsonb_build_object('period_id', p_period_id, 'supplier_earnings_id', v_earn_id)
  );

  return jsonb_build_object(
    'ok', true,
    'supplier_earnings_id', v_earn_id,
    'period_id', p_period_id,
    'payment_reference', v_ref
  );
end;
$$;

revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid, text) from public;
revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid, text) from anon, authenticated;
grant execute on function public.admin_mark_payout_period_paid(uuid, text, uuid, text) to service_role;

create or replace function public.admin_mark_payout_period_paid(
  p_period_id uuid,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.admin_mark_payout_period_paid(p_period_id, p_note, p_actor_id, null);
end;
$$;

revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid) from public;
revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid) from anon, authenticated;
grant execute on function public.admin_mark_payout_period_paid(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Connect transfer preflight: revalidate include gates
-- ---------------------------------------------------------------------------
create or replace function public.supplier_connect_transfer_preflight(
  p_supplier_id uuid,
  p_payout_period_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period public.supplier_payout_periods%rowtype;
  v_profile public.supplier_profiles%rowtype;
  v_debt bigint := 0;
  v_active_attempt uuid;
  v_reasons text[] := array[]::text[];
  v_exec boolean := false;
begin
  select coalesce(value_int, 0) = 1 into v_exec
  from public.commercial_runtime_config
  where key = 'payout_execution_enabled';
  if not coalesce(v_exec, false) then
    v_reasons := array_append(v_reasons, 'payout_execution_disabled');
  end if;

  select * into v_period from public.supplier_payout_periods where id = p_payout_period_id;
  if not found then
    return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('period_not_found'));
  end if;
  if v_period.supplier_id is distinct from p_supplier_id then
    return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('supplier_mismatch'));
  end if;
  if lower(v_period.status) <> 'ready' then
    v_reasons := array_append(v_reasons, 'period_not_ready');
  end if;
  if coalesce(v_period.connect_lifecycle, 'internal_only') not in ('internal_only', 'failed') then
    v_reasons := array_append(v_reasons, 'lifecycle_not_transferable');
  end if;

  select * into v_profile from public.supplier_profiles where id = p_supplier_id;
  if not found then
    return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('supplier_not_found'));
  end if;

  if v_profile.stripe_connected_account_id is null then
    v_reasons := array_append(v_reasons, 'connect_account_missing');
  end if;
  if not coalesce(v_profile.connect_payouts_enabled, false) then
    v_reasons := array_append(v_reasons, 'connect_payouts_disabled');
  end if;
  if coalesce(v_profile.connect_onboarding_status, 'not_started') <> 'complete' then
    v_reasons := array_append(v_reasons, 'connect_not_complete');
  end if;
  if jsonb_array_length(coalesce(v_profile.connect_requirements_currently_due, '[]'::jsonb)) > 0 then
    v_reasons := array_append(v_reasons, 'connect_requirements_due');
  end if;
  if jsonb_array_length(coalesce(v_profile.connect_requirements_past_due, '[]'::jsonb)) > 0 then
    v_reasons := array_append(v_reasons, 'connect_requirements_past_due');
  end if;
  if coalesce(v_profile.connect_debit_negative_balances, false) then
    v_reasons := array_append(v_reasons, 'debit_negative_balances_forbidden');
  end if;

  if exists (
    select 1
    from public.supplier_earning_items e
    where e.payout_period_id = p_payout_period_id
      and e.status = 'included'
      and (
        public.booking_blocks_payout_eligibility(e.booking_id)
        or not public.booking_payout_include_allowed(e.booking_id)
      )
  ) then
    v_reasons := array_append(v_reasons, 'included_items_not_eligible');
  end if;

  v_debt := public.supplier_outstanding_recovery_minor(p_supplier_id, v_period.currency);

  select a.id into v_active_attempt
  from public.supplier_transfer_attempts a
  where a.payout_period_id = p_payout_period_id
    and a.status in ('queued', 'reserved', 'transfer_pending', 'transfer_completed')
  limit 1;

  if v_active_attempt is not null then
    v_reasons := array_append(v_reasons, 'active_transfer_exists');
  end if;

  if coalesce(v_period.amount_minor, 0) <= 0 then
    v_reasons := array_append(v_reasons, 'zero_amount');
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_reasons) = 0,
    'reasons', to_jsonb(v_reasons),
    'supplier_id', p_supplier_id,
    'payout_period_id', p_payout_period_id,
    'amount_minor', coalesce(v_period.amount_minor, 0),
    'currency', upper(trim(coalesce(v_period.currency, 'EUR'))),
    'stripe_connected_account_id', v_profile.stripe_connected_account_id,
    'outstanding_debt_minor', v_debt,
    'scheduled_for', v_period.scheduled_for
  );
end;
$$;

revoke all on function public.supplier_connect_transfer_preflight(uuid, uuid) from public;
grant execute on function public.supplier_connect_transfer_preflight(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Supplier / admin fulfillment attestation
-- ---------------------------------------------------------------------------
create or replace function public.supplier_attest_booking_service_fulfillment(
  p_booking_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_booking public.bookings%rowtype;
  v_supplier uuid;
  v_from text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if v_status not in ('scheduled', 'in_progress', 'completed', 'no_show', 'disputed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if not public.booking_is_tour(p_booking_id) then
    return jsonb_build_object('ok', false, 'error', 'not_a_tour_booking');
  end if;

  select l.supplier_id into v_supplier
  from public.listings l where l.id = v_booking.listing_id;

  if v_supplier is null or not public.is_supplier_account_side(v_supplier) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if lower(coalesce(v_booking.payment_status, '')) not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'payment_not_confirmed');
  end if;

  if lower(coalesce(v_booking.status, '')) = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'booking_cancelled');
  end if;

  -- Missing no-show/dispute commercial policy: allow status set but payout stays held via gates.
  v_from := v_booking.service_fulfillment_status;

  update public.bookings
    set service_fulfillment_status = v_status,
        service_fulfilled_at = case when v_status = 'completed' then coalesce(service_fulfilled_at, now()) else service_fulfilled_at end,
        service_fulfilled_by = v_uid,
        service_fulfillment_note = coalesce(v_note, service_fulfillment_note)
  where id = p_booking_id;

  insert into public.booking_service_fulfillment_events (
    booking_id, supplier_id, actor_id, actor_role, from_status, to_status, note
  ) values (
    p_booking_id, v_supplier, v_uid, 'supplier', v_from, v_status, v_note
  );

  insert into public.financial_audit_log (
    actor_id, action, booking_id, supplier_id, reason, before_state, after_state
  ) values (
    v_uid,
    'supplier_attest_booking_service_fulfillment',
    p_booking_id,
    v_supplier,
    coalesce(v_note, 'Tour fulfillment attestation'),
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', v_status)
  );

  -- Refresh earning clocks for this booking after attestation.
  perform public.refresh_supplier_earning_eligibility(now());

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'service_fulfillment_status', v_status,
    'payout_include_allowed', public.booking_payout_include_allowed(p_booking_id),
    'blocked_reasons', to_jsonb(public.booking_payout_include_blocked_reasons(p_booking_id)),
    'missing_policies', case
      when v_status in ('no_show', 'disputed') then
        jsonb_build_array(
          'no_show_and_dispute_commercial_settlement_policy_undefined_payouts_remain_held'
        )
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.supplier_attest_booking_service_fulfillment(uuid, text, text) from public;
revoke all on function public.supplier_attest_booking_service_fulfillment(uuid, text, text) from anon;
grant execute on function public.supplier_attest_booking_service_fulfillment(uuid, text, text) to authenticated, service_role;

create or replace function public.admin_set_booking_service_fulfillment(
  p_booking_id uuid,
  p_status text,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_booking public.bookings%rowtype;
  v_supplier uuid;
  v_from text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_status not in ('scheduled', 'in_progress', 'completed', 'no_show', 'disputed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  select l.supplier_id into v_supplier from public.listings l where l.id = v_booking.listing_id;
  v_from := v_booking.service_fulfillment_status;

  update public.bookings
    set service_fulfillment_status = v_status,
        service_fulfilled_at = case when v_status = 'completed' then coalesce(service_fulfilled_at, now()) else service_fulfilled_at end,
        service_fulfilled_by = coalesce(p_actor_id, service_fulfilled_by),
        service_fulfillment_note = coalesce(v_note, service_fulfillment_note)
  where id = p_booking_id;

  insert into public.booking_service_fulfillment_events (
    booking_id, supplier_id, actor_id, actor_role, from_status, to_status, note
  ) values (
    p_booking_id, v_supplier, p_actor_id, 'admin', v_from, v_status, v_note
  );

  insert into public.financial_audit_log (
    actor_id, action, booking_id, supplier_id, reason, before_state, after_state
  ) values (
    p_actor_id,
    'admin_set_booking_service_fulfillment',
    p_booking_id,
    v_supplier,
    coalesce(v_note, 'Admin fulfillment override'),
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', v_status)
  );

  perform public.refresh_supplier_earning_eligibility(now());

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'service_fulfillment_status', v_status,
    'payout_include_allowed', public.booking_payout_include_allowed(p_booking_id),
    'blocked_reasons', to_jsonb(public.booking_payout_include_blocked_reasons(p_booking_id))
  );
end;
$$;

revoke all on function public.admin_set_booking_service_fulfillment(uuid, text, text, uuid) from public;
revoke all on function public.admin_set_booking_service_fulfillment(uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.admin_set_booking_service_fulfillment(uuid, text, text, uuid) to service_role;
