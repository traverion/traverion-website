-- Mission 2 Phases 3–4: durable transfer reservation + eligibility preflight.
-- Does NOT move money. Edge Function execute-supplier-transfers performs Stripe TEST transfers
-- only when STRIPE_CONNECT_TRANSFERS_ENABLED=test and sk_test_ is configured.

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
begin
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
    -- Policy: refuse transfers if somehow enabled; launch keeps this false.
    v_reasons := array_append(v_reasons, 'debit_negative_balances_forbidden');
  end if;

  -- Any active booking-level hold among items in this period
  if exists (
    select 1
    from public.supplier_earning_items e
    where e.payout_period_id = p_payout_period_id
      and e.status = 'included'
      and public.booking_blocks_payout_eligibility(e.booking_id)
  ) then
    v_reasons := array_append(v_reasons, 'financial_hold');
  end if;

  v_debt := public.supplier_outstanding_recovery_minor(p_supplier_id, v_period.currency);
  -- Debt is netted into period amount at prepare time; remaining debt is informational.

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

-- Atomically reserve a READY period for transfer (prevents overlapping workers).
create or replace function public.reserve_supplier_transfer_attempt(
  p_batch_id uuid,
  p_payout_period_id uuid,
  p_attempt_number integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.supplier_payout_periods%rowtype;
  v_preflight jsonb;
  v_attempt_id uuid;
  v_idempotency text;
  v_amount bigint;
begin
  -- Lock the period row
  select * into v_period
  from public.supplier_payout_periods
  where id = p_payout_period_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'period_not_found');
  end if;

  v_preflight := public.supplier_connect_transfer_preflight(v_period.supplier_id, p_payout_period_id);
  if not (v_preflight->>'ok')::boolean then
    return jsonb_build_object(
      'ok', false,
      'error', 'preflight_failed',
      'preflight', v_preflight
    );
  end if;

  v_amount := (v_preflight->>'amount_minor')::bigint;
  v_idempotency := 'transfer:' || p_payout_period_id::text || ':' || greatest(p_attempt_number, 1)::text;

  insert into public.supplier_transfer_attempts (
    batch_id,
    payout_period_id,
    supplier_id,
    currency,
    amount_minor,
    debt_applied_minor,
    status,
    idempotency_key,
    stripe_destination_account_id,
    attempt_number,
    reserved_at
  ) values (
    p_batch_id,
    p_payout_period_id,
    v_period.supplier_id,
    upper(trim(coalesce(v_period.currency, 'EUR'))),
    v_amount,
    coalesce((v_preflight->>'outstanding_debt_minor')::bigint, 0),
    'reserved',
    v_idempotency,
    v_preflight->>'stripe_connected_account_id',
    greatest(p_attempt_number, 1),
    now()
  )
  on conflict (idempotency_key) do update
    set updated_at = now()
  returning id into v_attempt_id;

  -- If conflict returned existing non-reserved row, re-select
  if v_attempt_id is null then
    select id into v_attempt_id
    from public.supplier_transfer_attempts
    where idempotency_key = v_idempotency;
  end if;

  update public.supplier_payout_periods
  set
    connect_lifecycle = 'transfer_pending',
    latest_transfer_attempt_id = v_attempt_id
  where id = p_payout_period_id;

  -- Allocate included earning items to this attempt
  insert into public.supplier_transfer_allocations (
    transfer_attempt_id, earning_item_id, booking_id, amount_minor
  )
  select
    v_attempt_id,
    e.id,
    e.booking_id,
    e.amount_minor
  from public.supplier_earning_items e
  where e.payout_period_id = p_payout_period_id
    and e.status = 'included'
  on conflict (transfer_attempt_id, earning_item_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'transfer_attempt_id', v_attempt_id,
    'idempotency_key', v_idempotency,
    'amount_minor', v_amount,
    'currency', upper(trim(coalesce(v_period.currency, 'EUR'))),
    'destination', v_preflight->>'stripe_connected_account_id',
    'preflight', v_preflight
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_active_transfer');
end;
$$;

revoke all on function public.reserve_supplier_transfer_attempt(uuid, uuid, integer) from public;
grant execute on function public.reserve_supplier_transfer_attempt(uuid, uuid, integer) to service_role;

-- List READY Connect periods due for TEST transfer (service role only).
create or replace function public.list_due_connect_transfer_periods(
  p_now timestamptz default now(),
  p_limit integer default 50
)
returns table (
  payout_period_id uuid,
  supplier_id uuid,
  currency text,
  amount_minor bigint,
  scheduled_for date,
  stripe_connected_account_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.supplier_id,
    upper(trim(coalesce(p.currency, 'EUR'))),
    coalesce(p.amount_minor, 0)::bigint,
    p.scheduled_for::date,
    s.stripe_connected_account_id
  from public.supplier_payout_periods p
  join public.supplier_profiles s on s.id = p.supplier_id
  where lower(p.status) = 'ready'
    and coalesce(p.connect_lifecycle, 'internal_only') in ('internal_only', 'failed')
    and s.stripe_connected_account_id is not null
    and coalesce(s.connect_payouts_enabled, false) = true
    and coalesce(s.connect_onboarding_status, '') = 'complete'
    and (p.scheduled_for is null or p.scheduled_for::date <= (p_now at time zone 'utc')::date)
  order by p.scheduled_for nulls first, p.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_due_connect_transfer_periods(timestamptz, integer) from public;
grant execute on function public.list_due_connect_transfer_periods(timestamptz, integer) to service_role;

comment on function public.reserve_supplier_transfer_attempt(uuid, uuid, integer) is
  'Durable reservation for SCAT transfer. Stripe call happens in Edge; never enables live money.';
