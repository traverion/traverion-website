-- Commercial V1 follow-up: never invent commission on bookings that already
-- have pre-engine booking_earnings (100% / legacy). Snapshot as legacy_zero.

create or replace function public.record_paid_booking_earnings(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_amount numeric;
  v_currency text;
  v_status text;
  v_pay text;
  v_terms_id uuid;
  v_terms public.supplier_commercial_terms;
  v_gross_minor bigint;
  v_comm_minor bigint;
  v_supp_minor bigint;
  v_earn_id uuid;
  v_comm_id uuid;
  v_item_id uuid;
  v_exp timestamptz;
  v_hold_hours integer := 0;
  v_eligible_at timestamptz;
  v_item_status text;
  v_already boolean := false;
  v_existing_earn numeric;
begin
  select
    l.supplier_id,
    b.amount_paid,
    upper(trim(coalesce(nullif(b.currency, ''), 'EUR'))),
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, ''))),
    b.commercial_terms_id
  into v_supplier, v_amount, v_currency, v_status, v_pay, v_terms_id
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') or v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;

  if exists (
    select 1 from public.booking_commercial_snapshots s
    where s.booking_id = p_booking_id and s.settled_at is not null
  ) then
    select id into v_earn_id
    from public.supplier_ledger_entries
    where kind = 'booking_earnings' and source_id = p_booking_id::text;
    return jsonb_build_object('ok', true, 'already', true, 'id', v_earn_id);
  end if;

  -- Pre-engine earnings already posted at gross (0% commission). Preserve honestly.
  select e.amount, e.id into v_existing_earn, v_earn_id
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings' and e.source_id = p_booking_id::text
  limit 1;

  if v_earn_id is not null then
    v_gross_minor := public.commercial_amount_to_minor(coalesce(v_existing_earn, v_amount));
    insert into public.booking_commercial_snapshots (
      booking_id, supplier_id, terms_id, plan_code, commission_bps, payout_cadence,
      currency, gross_minor, commission_minor, supplier_minor, platform_minor,
      remaining_gross_minor, remaining_commission_minor, remaining_supplier_minor, remaining_platform_minor,
      frozen_at_checkout_at, settled_at
    ) values (
      p_booking_id, v_supplier, null, 'legacy_zero', 0, 'monthly',
      v_currency, v_gross_minor, 0, v_gross_minor, 0,
      v_gross_minor, 0, v_gross_minor, 0,
      null, now()
    )
    on conflict (booking_id) do nothing;

    insert into public.supplier_earning_items (
      booking_id, supplier_id, currency, amount_minor, status, experience_at, eligible_at
    )
    select
      p_booking_id, v_supplier, v_currency, v_gross_minor, 'pending',
      public.booking_experience_at(p_booking_id),
      case
        when public.booking_experience_at(p_booking_id) is null then null
        else public.booking_experience_at(p_booking_id)
             + make_interval(hours => coalesce((
                 select value_int from public.commercial_runtime_config where key = 'payout_hold_hours'
               ), 0))
      end
    on conflict (booking_id) do nothing;

    update public.supplier_earning_items e
      set status = case
            when e.eligible_at is not null and e.eligible_at <= now() then 'eligible'
            else e.status
          end,
          updated_at = now()
    where e.booking_id = p_booking_id and e.status = 'pending';

    return jsonb_build_object(
      'ok', true,
      'already', true,
      'legacy', true,
      'id', v_earn_id,
      'gross_minor', v_gross_minor,
      'commission_minor', 0,
      'supplier_minor', v_gross_minor
    );
  end if;

  if v_terms_id is not null then
    select * into v_terms from public.supplier_commercial_terms where id = v_terms_id;
  end if;
  if v_terms.id is null then
    v_terms := public.supplier_active_commercial_terms(v_supplier, now());
  end if;

  v_gross_minor := public.commercial_amount_to_minor(v_amount);

  if v_terms.id is null then
    v_comm_minor := 0;
    v_supp_minor := v_gross_minor;
    insert into public.booking_commercial_snapshots (
      booking_id, supplier_id, terms_id, plan_code, commission_bps, payout_cadence,
      currency, gross_minor, commission_minor, supplier_minor, platform_minor,
      remaining_gross_minor, remaining_commission_minor, remaining_supplier_minor, remaining_platform_minor,
      frozen_at_checkout_at, settled_at
    ) values (
      p_booking_id, v_supplier, null, 'legacy_zero', 0, 'monthly',
      v_currency, v_gross_minor, 0, v_gross_minor, 0,
      v_gross_minor, 0, v_gross_minor, 0,
      null, now()
    )
    on conflict (booking_id) do nothing;
  else
    select commission_minor, supplier_minor
      into v_comm_minor, v_supp_minor
    from public.commercial_split_minor(v_gross_minor, v_terms.commission_bps);

    insert into public.booking_commercial_snapshots (
      booking_id, supplier_id, terms_id, plan_code, commission_bps, payout_cadence,
      currency, gross_minor, commission_minor, supplier_minor, platform_minor,
      remaining_gross_minor, remaining_commission_minor, remaining_supplier_minor, remaining_platform_minor,
      frozen_at_checkout_at, settled_at
    ) values (
      p_booking_id, v_supplier, v_terms.id, v_terms.plan_code, v_terms.commission_bps, v_terms.payout_cadence,
      v_currency, v_gross_minor, v_comm_minor, v_supp_minor, v_comm_minor,
      v_gross_minor, v_comm_minor, v_supp_minor, v_comm_minor,
      case when v_terms_id is not null then now() else null end,
      now()
    )
    on conflict (booking_id) do update set
      settled_at = coalesce(public.booking_commercial_snapshots.settled_at, now()),
      updated_at = now()
    where public.booking_commercial_snapshots.settled_at is null;
  end if;

  select remaining_supplier_minor, remaining_commission_minor, remaining_gross_minor
    into v_supp_minor, v_comm_minor, v_gross_minor
  from public.booking_commercial_snapshots
  where booking_id = p_booking_id;

  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  ) values (
    v_supplier, p_booking_id, 'booking_earnings',
    public.commercial_minor_to_amount(v_supp_minor),
    v_currency,
    'Paid booking supplier entitlement',
    p_booking_id::text,
    'traverion_commercial_v1'
  )
  on conflict (kind, source_id) do nothing
  returning id into v_earn_id;

  if v_earn_id is null then
    v_already := true;
    select id into v_earn_id
    from public.supplier_ledger_entries
    where kind = 'booking_earnings' and source_id = p_booking_id::text;
  end if;

  if v_comm_minor > 0 then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier, p_booking_id, 'platform_commission',
      public.commercial_minor_to_amount(v_comm_minor),
      v_currency,
      'Platform commission',
      p_booking_id::text,
      'traverion_commercial_v1'
    )
    on conflict (kind, source_id) do nothing
    returning id into v_comm_id;
  end if;

  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 0);

  v_exp := public.booking_experience_at(p_booking_id);
  if v_exp is not null then
    v_eligible_at := v_exp + make_interval(hours => v_hold_hours);
  else
    v_eligible_at := null;
  end if;

  if v_eligible_at is not null and v_eligible_at <= now() then
    v_item_status := 'eligible';
  else
    v_item_status := 'pending';
  end if;

  insert into public.supplier_earning_items (
    booking_id, supplier_id, currency, amount_minor, status, experience_at, eligible_at
  ) values (
    p_booking_id, v_supplier, v_currency, v_supp_minor, v_item_status, v_exp, v_eligible_at
  )
  on conflict (booking_id) do nothing
  returning id into v_item_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_earn_id,
    'already', v_already,
    'gross_minor', v_gross_minor,
    'commission_minor', v_comm_minor,
    'supplier_minor', v_supp_minor,
    'earning_item_id', v_item_id,
    'earning_status', v_item_status
  );
end;
$$;

comment on function public.record_paid_booking_earnings(uuid) is
  'Commercial V1: snapshot terms, post supplier entitlement + platform_commission, create earning item. Idempotent. Preserves pre-engine 100% earnings as legacy_zero.';
