-- Phase 6 of 6: Supplier Income reporting — access control on period RPCs,
-- require payment confirmation when marking periods paid, supplier hold visibility,
-- missing tour durations stay pending (no silent premature completion).

-- Missing duration must not invent a short completion clock.
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
    return null; -- Phase 6: unknown duration → no automatic completion
  end if;
  if v_raw ~ '([0-9]+([.][0-9]+)?)\s*min' then
    v_num := substring(v_raw from '([0-9]+([.][0-9]+)?)')::numeric;
    if v_num is not null and v_num > 0 then
      return greatest(0.5, least(v_num / 60.0, 24));
    end if;
  end if;
  if v_raw ~ '([0-9]+([.][0-9]+)?)\s*h' then
    v_num := substring(v_raw from '([0-9]+([.][0-9]+)?)')::numeric;
    if v_num is not null and v_num > 0 then
      return greatest(0.5, least(v_num, 24));
    end if;
  end if;
  -- Unparseable free-text duration: do not guess
  return null;
end;
$$;

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
  if v_hours is null then
    return null; -- pending verification until duration is known
  end if;
  return v_start + make_interval(secs => (v_hours * 3600)::int);
end;
$$;

-- ---------------------------------------------------------------------------
-- Authorize supplier (or panel admin / service) for period report RPCs
-- ---------------------------------------------------------------------------
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

  if coalesce(auth.role(), '') = 'authenticated'
     and not public.is_supplier_account_side(p_supplier_id)
     and not public.is_traverion_panel_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(auth.role(), '') = 'anon' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  with sales as (
    select distinct on (coalesce(nullif(trim(b.payment_intent_id), ''), b.id::text))
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

  if coalesce(auth.role(), '') = 'authenticated'
     and not public.is_supplier_account_side(p_supplier_id)
     and not public.is_traverion_panel_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(auth.role(), '') = 'anon' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
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

create or replace function public.supplier_outstanding_recovery_minor(
  p_supplier_id uuid,
  p_currency text
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_supplier_id is null then
    return 0;
  end if;
  if coalesce(auth.role(), '') = 'authenticated'
     and not public.is_supplier_account_side(p_supplier_id)
     and not public.is_traverion_panel_admin() then
    return 0;
  end if;
  if coalesce(auth.role(), '') = 'anon' then
    return 0;
  end if;

  return (
    select greatest(
      coalesce(-sum(public.commercial_amount_to_minor(l.amount)), 0),
      0
    )::bigint
    from public.supplier_ledger_entries l
    where l.supplier_id = p_supplier_id
      and upper(trim(coalesce(l.currency, 'EUR'))) = upper(trim(coalesce(p_currency, 'EUR')))
      and l.kind = 'supplier_recovery'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark period paid requires a non-empty payment confirmation reference
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
begin
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
      'note', 'Cannot mark paid without a payment confirmation reference (manual bank transfer evidence)'
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

  return jsonb_build_object(
    'ok', true,
    'supplier_earnings_id', v_earn_id,
    'period_id', p_period_id,
    'payment_reference', v_ref
  );
end;
$$;

revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid) from public;
revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid) from anon, authenticated;
revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid, text) from public;
revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid, text) from anon, authenticated;
grant execute on function public.admin_mark_payout_period_paid(uuid, text, uuid, text) to service_role;

-- Keep 3-arg wrapper that fails closed (forces confirmation via 4-arg)
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
