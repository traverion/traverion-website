-- P4 Payout Engine Hardening
-- 4.1 Threshold enforcement + no empty READY periods
-- 4.2 Auto-prepare behind payout_auto_prepare_enabled (default 0)
-- 4.3 Connect transfer reversal queue + confirmation (Stripe confirms before recovered)
-- 4.4 Lifecycle: bank payout paid marks earning items; unlink skips transferred periods
-- Never enables payout_execution_enabled or stripe_connect_transfers_enabled.

-- ---------------------------------------------------------------------------
-- Feature flags (both execution flags stay untouched / off)
-- ---------------------------------------------------------------------------
insert into public.commercial_runtime_config (key, value_int, note)
values (
  'payout_auto_prepare_enabled',
  0,
  'P4: 0=disabled (default). 1=allow scheduled prepare_due on cadence days. Never initiates bank transfers.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Period threshold snapshot (threshold changes do not rewrite prepared periods)
-- ---------------------------------------------------------------------------
alter table public.supplier_payout_periods
  add column if not exists threshold_snapshot_minor bigint not null default 0;

alter table public.supplier_payout_periods
  add column if not exists threshold_enforced boolean not null default false;

comment on column public.supplier_payout_periods.threshold_snapshot_minor is
  'P4: supplier payout_threshold_min converted to minor units at prepare time; frozen for this period.';

-- ---------------------------------------------------------------------------
-- Prepare run audit trail (admin-visible)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payout_prepare_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null default 'manual',
  trigger_note text,
  p_now timestamptz not null default now(),
  utc_day integer not null,
  auto_prepare_enabled boolean not null default false,
  ok boolean not null default true,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists supplier_payout_prepare_runs_created_idx
  on public.supplier_payout_prepare_runs (created_at desc);

alter table public.supplier_payout_prepare_runs enable row level security;
revoke all on table public.supplier_payout_prepare_runs from anon, authenticated;
grant select on table public.supplier_payout_prepare_runs to authenticated;
grant all on table public.supplier_payout_prepare_runs to service_role;

drop policy if exists supplier_payout_prepare_runs_admin_select on public.supplier_payout_prepare_runs;
create policy supplier_payout_prepare_runs_admin_select
  on public.supplier_payout_prepare_runs for select
  to authenticated
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Transfer reversal attempts (idempotent; recovered only after Stripe confirm)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_transfer_reversal_attempts (
  id uuid primary key default gen_random_uuid(),
  transfer_attempt_id uuid not null references public.supplier_transfer_attempts (id) on delete restrict,
  payout_period_id uuid references public.supplier_payout_periods (id) on delete set null,
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  earning_item_id uuid references public.supplier_earning_items (id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'queued'
    check (status in ('queued', 'pending', 'succeeded', 'failed', 'unavailable')),
  idempotency_key text not null,
  stripe_reversal_id text,
  error_code text,
  error_message text,
  reason text,
  recovered_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (stripe_reversal_id)
);

create index if not exists supplier_transfer_reversal_attempts_status_idx
  on public.supplier_transfer_reversal_attempts (status, created_at)
  where status in ('queued', 'pending');

create index if not exists supplier_transfer_reversal_attempts_transfer_idx
  on public.supplier_transfer_reversal_attempts (transfer_attempt_id);

alter table public.supplier_transfer_reversal_attempts enable row level security;
revoke all on table public.supplier_transfer_reversal_attempts from anon, authenticated;
grant select on table public.supplier_transfer_reversal_attempts to authenticated;
grant all on table public.supplier_transfer_reversal_attempts to service_role;

drop policy if exists supplier_transfer_reversal_attempts_select on public.supplier_transfer_reversal_attempts;
create policy supplier_transfer_reversal_attempts_select
  on public.supplier_transfer_reversal_attempts for select
  to authenticated
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.supplier_payout_threshold_minor(p_supplier_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select public.commercial_amount_to_minor(coalesce(sp.payout_threshold_min, 0))
  from public.supplier_profiles sp
  where sp.id = p_supplier_id;
$$;

revoke all on function public.supplier_payout_threshold_minor(uuid) from public;
revoke all on function public.supplier_payout_threshold_minor(uuid) from anon, authenticated;
grant execute on function public.supplier_payout_threshold_minor(uuid) to service_role;

create or replace function public.payout_period_has_connect_transfer(p_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.supplier_payout_periods p
    where p.id = p_period_id
      and (
        coalesce(p.connect_lifecycle, 'internal_only') in (
          'transfer_pending',
          'transfer_completed',
          'bank_payout_pending',
          'bank_payout_paid',
          'bank_payout_failed',
          'reversed'
        )
        or exists (
          select 1 from public.supplier_transfer_attempts a
          where a.payout_period_id = p.id
            and a.status in ('transfer_pending', 'transfer_completed', 'reversed')
            and a.stripe_transfer_id is not null
        )
      )
  );
$$;

revoke all on function public.payout_period_has_connect_transfer(uuid) from public;
revoke all on function public.payout_period_has_connect_transfer(uuid) from anon, authenticated;
grant execute on function public.payout_period_has_connect_transfer(uuid) to service_role;

-- Unlink must not strip items from periods that already moved money via Connect.
create or replace function public.commercial_unlink_earning_from_unpaid_periods(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periods integer := 0;
begin
  with target as (
    select e.id as earning_item_id
    from public.supplier_earning_items e
    where e.booking_id = p_booking_id
  ),
  dropped as (
    delete from public.supplier_payout_period_items pi
    using target t, public.supplier_payout_periods p
    where pi.earning_item_id = t.earning_item_id
      and pi.period_id = p.id
      and p.status in ('drafting', 'ready', 'processing', 'cancelled')
      and not public.payout_period_has_connect_transfer(p.id)
    returning pi.period_id
  ),
  touched as (
    update public.supplier_payout_periods p
      set amount_minor = coalesce((
            select sum(i.amount_minor) from public.supplier_payout_period_items i where i.period_id = p.id
          ), 0),
          item_count = coalesce((
            select count(*)::integer from public.supplier_payout_period_items i where i.period_id = p.id
          ), 0),
          status = case
            when coalesce((select count(*) from public.supplier_payout_period_items i where i.period_id = p.id), 0) = 0
              and p.status <> 'paid'
              and not public.payout_period_has_connect_transfer(p.id)
              then 'cancelled'
            else p.status
          end,
          updated_at = now()
    where p.id in (select distinct period_id from dropped)
      and p.status <> 'paid'
    returning p.id
  )
  select count(*)::integer into v_periods from touched;

  update public.supplier_earning_items e
    set payout_period_id = null,
        updated_at = now()
  where e.booking_id = p_booking_id
    and e.status in ('included', 'eligible', 'pending')
    and e.payout_period_id is not null
    and exists (
      select 1 from public.supplier_payout_periods p
      where p.id = e.payout_period_id
        and p.status <> 'paid'
        and not public.payout_period_has_connect_transfer(p.id)
    );

  return jsonb_build_object('ok', true, 'periods_touched', coalesce(v_periods, 0));
end;
$$;

revoke all on function public.commercial_unlink_earning_from_unpaid_periods(uuid) from public;
revoke all on function public.commercial_unlink_earning_from_unpaid_periods(uuid) from anon, authenticated;
grant execute on function public.commercial_unlink_earning_from_unpaid_periods(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Queue Connect transfer reversal (does not call Stripe; Edge executes TEST only)
-- ---------------------------------------------------------------------------
create or replace function public.queue_connect_transfer_reversal_for_booking(
  p_booking_id uuid,
  p_amount_minor bigint default null,
  p_reason text default 'Post-transfer refund recovery'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.supplier_earning_items;
  v_attempt public.supplier_transfer_attempts;
  v_requested bigint;
  v_already bigint;
  v_cap bigint;
  v_amount bigint;
  v_id uuid;
  v_key text;
begin
  select * into v_item
  from public.supplier_earning_items
  where booking_id = p_booking_id;

  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error', 'earning_item_not_found');
  end if;

  select a.* into v_attempt
  from public.supplier_transfer_attempts a
  where a.payout_period_id = v_item.payout_period_id
    and a.status in ('transfer_completed', 'reversed')
    and a.stripe_transfer_id is not null
  order by a.transferred_at desc nulls last, a.created_at desc
  limit 1;

  if v_attempt.id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_completed_transfer');
  end if;

  v_requested := coalesce(
    nullif(p_amount_minor, 0),
    nullif(v_item.amount_minor, 0),
    (
      select pi.amount_minor
      from public.supplier_payout_period_items pi
      where pi.earning_item_id = v_item.id
      limit 1
    ),
    0
  );

  if v_requested <= 0 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'zero_amount');
  end if;

  select coalesce(sum(r.amount_minor), 0) into v_already
  from public.supplier_transfer_reversal_attempts r
  where r.transfer_attempt_id = v_attempt.id
    and r.status in ('queued', 'pending', 'succeeded');

  v_cap := greatest(v_attempt.amount_minor - v_already, 0);
  v_amount := least(v_requested, v_cap);

  if v_amount <= 0 then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'reversal_cap_exhausted',
      'transfer_attempt_id', v_attempt.id,
      'already_queued_or_done_minor', v_already
    );
  end if;

  v_key := 'booking:' || p_booking_id::text
        || ':attempt:' || v_attempt.id::text
        || ':amt:' || v_amount::text;

  insert into public.supplier_transfer_reversal_attempts (
    transfer_attempt_id, payout_period_id, supplier_id, booking_id, earning_item_id,
    amount_minor, status, idempotency_key, reason
  ) values (
    v_attempt.id, v_attempt.payout_period_id, v_attempt.supplier_id, p_booking_id, v_item.id,
    v_amount, 'queued', v_key, coalesce(nullif(btrim(p_reason), ''), 'Post-transfer refund recovery')
  )
  on conflict (idempotency_key) do update
    set updated_at = now()
  returning id into v_id;

  insert into public.financial_audit_log (
    action, booking_id, supplier_id, amount_minor, currency, reason, provider_ref, after_state
  ) values (
    'queue_connect_transfer_reversal',
    p_booking_id,
    v_attempt.supplier_id,
    v_amount,
    v_attempt.currency,
    'Queued Stripe Connect transfer reversal (not recovered until Stripe confirms)',
    v_attempt.stripe_transfer_id,
    jsonb_build_object(
      'reversal_attempt_id', v_id,
      'transfer_attempt_id', v_attempt.id,
      'idempotency_key', v_key
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reversal_attempt_id', v_id,
    'transfer_attempt_id', v_attempt.id,
    'amount_minor', v_amount,
    'idempotency_key', v_key,
    'recovered', false
  );
end;
$$;

revoke all on function public.queue_connect_transfer_reversal_for_booking(uuid, bigint, text) from public;
revoke all on function public.queue_connect_transfer_reversal_for_booking(uuid, bigint, text) from anon, authenticated;
grant execute on function public.queue_connect_transfer_reversal_for_booking(uuid, bigint, text) to service_role;

create or replace function public.list_queued_connect_transfer_reversals(p_limit integer default 25)
returns table (
  id uuid,
  transfer_attempt_id uuid,
  payout_period_id uuid,
  supplier_id uuid,
  booking_id uuid,
  amount_minor bigint,
  idempotency_key text,
  stripe_transfer_id text,
  stripe_destination_account_id text,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    r.id,
    r.transfer_attempt_id,
    r.payout_period_id,
    r.supplier_id,
    r.booking_id,
    r.amount_minor,
    r.idempotency_key,
    a.stripe_transfer_id,
    a.stripe_destination_account_id,
    a.currency
  from public.supplier_transfer_reversal_attempts r
  join public.supplier_transfer_attempts a on a.id = r.transfer_attempt_id
  where r.status = 'queued'
    and a.stripe_transfer_id is not null
  order by r.created_at asc
  limit greatest(least(coalesce(p_limit, 25), 100), 1);
end;
$$;

revoke all on function public.list_queued_connect_transfer_reversals(integer) from public;
revoke all on function public.list_queued_connect_transfer_reversals(integer) from anon, authenticated;
grant execute on function public.list_queued_connect_transfer_reversals(integer) to service_role;

-- Confirm recovery only after Stripe reversal id is known (webhook or Edge sync).
create or replace function public.confirm_connect_transfer_reversal(
  p_reversal_attempt_id uuid,
  p_stripe_reversal_id text,
  p_amount_minor bigint default null,
  p_outcome text default 'succeeded'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supplier_transfer_reversal_attempts;
  v_attempt public.supplier_transfer_attempts;
  v_outcome text := lower(coalesce(nullif(btrim(p_outcome), ''), 'succeeded'));
  v_stripe text := nullif(btrim(coalesce(p_stripe_reversal_id, '')), '');
  v_amount bigint;
begin
  select * into v_row
  from public.supplier_transfer_reversal_attempts
  where id = p_reversal_attempt_id
  for update;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'reversal_attempt_not_found');
  end if;

  if v_row.status = 'succeeded' and v_row.recovered_confirmed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'recovered', true);
  end if;

  select * into v_attempt from public.supplier_transfer_attempts where id = v_row.transfer_attempt_id;

  if v_outcome in ('failed', 'unavailable') then
    update public.supplier_transfer_reversal_attempts
      set status = v_outcome,
          error_code = v_outcome,
          error_message = coalesce(error_message, 'Stripe reversal ' || v_outcome),
          updated_at = now()
    where id = v_row.id;

    insert into public.supplier_payout_exceptions (
      supplier_id, payout_period_id, transfer_attempt_id, reason_code, detail, status
    ) values (
      v_row.supplier_id,
      v_row.payout_period_id,
      v_row.transfer_attempt_id,
      'transfer_reversal_' || v_outcome,
      'Reversal attempt ' || v_row.id::text || ' outcome=' || v_outcome,
      'open'
    );

    return jsonb_build_object('ok', true, 'recovered', false, 'status', v_outcome);
  end if;

  if v_stripe is null then
    return jsonb_build_object('ok', false, 'error', 'stripe_reversal_id_required');
  end if;

  v_amount := coalesce(nullif(p_amount_minor, 0), v_row.amount_minor);

  update public.supplier_transfer_reversal_attempts
    set status = 'succeeded',
        stripe_reversal_id = v_stripe,
        amount_minor = v_amount,
        recovered_confirmed_at = now(),
        updated_at = now()
  where id = v_row.id;

  -- Settle recovery debt only after Stripe confirms (positive supplier_recovery entry).
  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  ) values (
    v_row.supplier_id,
    v_row.booking_id,
    'supplier_recovery',
    public.commercial_minor_to_amount(v_amount),
    coalesce(v_attempt.currency, 'EUR'),
    'Stripe Connect transfer reversal confirmed — recovery settled',
    'reversal-confirm:' || v_stripe,
    'traverion_p4_reversal_v1'
  )
  on conflict (kind, source_id) do nothing;

  update public.supplier_transfer_attempts
    set status = 'reversed',
        error_code = coalesce(error_code, 'transfer_reversed'),
        error_message = coalesce(error_message, 'Stripe transfer reversal confirmed'),
        updated_at = now()
  where id = v_row.transfer_attempt_id
    and status in ('transfer_completed', 'reversed');

  update public.supplier_payout_periods
    set connect_lifecycle = 'reversed',
        updated_at = now()
  where id = v_row.payout_period_id;

  insert into public.financial_audit_log (
    action, booking_id, supplier_id, amount_minor, currency, reason, provider_ref, after_state
  ) values (
    'confirm_connect_transfer_reversal',
    v_row.booking_id,
    v_row.supplier_id,
    v_amount,
    coalesce(v_attempt.currency, 'EUR'),
    'Stripe confirmed transfer reversal; recovery marked settled',
    v_stripe,
    jsonb_build_object(
      'reversal_attempt_id', v_row.id,
      'transfer_attempt_id', v_row.transfer_attempt_id,
      'recovered_confirmed_at', now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'recovered', true,
    'reversal_attempt_id', v_row.id,
    'stripe_reversal_id', v_stripe,
    'amount_minor', v_amount
  );
end;
$$;

revoke all on function public.confirm_connect_transfer_reversal(uuid, text, bigint, text) from public;
revoke all on function public.confirm_connect_transfer_reversal(uuid, text, bigint, text) from anon, authenticated;
grant execute on function public.confirm_connect_transfer_reversal(uuid, text, bigint, text) to service_role;

-- Mark period + included items paid when bank payout is confirmed (Connect path).
create or replace function public.mark_payout_period_bank_paid(
  p_period_id uuid,
  p_payment_reference text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.supplier_payout_periods;
  v_ref text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_earn_id uuid;
begin
  if v_ref is null then
    return jsonb_build_object('ok', false, 'error', 'payment_reference_required');
  end if;

  select * into v_period from public.supplier_payout_periods where id = p_period_id for update;
  if v_period.id is null then
    return jsonb_build_object('ok', false, 'error', 'period_not_found');
  end if;

  if v_period.status = 'paid' and v_period.paid_at is not null then
    update public.supplier_earning_items
      set status = 'paid', updated_at = now()
    where payout_period_id = p_period_id and status = 'included';
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if not exists (
    select 1 from public.supplier_earnings se
    where se.supplier_id = v_period.supplier_id
      and se.period_start is not distinct from v_period.period_start
      and se.period_end is not distinct from v_period.period_end
      and se.currency = v_period.currency
      and se.status = 'paid'
      and se.note like 'Connect bank payout%'
  ) then
    insert into public.supplier_earnings (
      supplier_id, period_start, period_end, amount, currency, status, note, recorded_by
    ) values (
      v_period.supplier_id,
      v_period.period_start,
      v_period.period_end,
      public.commercial_minor_to_amount(v_period.amount_minor),
      v_period.currency,
      'paid',
      'Connect bank payout ' || left(v_ref, 120),
      null
    )
    returning id into v_earn_id;
  end if;

  update public.supplier_earning_items
    set status = 'paid', updated_at = now()
  where payout_period_id = p_period_id and status = 'included';

  update public.supplier_payout_periods
    set status = 'paid',
        paid_at = coalesce(p_paid_at, now()),
        paid_via = 'stripe_connect_payout',
        connect_lifecycle = 'bank_payout_paid',
        note = coalesce(note, v_ref),
        updated_at = now()
  where id = p_period_id;

  return jsonb_build_object('ok', true, 'period_id', p_period_id, 'supplier_earnings_id', v_earn_id);
end;
$$;

revoke all on function public.mark_payout_period_bank_paid(uuid, text, timestamptz) from public;
revoke all on function public.mark_payout_period_bank_paid(uuid, text, timestamptz) from anon, authenticated;
grant execute on function public.mark_payout_period_bank_paid(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- prepare_due_supplier_payouts — threshold + no empty READY + audit fields
-- ---------------------------------------------------------------------------
create or replace function public.prepare_due_supplier_payouts(p_now timestamp with time zone default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_day integer := extract(day from (v_now at time zone 'UTC'))::integer;
  v_date date := (v_now at time zone 'UTC')::date;
  r record;
  v_terms public.supplier_commercial_terms;
  v_period_id uuid;
  v_existing public.supplier_payout_periods;
  v_amount bigint;
  v_count integer;
  v_created integer := 0;
  v_items integer := 0;
  v_skipped_gate integer := 0;
  v_skipped_threshold integer := 0;
  v_skipped_empty integer := 0;
  v_cancelled_empty integer := 0;
  v_period_key text;
  v_period_start date;
  v_debt bigint;
  v_net bigint;
  v_applied_debt bigint;
  v_threshold_minor bigint;
  v_candidate_gross bigint;
  v_candidate_count integer;
  v_period_was_new boolean;
begin
  perform pg_advisory_xact_lock(hashtext('prepare_due_supplier_payouts'));

  perform public.refresh_supplier_earning_eligibility(v_now);

  -- Cancel legacy empty READY periods that never moved money.
  update public.supplier_payout_periods p
    set status = 'cancelled',
        note = coalesce(note || E'\n', '') || 'P4: cancelled empty READY period',
        updated_at = now()
  where p.status = 'ready'
    and coalesce(p.item_count, 0) = 0
    and coalesce(p.amount_minor, 0) = 0
    and coalesce(p.connect_lifecycle, 'internal_only') = 'internal_only'
    and not public.payout_period_has_connect_transfer(p.id);
  get diagnostics v_cancelled_empty = row_count;

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

    v_threshold_minor := coalesce(public.supplier_payout_threshold_minor(r.supplier_id), 0);

    select coalesce(sum(e.amount_minor), 0), count(*)::integer
      into v_candidate_gross, v_candidate_count
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
      and not public.booking_requires_earning_reversal(e.booking_id);

    select * into v_existing
    from public.supplier_payout_periods
    where supplier_id = r.supplier_id
      and currency = r.currency
      and period_key = v_period_key;

    -- No candidates: never create / keep empty READY.
    if coalesce(v_candidate_count, 0) = 0 then
      if v_existing.id is not null
         and v_existing.status = 'ready'
         and coalesce(v_existing.item_count, 0) = 0
         and not public.payout_period_has_connect_transfer(v_existing.id) then
        update public.supplier_payout_periods
          set status = 'cancelled',
              note = coalesce(note || E'\n', '') || 'P4: cancelled empty READY (no candidates)',
              updated_at = now()
        where id = v_existing.id;
        v_cancelled_empty := v_cancelled_empty + 1;
      end if;
      v_skipped_empty := v_skipped_empty + 1;
      continue;
    end if;

    v_debt := public.supplier_outstanding_recovery_minor(r.supplier_id, r.currency);
    v_net := greatest(v_candidate_gross - least(v_debt, v_candidate_gross), 0);

    -- Threshold gates NEW preparation only; already-prepared periods keep their snapshot.
    if (v_existing.id is null or coalesce(v_existing.item_count, 0) = 0)
       and v_threshold_minor > 0
       and v_net < v_threshold_minor then
      v_skipped_threshold := v_skipped_threshold + 1;
      continue;
    end if;

    v_period_was_new := (v_existing.id is null);

    insert into public.supplier_payout_periods (
      supplier_id, currency, cadence, period_key, period_start, period_end,
      scheduled_for, status, amount_minor, item_count,
      threshold_snapshot_minor, threshold_enforced
    ) values (
      r.supplier_id, r.currency, v_terms.payout_cadence, v_period_key,
      v_period_start, v_date, v_date, 'ready', 0, 0,
      case when v_period_was_new then v_threshold_minor else 0 end,
      case when v_period_was_new then (v_threshold_minor > 0) else false end
    )
    on conflict (supplier_id, currency, period_key) do update
      set updated_at = now(),
          status = case
            when public.supplier_payout_periods.status = 'cancelled'
              and coalesce(public.supplier_payout_periods.item_count, 0) = 0
              and not public.payout_period_has_connect_transfer(public.supplier_payout_periods.id)
            then 'ready'
            else public.supplier_payout_periods.status
          end,
          -- Never rewrite threshold snapshot on existing prepared periods.
          threshold_snapshot_minor = public.supplier_payout_periods.threshold_snapshot_minor,
          threshold_enforced = public.supplier_payout_periods.threshold_enforced
    returning id into v_period_id;

    -- If conflict-updated an existing row that already had a snapshot, keep it;
    -- if this was effectively a fresh ready period with zero snapshot, set once.
    update public.supplier_payout_periods
      set threshold_snapshot_minor = v_threshold_minor,
          threshold_enforced = (v_threshold_minor > 0)
    where id = v_period_id
      and coalesce(item_count, 0) = 0
      and coalesce(threshold_snapshot_minor, 0) = 0
      and status = 'ready';

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

    -- Safety: if somehow empty after move, cancel period.
    if coalesce(v_count, 0) = 0 then
      update public.supplier_payout_periods
        set status = 'cancelled',
            amount_minor = 0,
            item_count = 0,
            note = coalesce(note || E'\n', '') || 'P4: cancelled empty READY after allocate',
            updated_at = now()
      where id = v_period_id
        and status = 'ready'
        and not public.payout_period_has_connect_transfer(v_period_id);
      v_skipped_empty := v_skipped_empty + 1;
      continue;
    end if;

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

    v_items := v_items + v_count;
    v_created := v_created + 1;

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
    'skipped_below_threshold', v_skipped_threshold,
    'skipped_empty', v_skipped_empty,
    'cancelled_empty_ready', v_cancelled_empty,
    'stripe_transfer', false,
    'requires_ledger_reconcile_ok', true,
    'requires_tour_fulfillment_attestation', true,
    'payout_execution_enabled', false,
    'note', 'READY periods only — threshold enforced; no empty READY; no Stripe transfer'
  );
end;
$function$;

revoke all on function public.prepare_due_supplier_payouts(timestamptz) from public;
revoke all on function public.prepare_due_supplier_payouts(timestamptz) from anon, authenticated;
grant execute on function public.prepare_due_supplier_payouts(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduled prepare wrapper (flag-gated; logs every attempt)
-- ---------------------------------------------------------------------------
create or replace function public.run_scheduled_supplier_payout_prepare(
  p_now timestamptz default now(),
  p_triggered_by text default 'scheduler',
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_day integer := extract(day from (v_now at time zone 'UTC'))::integer;
  v_enabled boolean := false;
  v_result jsonb;
  v_run_id uuid;
  v_trigger text := coalesce(nullif(btrim(p_triggered_by), ''), 'scheduler');
begin
  select coalesce(value_int, 0) = 1 into v_enabled
  from public.commercial_runtime_config
  where key = 'payout_auto_prepare_enabled';

  if not coalesce(v_enabled, false) and not coalesce(p_force, false) then
    insert into public.supplier_payout_prepare_runs (
      triggered_by, trigger_note, p_now, utc_day, auto_prepare_enabled, ok, result
    ) values (
      v_trigger,
      'skipped: payout_auto_prepare_enabled=0',
      v_now,
      v_day,
      false,
      true,
      jsonb_build_object('ok', true, 'skipped', true, 'reason', 'auto_prepare_disabled')
    )
    returning id into v_run_id;

    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'auto_prepare_disabled',
      'prepare_run_id', v_run_id,
      'stripe_transfer', false
    );
  end if;

  -- Cadence days only for scheduler (manual force still allowed any day via prepare_due directly).
  if v_trigger like 'scheduler%' and v_day not in (1, 15) and not coalesce(p_force, false) then
    insert into public.supplier_payout_prepare_runs (
      triggered_by, trigger_note, p_now, utc_day, auto_prepare_enabled, ok, result
    ) values (
      v_trigger,
      'skipped: not cadence day (1 or 15 UTC)',
      v_now,
      v_day,
      true,
      true,
      jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_cadence_day', 'utc_day', v_day)
    )
    returning id into v_run_id;

    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'not_cadence_day',
      'utc_day', v_day,
      'prepare_run_id', v_run_id,
      'stripe_transfer', false
    );
  end if;

  begin
    v_result := public.prepare_due_supplier_payouts(v_now);
  exception when others then
    insert into public.supplier_payout_prepare_runs (
      triggered_by, trigger_note, p_now, utc_day, auto_prepare_enabled, ok, result, error_message
    ) values (
      v_trigger, 'prepare failed', v_now, v_day, coalesce(v_enabled, false), false,
      jsonb_build_object('ok', false), SQLERRM
    )
    returning id into v_run_id;

    insert into public.financial_audit_log (
      action, reason, after_state
    ) values (
      'prepare_due_supplier_payouts',
      'Scheduled prepare failed',
      jsonb_build_object('prepare_run_id', v_run_id, 'error', SQLERRM, 'triggered_by', v_trigger)
    );

    return jsonb_build_object(
      'ok', false,
      'error', SQLERRM,
      'prepare_run_id', v_run_id,
      'stripe_transfer', false
    );
  end;

  insert into public.supplier_payout_prepare_runs (
    triggered_by, trigger_note, p_now, utc_day, auto_prepare_enabled, ok, result
  ) values (
    v_trigger,
    'prepare completed (no bank transfer)',
    v_now,
    v_day,
    coalesce(v_enabled, false) or coalesce(p_force, false),
    true,
    coalesce(v_result, '{}'::jsonb)
  )
  returning id into v_run_id;

  insert into public.financial_audit_log (
    action, reason, after_state
  ) values (
    'prepare_due_supplier_payouts',
    'Payout preparation run (READY only — no bank transfer)',
    jsonb_build_object(
      'prepare_run_id', v_run_id,
      'triggered_by', v_trigger,
      'result', v_result
    )
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'prepare_run_id', v_run_id,
    'triggered_by', v_trigger,
    'stripe_transfer', false
  );
end;
$$;

revoke all on function public.run_scheduled_supplier_payout_prepare(timestamptz, text, boolean) from public;
revoke all on function public.run_scheduled_supplier_payout_prepare(timestamptz, text, boolean) from anon, authenticated;
grant execute on function public.run_scheduled_supplier_payout_prepare(timestamptz, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- reverse_paid_booking_earnings — queue Connect reversal when transfer exists
-- ---------------------------------------------------------------------------
create or replace function public.reverse_paid_booking_earnings(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund_id uuid;
  v_comm_rev_id uuid;
  v_item_status text;
  v_amount_minor bigint;
  v_period_id uuid;
  v_recovery jsonb;
  v_reversal jsonb;
  v_transferred boolean := false;
begin
  select status, amount_minor, payout_period_id
    into v_item_status, v_amount_minor, v_period_id
  from public.supplier_earning_items
  where booking_id = p_booking_id;

  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  )
  select
    e.supplier_id, e.booking_id, 'refund', - abs(e.amount), e.currency,
    'Earnings reversal', e.booking_id::text, 'traverion_commercial_v1'
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings' and e.booking_id = p_booking_id
  on conflict (kind, source_id) do nothing
  returning id into v_refund_id;

  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  )
  select
    e.supplier_id, e.booking_id, 'adjustment', - abs(e.amount), e.currency,
    'Platform commission reversal',
    e.booking_id::text || ':commission_rev',
    'traverion_commercial_v1'
  from public.supplier_ledger_entries e
  where e.kind = 'platform_commission' and e.booking_id = p_booking_id
  on conflict (kind, source_id) do nothing
  returning id into v_comm_rev_id;

  v_transferred := coalesce(public.payout_period_has_connect_transfer(v_period_id), false);

  if (v_item_status = 'paid' or v_transferred) and coalesce(v_amount_minor, 0) > 0 then
    v_recovery := public.commercial_record_post_payout_recovery(
      p_booking_id,
      v_amount_minor,
      case
        when v_transferred then 'Refund after Connect transfer — recovery debt + reversal queue'
        else 'Full refund after supplier payout recorded'
      end
    );
    if v_transferred then
      v_reversal := public.queue_connect_transfer_reversal_for_booking(
        p_booking_id,
        v_amount_minor,
        'Refund after Connect transfer'
      );
    end if;
    update public.supplier_earning_items
      set status = 'reversed',
          amount_minor = 0,
          updated_at = now()
    where booking_id = p_booking_id and status <> 'reversed';
  else
    perform public.commercial_unlink_earning_from_unpaid_periods(p_booking_id);
    update public.supplier_earning_items
      set status = 'reversed',
          amount_minor = 0,
          payout_period_id = null,
          updated_at = now()
    where booking_id = p_booking_id and status <> 'reversed';
  end if;

  update public.booking_commercial_snapshots
    set remaining_gross_minor = 0,
        remaining_commission_minor = 0,
        remaining_supplier_minor = 0,
        remaining_platform_minor = 0,
        updated_at = now()
  where booking_id = p_booking_id;

  return jsonb_build_object(
    'ok', true,
    'refund_id', v_refund_id,
    'commission_reversal_id', v_comm_rev_id,
    'recovery', v_recovery,
    'reversal_queue', v_reversal,
    'was_paid', v_item_status = 'paid',
    'was_transferred', v_transferred
  );
end;
$$;

comment on function public.reverse_paid_booking_earnings(uuid) is
  'Full reverse; unlink unpaid READY; if paid or Connect-transferred, record recovery and queue transfer reversal.';
