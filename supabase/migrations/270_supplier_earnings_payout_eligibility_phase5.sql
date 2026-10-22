-- Phase 5 of 6: Supplier earnings eligibility — service completion, debt netting,
-- sales vs earned period helpers, PI lineage for reschedules, reconciliation.
-- Stripe Connect bank transfers remain DISABLED (platform-captured; admin marks paid).

-- ---------------------------------------------------------------------------
-- Earning item lineage columns
-- ---------------------------------------------------------------------------
alter table public.supplier_earning_items
  add column if not exists sold_at timestamptz;

alter table public.supplier_earning_items
  add column if not exists service_completed_at timestamptz;

alter table public.supplier_earning_items
  add column if not exists payment_intent_id text;

alter table public.supplier_earning_items
  add column if not exists gross_minor bigint;

alter table public.supplier_earning_items
  add column if not exists commission_minor bigint;

alter table public.supplier_earning_items
  add column if not exists commission_bps integer;

comment on column public.supplier_earning_items.sold_at is
  'When the customer payment settled (sale). Distinct from service_completed_at / eligible_at.';
comment on column public.supplier_earning_items.service_completed_at is
  'Tour scheduled end or Stay check-out (service delivery clock).';
comment on column public.supplier_earning_items.payment_intent_id is
  'Stripe PI for lineage; at most one non-reversed earning item per PI.';

create index if not exists supplier_earning_items_sold_at_idx
  on public.supplier_earning_items (supplier_id, sold_at)
  where sold_at is not null;

-- ---------------------------------------------------------------------------
-- Parse tour duration hours from purchase_snapshot.duration (safe default 3h)
-- ---------------------------------------------------------------------------
create or replace function public.booking_tour_duration_hours(p_booking public.bookings)
returns numeric
language plpgsql
stable
as $$
declare
  v_raw text;
  v_num numeric;
begin
  v_raw := lower(trim(coalesce(p_booking.purchase_snapshot->>'duration', '')));
  if v_raw = '' then
    return 3;
  end if;
  -- "90 minutes" / "90 min"
  if v_raw ~ '([0-9]+([.][0-9]+)?)\s*min' then
    v_num := substring(v_raw from '([0-9]+([.][0-9]+)?)')::numeric;
    if v_num is not null and v_num > 0 then
      return greatest(0.5, least(v_num / 60.0, 24));
    end if;
  end if;
  -- "4 hours" / "2.5 h" / "4h"
  if v_raw ~ '([0-9]+([.][0-9]+)?)\s*h' then
    v_num := substring(v_raw from '([0-9]+([.][0-9]+)?)')::numeric;
    if v_num is not null and v_num > 0 then
      return greatest(0.5, least(v_num, 24));
    end if;
  end if;
  return 3;
end;
$$;

-- Service completion clock (Tours: official start + duration; Stays: check-out)
create or replace function public.booking_service_completion_at(p_booking public.bookings)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hours numeric;
  v_tz text;
  v_out date;
  v_hm text;
  v_hh int;
  v_mm int;
begin
  if public.booking_is_stay_night(p_booking) then
    v_tz := nullif(trim(coalesce(p_booking.purchase_snapshot->>'departureTimezone', '')), '');
    if v_tz is null then
      v_tz := 'Europe/Helsinki';
    end if;
    v_out := coalesce(p_booking.check_out, p_booking.booking_date);
    if v_out is null then
      return null;
    end if;
    v_hm := nullif(trim(coalesce(p_booking.purchase_snapshot->>'checkOutTime', '')), '');
    if v_hm is null then
      v_hm := '11:00';
    end if;
    begin
      v_hh := split_part(v_hm, ':', 1)::int;
      v_mm := split_part(v_hm, ':', 2)::int;
    exception when others then
      v_hh := 11;
      v_mm := 0;
    end;
    begin
      return (v_out::timestamp + make_interval(hours => v_hh, mins => v_mm)) at time zone v_tz;
    exception when others then
      return (v_out::timestamp + interval '11 hours') at time zone 'Europe/Helsinki';
    end;
  end if;

  v_start := public.booking_official_start_at(p_booking);
  if v_start is null then
    return null;
  end if;
  v_hours := public.booking_tour_duration_hours(p_booking);
  return v_start + make_interval(secs => (v_hours * 3600)::int);
end;
$$;

create or replace function public.booking_service_completion_at(p_booking_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return null;
  end if;
  return public.booking_service_completion_at(v_booking);
end;
$$;

revoke all on function public.booking_service_completion_at(uuid) from public;
grant execute on function public.booking_service_completion_at(uuid) to authenticated;
grant execute on function public.booking_service_completion_at(uuid) to service_role;

-- Align legacy booking_experience_at with completion clock (eligibility basis)
create or replace function public.booking_experience_at(p_booking_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.booking_service_completion_at(p_booking_id);
end;
$$;

-- Risk / hold gate for earnings eligibility (extends Phase 4 holds)
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
  v_hold boolean;
  v_support boolean;
begin
  select
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.dispute_status, ''))),
    lower(trim(coalesce(b.cancellation_resolution, '')))
  into v_status, v_pay, v_dispute, v_resolution
  from public.bookings b
  where b.id = p_booking_id;

  if v_status is null then
    return true;
  end if;
  if v_status = 'cancelled' then
    return true;
  end if;
  if v_pay in ('refunded', 'failed') then
    return true;
  end if;
  if v_resolution in ('pending_customer_choice', 'reschedule') then
    -- reschedule lineage: old cancelled row must never pay; new booking has its own item
    return true;
  end if;
  if v_dispute in ('open', 'needs_response', 'under_review', 'lost') then
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

-- Outstanding recovery debt (minor units, positive = supplier owes Traverion).
-- Recovery rows store negative amounts; debt-applied offsets store positive amounts.
create or replace function public.supplier_outstanding_recovery_minor(
  p_supplier_id uuid,
  p_currency text
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce(
      - sum(public.commercial_amount_to_minor(l.amount)),
      0
    ),
    0
  )::bigint
  from public.supplier_ledger_entries l
  where l.supplier_id = p_supplier_id
    and upper(trim(coalesce(l.currency, 'EUR'))) = upper(trim(coalesce(p_currency, 'EUR')))
    and l.kind = 'supplier_recovery';
$$;

revoke all on function public.supplier_outstanding_recovery_minor(uuid, text) from public;
grant execute on function public.supplier_outstanding_recovery_minor(uuid, text) to authenticated;
grant execute on function public.supplier_outstanding_recovery_minor(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Refresh eligibility: completion + clearance hold + risk demotion
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
begin
  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 48);

  -- Backfill completion clocks from bookings
  update public.supplier_earning_items e
    set
      service_completed_at = coalesce(e.service_completed_at, public.booking_service_completion_at(e.booking_id)),
      experience_at = coalesce(e.experience_at, public.booking_service_completion_at(e.booking_id)),
      eligible_at = case
        when public.booking_service_completion_at(e.booking_id) is null then e.eligible_at
        else public.booking_service_completion_at(e.booking_id)
          + make_interval(hours => v_hold_hours)
      end,
      updated_at = now()
  where e.status in ('pending', 'eligible')
    and e.amount_minor > 0;
  get diagnostics v_completed = row_count;

  -- Demote blocked / cancelled / held
  update public.supplier_earning_items e
    set status = case when e.amount_minor = 0 then 'reversed' else 'pending' end,
        updated_at = now()
  where e.status = 'eligible'
    and public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_demoted = row_count;

  -- Promote only after service completion + clearance window, no risk
  update public.supplier_earning_items e
    set status = 'eligible', updated_at = now()
  where e.status = 'pending'
    and e.eligible_at is not null
    and e.eligible_at <= p_now
    and e.service_completed_at is not null
    and e.service_completed_at <= p_now
    and e.amount_minor > 0
    and not public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'ok', true,
    'promoted', v_n,
    'demoted', coalesce(v_demoted, 0),
    'completion_backfill_touched', coalesce(v_completed, 0),
    'payout_hold_hours', v_hold_hours
  );
end;
$$;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- prepare_due: net recovery debt; never negative Stripe/admin payout amount
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
  v_period_key text;
  v_period_start date;
  v_debt bigint;
  v_net bigint;
  v_applied_debt bigint;
begin
  -- Phase 5: eligibility refresh is internal prep only — does NOT initiate Stripe payouts.
  perform public.refresh_supplier_earning_eligibility(v_now);

  for r in
    select distinct e.supplier_id, e.currency
    from public.supplier_earning_items e
    where e.status = 'eligible'
      and e.amount_minor > 0
      and not public.booking_blocks_payout_eligibility(e.booking_id)
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

    -- Supplier-wide risk holds block prep. negative_balance is netted below (not a hard block).
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

    with moved as (
      update public.supplier_earning_items e
        set status = 'included',
            payout_period_id = v_period_id,
            updated_at = now()
      where e.supplier_id = r.supplier_id
        and e.currency = r.currency
        and e.status = 'eligible'
        and e.amount_minor > 0
        and e.payout_period_id is null
        and e.eligible_at is not null
        and e.eligible_at::date <= v_date
        and e.service_completed_at is not null
        and e.service_completed_at::date <= v_date
        and not public.booking_blocks_payout_eligibility(e.booking_id)
      returning e.id, e.booking_id, e.amount_minor
    )
    insert into public.supplier_payout_period_items (period_id, earning_item_id, booking_id, amount_minor)
    select v_period_id, m.id, m.booking_id, m.amount_minor
    from moved m
    on conflict (earning_item_id) do nothing;

    select coalesce(sum(amount_minor), 0), count(*)::integer
      into v_amount, v_count
    from public.supplier_payout_period_items
    where period_id = v_period_id;

    v_debt := public.supplier_outstanding_recovery_minor(r.supplier_id, r.currency);
    v_applied_debt := least(v_debt, v_amount);
    v_net := greatest(v_amount - v_applied_debt, 0);

    -- Never create a negative payout period. Debt beyond earnings stays on ledger.
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

    -- Offset recovery debt on ledger (positive amount reduces outstanding). Idempotent per period.
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
    'stripe_transfer', false,
    'note', 'READY periods only — no Stripe Connect transfer or bank payout'
  );
end;
$$;

revoke all on function public.prepare_due_supplier_payouts(timestamptz) from public;
grant execute on function public.prepare_due_supplier_payouts(timestamptz) to service_role;

comment on function public.prepare_due_supplier_payouts(timestamptz) is
  'Phase 5: prepare READY payout periods from cleared completed earnings, net of recovery debt. Does NOT call Stripe.';

-- ---------------------------------------------------------------------------
-- Patch record_paid_booking_earnings: sold_at, completion, PI, skip reschedule-from doubles
-- (re-apply body via replace of insert earning section — full function from 239/238 too large;
--  use wrapper trigger after insert instead)
-- ---------------------------------------------------------------------------
create or replace function public.supplier_earning_items_phase5_enrich()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_hold_hours integer;
  v_snap public.booking_commercial_snapshots%rowtype;
  v_pi text;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if v_booking.id is null then
    return new;
  end if;

  -- Reschedule target reuses PI: reverse any prior active earning on same PI first
  v_pi := nullif(trim(coalesce(v_booking.payment_intent_id, '')), '');
  if v_pi is not null then
    update public.supplier_earning_items e
      set status = 'reversed',
          amount_minor = 0,
          updated_at = now()
    where e.payment_intent_id = v_pi
      and e.id is distinct from new.id
      and e.status is distinct from 'reversed';
  end if;

  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 48);

  select * into v_snap from public.booking_commercial_snapshots where booking_id = new.booking_id;

  new.sold_at := coalesce(new.sold_at, v_booking.paid_at, new.created_at);
  new.payment_intent_id := coalesce(new.payment_intent_id, v_pi);
  new.service_completed_at := coalesce(
    new.service_completed_at,
    public.booking_service_completion_at(v_booking)
  );
  new.experience_at := coalesce(new.experience_at, new.service_completed_at);
  if new.service_completed_at is not null then
    new.eligible_at := new.service_completed_at + make_interval(hours => v_hold_hours);
  end if;
  if v_snap.booking_id is not null then
    new.gross_minor := coalesce(new.gross_minor, v_snap.remaining_gross_minor);
    new.commission_minor := coalesce(new.commission_minor, v_snap.remaining_commission_minor);
    new.commission_bps := coalesce(new.commission_bps, v_snap.commission_bps);
  end if;

  -- Never start as eligible if blocked or service not yet complete
  if public.booking_blocks_payout_eligibility(new.booking_id)
     or new.service_completed_at is null
     or new.service_completed_at > now()
     or new.eligible_at is null
     or new.eligible_at > now() then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_supplier_earning_items_phase5_enrich on public.supplier_earning_items;
create trigger tr_supplier_earning_items_phase5_enrich
  before insert on public.supplier_earning_items
  for each row execute function public.supplier_earning_items_phase5_enrich();

-- ---------------------------------------------------------------------------
-- Reschedule: reverse old earnings + record on new booking (same PI lineage)
-- ---------------------------------------------------------------------------
create or replace function public.phase5_sync_earnings_after_reschedule(
  p_old_booking_id uuid,
  p_new_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev jsonb;
  v_rec jsonb;
begin
  v_rev := public.reverse_paid_booking_earnings(p_old_booking_id);
  v_rec := public.record_paid_booking_earnings(p_new_booking_id);
  return jsonb_build_object('ok', true, 'reversed', v_rev, 'recorded', v_rec);
end;
$$;

revoke all on function public.phase5_sync_earnings_after_reschedule(uuid, uuid) from public;
grant execute on function public.phase5_sync_earnings_after_reschedule(uuid, uuid) to service_role;
grant execute on function public.phase5_sync_earnings_after_reschedule(uuid, uuid) to authenticated;

-- Hook into reschedule RPC return path via replace of reschedule function end —
-- patch: call sync after successful insert (redefine thin wrapper update in place).
-- Safer: alter reschedule_supplier_cancelled_booking to call sync before return.
-- We recreate the call by updating the function body through a search-replace in 268 is heavy;
-- add AFTER statement via extending reschedule — read current and append call.

-- Period Sales: unique PaymentIntents sold in window (exclude pure reschedule children)
create or replace function public.supplier_period_sales(
  p_supplier_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_currency text default 'EUR'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur text := upper(trim(coalesce(p_currency, 'EUR')));
  v_gross bigint := 0;
  v_comm bigint := 0;
  v_supp bigint := 0;
  v_count integer := 0;
begin
  if p_supplier_id is null or p_from is null or p_to is null or p_from >= p_to then
    return jsonb_build_object('ok', false, 'error', 'invalid_range');
  end if;

  -- One row per payment_intent (or booking id if PI missing). Reschedule children excluded.
  with sales as (
    select distinct on (coalesce(nullif(trim(b.payment_intent_id), ''), b.id::text))
      s.gross_minor,
      s.commission_minor,
      s.supplier_minor,
      s.remaining_gross_minor,
      s.remaining_commission_minor,
      s.remaining_supplier_minor
    from public.booking_commercial_snapshots s
    join public.bookings b on b.id = s.booking_id
    join public.listings l on l.id = b.listing_id
    where l.supplier_id = p_supplier_id
      and upper(trim(coalesce(s.currency, 'EUR'))) = v_cur
      and coalesce(b.paid_at, s.frozen_at_checkout_at, s.settled_at) >= p_from
      and coalesce(b.paid_at, s.frozen_at_checkout_at, s.settled_at) < p_to
      and b.rescheduled_from_booking_id is null
    order by coalesce(nullif(trim(b.payment_intent_id), ''), b.id::text),
             coalesce(s.frozen_at_checkout_at, s.settled_at) nulls last
  )
  select
    coalesce(sum(remaining_gross_minor), 0),
    coalesce(sum(remaining_commission_minor), 0),
    coalesce(sum(remaining_supplier_minor), 0),
    count(*)::integer
  into v_gross, v_comm, v_supp, v_count
  from sales;

  return jsonb_build_object(
    'ok', true,
    'concept', 'period_sales',
    'currency', v_cur,
    'from', p_from,
    'to', p_to,
    'sale_count', v_count,
    'gross_minor', v_gross,
    'commission_minor', v_comm,
    'supplier_net_minor', v_supp,
    'note', 'Net of commission; one sale per PaymentIntent; reschedule children excluded'
  );
end;
$$;

revoke all on function public.supplier_period_sales(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.supplier_period_sales(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.supplier_period_sales(uuid, timestamptz, timestamptz, text) to service_role;

-- Period Earnings: items that became eligible/included/paid with completion in window
create or replace function public.supplier_period_earnings(
  p_supplier_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_currency text default 'EUR'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur text := upper(trim(coalesce(p_currency, 'EUR')));
  v_amt bigint := 0;
  v_count integer := 0;
  v_debt bigint;
begin
  if p_supplier_id is null or p_from is null or p_to is null or p_from >= p_to then
    return jsonb_build_object('ok', false, 'error', 'invalid_range');
  end if;

  select coalesce(sum(e.amount_minor), 0), count(*)::integer
    into v_amt, v_count
  from public.supplier_earning_items e
  where e.supplier_id = p_supplier_id
    and upper(trim(coalesce(e.currency, 'EUR'))) = v_cur
    and e.status in ('eligible', 'included', 'paid')
    and e.amount_minor > 0
    and e.service_completed_at is not null
    and e.service_completed_at >= p_from
    and e.service_completed_at < p_to
    and not public.booking_blocks_payout_eligibility(e.booking_id);

  v_debt := public.supplier_outstanding_recovery_minor(p_supplier_id, v_cur);

  return jsonb_build_object(
    'ok', true,
    'concept', 'period_earnings',
    'currency', v_cur,
    'from', p_from,
    'to', p_to,
    'earning_count', v_count,
    'supplier_net_minor', v_amt,
    'outstanding_recovery_minor', v_debt,
    'net_after_debt_minor', greatest(v_amt - v_debt, 0),
    'note', 'Completed services only; holds/disputes/cancelled excluded; debt reduces net payable'
  );
end;
$$;

revoke all on function public.supplier_period_earnings(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.supplier_period_earnings(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.supplier_period_earnings(uuid, timestamptz, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reconciliation (admin / service)
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_supplier_commercial(
  p_supplier_id uuid default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_n integer := 0;
  r record;
begin
  -- Block browser anon + non-admin authenticated. service_role and elevated SQL OK.
  if coalesce(auth.role(), '') = 'anon'
     or (
       coalesce(auth.role(), '') = 'authenticated'
       and not public.is_traverion_panel_admin()
     ) then
    return jsonb_build_object('ok', false, 'error', 'admin_required');
  end if;

  -- Duplicate active earnings per PI
  for r in
    select payment_intent_id, count(*) as c, array_agg(id) as ids
    from public.supplier_earning_items
    where payment_intent_id is not null
      and status is distinct from 'reversed'
      and (p_supplier_id is null or supplier_id = p_supplier_id)
    group by payment_intent_id
    having count(*) > 1
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'duplicate_pi_earnings',
      'payment_intent_id', r.payment_intent_id,
      'count', r.c,
      'earning_ids', to_jsonb(r.ids)
    ));
    v_n := v_n + 1;
  end loop;

  -- Eligible but blocked by hold/risk
  for r in
    select e.id, e.booking_id, e.supplier_id
    from public.supplier_earning_items e
    where e.status = 'eligible'
      and public.booking_blocks_payout_eligibility(e.booking_id)
      and (p_supplier_id is null or e.supplier_id = p_supplier_id)
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'eligible_but_blocked',
      'earning_id', r.id,
      'booking_id', r.booking_id,
      'supplier_id', r.supplier_id
    ));
    v_n := v_n + 1;
  end loop;

  -- Paid booking missing earning item
  for r in
    select b.id as booking_id, l.supplier_id
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    left join public.supplier_earning_items e on e.booking_id = b.id
    where lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
      and lower(trim(coalesce(b.status, ''))) = 'confirmed'
      and e.id is null
      and b.rescheduled_from_booking_id is null
      and (p_supplier_id is null or l.supplier_id = p_supplier_id)
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'missing_earning',
      'booking_id', r.booking_id,
      'supplier_id', r.supplier_id
    ));
    v_n := v_n + 1;
  end loop;

  -- READY period with held booking still included
  for r in
    select p.id as period_id, pi.booking_id, p.supplier_id
    from public.supplier_payout_periods p
    join public.supplier_payout_period_items pi on pi.period_id = p.id
    where p.status in ('drafting', 'ready', 'processing')
      and public.booking_blocks_payout_eligibility(pi.booking_id)
      and (p_supplier_id is null or p.supplier_id = p_supplier_id)
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'held_in_ready_period',
      'period_id', r.period_id,
      'booking_id', r.booking_id,
      'supplier_id', r.supplier_id
    ));
    v_n := v_n + 1;
  end loop;

  -- Earning amount diverges from commercial snapshot supplier remaining
  for r in
    select e.id, e.booking_id, e.supplier_id, e.amount_minor, s.remaining_supplier_minor
    from public.supplier_earning_items e
    join public.booking_commercial_snapshots s on s.booking_id = e.booking_id
    where e.status is distinct from 'reversed'
      and e.amount_minor is distinct from s.remaining_supplier_minor
      and (p_supplier_id is null or e.supplier_id = p_supplier_id)
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'earning_snapshot_mismatch',
      'earning_id', r.id,
      'booking_id', r.booking_id,
      'supplier_id', r.supplier_id,
      'earning_minor', r.amount_minor,
      'snapshot_supplier_minor', r.remaining_supplier_minor
    ));
    v_n := v_n + 1;
  end loop;

  -- Paid period missing paid_at / paid_via confirmation marker
  for r in
    select p.id as period_id, p.supplier_id, p.status, p.paid_at, p.paid_via
    from public.supplier_payout_periods p
    where p.status = 'paid'
      and (p.paid_at is null or nullif(trim(coalesce(p.paid_via, '')), '') is null)
      and (p_supplier_id is null or p.supplier_id = p_supplier_id)
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'paid_period_missing_confirmation',
      'period_id', r.period_id,
      'supplier_id', r.supplier_id
    ));
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'issue_count', v_n,
    'issues', v_issues,
    'stripe_connect_transfers', false,
    'note', 'Platform-captured payments; payout periods are internal READY/PAID markers only'
  );
end;
$$;

revoke all on function public.reconcile_supplier_commercial(uuid, integer) from public;
revoke all on function public.reconcile_supplier_commercial(uuid, integer) from anon;
grant execute on function public.reconcile_supplier_commercial(uuid, integer) to authenticated;
grant execute on function public.reconcile_supplier_commercial(uuid, integer) to service_role;

-- Backfill PI + sold_at on existing items
update public.supplier_earning_items e
set
  payment_intent_id = coalesce(e.payment_intent_id, nullif(trim(b.payment_intent_id), '')),
  sold_at = coalesce(e.sold_at, b.paid_at, e.created_at),
  service_completed_at = coalesce(e.service_completed_at, public.booking_service_completion_at(b.id)),
  experience_at = coalesce(e.experience_at, public.booking_service_completion_at(b.id))
from public.bookings b
where b.id = e.booking_id
  and e.status is distinct from 'reversed';

-- Deduplicate active PI earnings (keep newest), then unique index
with ranked as (
  select id,
    row_number() over (
      partition by payment_intent_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.supplier_earning_items
  where payment_intent_id is not null
    and status is distinct from 'reversed'
)
update public.supplier_earning_items e
  set status = 'reversed',
      amount_minor = 0,
      updated_at = now()
from ranked r
where e.id = r.id and r.rn > 1;

create unique index if not exists supplier_earning_items_pi_active_uidx
  on public.supplier_earning_items (payment_intent_id)
  where payment_intent_id is not null
    and status is distinct from 'reversed';

-- Auto-sync earnings when a reschedule lineage booking is inserted paid
create or replace function public.bookings_phase5_reschedule_earnings_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.rescheduled_from_booking_id is null then
    return new;
  end if;
  if lower(trim(coalesce(new.payment_status, ''))) not in ('paid', 'complete', 'succeeded') then
    return new;
  end if;
  perform public.phase5_sync_earnings_after_reschedule(new.rescheduled_from_booking_id, new.id);
  return new;
end;
$$;

drop trigger if exists tr_bookings_phase5_reschedule_earnings on public.bookings;
create trigger tr_bookings_phase5_reschedule_earnings
  after insert on public.bookings
  for each row execute function public.bookings_phase5_reschedule_earnings_sync();
