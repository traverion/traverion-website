-- =============================================================================
-- Traverion — Refunds, cancellations & financial recovery engine
-- - payout_hold_hours = 48 (OWNER DECISION)
-- - financial holds + payment disputes (separate from refunds)
-- - READY period honesty on cancel/shrink
-- - post-PAID recovery accounting (never erase historical paid periods)
-- - eligibility blocked when cancelled/refunded/disputed/held
-- - prepare_refund_instruction (no automatic Stripe refund execution)
-- =============================================================================

-- 48h post-activity hold (production-shaped default)
insert into public.commercial_runtime_config (key, value_int, note, updated_at)
values (
  'payout_hold_hours',
  48,
  'OWNER DECISION: 48 hours after experience start before earliest payout eligibility. Tests may override via config update.',
  now()
)
on conflict (key) do update
  set value_int = 48,
      note = excluded.note,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Ledger: supplier_recovery kind (post-payout clawback representation)
-- ---------------------------------------------------------------------------
alter table public.supplier_ledger_entries
  drop constraint if exists supplier_ledger_entries_kind_check;

alter table public.supplier_ledger_entries
  add constraint supplier_ledger_entries_kind_check
  check (kind in (
    'booking_earnings',
    'refund',
    'platform_commission',
    'cancellation_penalty',
    'adjustment',
    'payout',
    'supplier_recovery'
  ));

-- ---------------------------------------------------------------------------
-- Booking financial holds (authorized, audited)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_financial_holds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  reason_code text not null check (reason_code in (
    'refund_investigation',
    'chargeback',
    'fraud_review',
    'verification',
    'manual_review',
    'negative_balance',
    'other'
  )),
  note text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  released_by uuid references auth.users (id) on delete set null,
  released_at timestamptz,
  release_note text,
  constraint booking_financial_holds_note_len check (note is null or char_length(note) <= 2000),
  constraint booking_financial_holds_release_note_len check (release_note is null or char_length(release_note) <= 2000)
);

create index if not exists booking_financial_holds_booking_active_idx
  on public.booking_financial_holds (booking_id)
  where active;

create index if not exists booking_financial_holds_supplier_active_idx
  on public.booking_financial_holds (supplier_id)
  where active;

alter table public.booking_financial_holds enable row level security;
revoke all on table public.booking_financial_holds from anon, authenticated;
grant select on table public.booking_financial_holds to authenticated;

drop policy if exists booking_financial_holds_select on public.booking_financial_holds;
create policy booking_financial_holds_select
  on public.booking_financial_holds for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

-- ---------------------------------------------------------------------------
-- Payment disputes (NOT refunds)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists dispute_status text
    check (
      dispute_status is null
      or dispute_status in ('open', 'needs_response', 'under_review', 'won', 'lost', 'closed', 'warning_closed')
    );

alter table public.bookings
  add column if not exists dispute_id text;

alter table public.bookings
  add column if not exists dispute_amount_minor bigint check (dispute_amount_minor is null or dispute_amount_minor >= 0);

alter table public.bookings
  add column if not exists dispute_currency text;

alter table public.bookings
  add column if not exists dispute_updated_at timestamptz;

create index if not exists bookings_dispute_status_idx
  on public.bookings (dispute_status)
  where dispute_status is not null;

create table if not exists public.booking_dispute_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete set null,
  stripe_event_id text not null unique,
  stripe_dispute_id text,
  event_type text not null,
  status text,
  amount_minor bigint,
  currency text,
  reason text,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.booking_dispute_events enable row level security;
revoke all on table public.booking_dispute_events from anon, authenticated;
grant select on table public.booking_dispute_events to authenticated;
drop policy if exists booking_dispute_events_admin_select on public.booking_dispute_events;
create policy booking_dispute_events_admin_select
  on public.booking_dispute_events for select
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Refund instructions (prepare boundary — no automatic Stripe execution)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_refund_instructions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  idempotency_key text not null unique,
  kind text not null check (kind in ('full', 'partial', 'remaining')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  reason text,
  status text not null default 'ready'
    check (status in ('ready', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stripe_refund_id text,
  provider_error text,
  executed_at timestamptz,
  note text
);

alter table public.booking_refund_instructions enable row level security;
revoke all on table public.booking_refund_instructions from anon, authenticated;
grant select on table public.booking_refund_instructions to authenticated;
drop policy if exists booking_refund_instructions_admin_select on public.booking_refund_instructions;
create policy booking_refund_instructions_admin_select
  on public.booking_refund_instructions for select
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Financial audit log
-- ---------------------------------------------------------------------------
create table if not exists public.financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  booking_id uuid references public.bookings (id) on delete set null,
  supplier_id uuid,
  amount_minor bigint,
  currency text,
  reason text,
  provider_ref text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists financial_audit_log_booking_idx
  on public.financial_audit_log (booking_id, created_at desc);

alter table public.financial_audit_log enable row level security;
revoke all on table public.financial_audit_log from anon, authenticated;
grant select on table public.financial_audit_log to authenticated;
drop policy if exists financial_audit_log_admin_select on public.financial_audit_log;
create policy financial_audit_log_admin_select
  on public.financial_audit_log for select
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Helper: booking blocks payout eligibility?
-- ---------------------------------------------------------------------------
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
  v_hold boolean;
begin
  select
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.dispute_status, '')))
  into v_status, v_pay, v_dispute
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
  if v_dispute in ('open', 'needs_response', 'under_review', 'lost') then
    return true;
  end if;
  select exists (
    select 1 from public.booking_financial_holds h
    where h.booking_id = p_booking_id and h.active
  ) into v_hold;
  return coalesce(v_hold, false);
end;
$$;

revoke all on function public.booking_blocks_payout_eligibility(uuid) from public;
grant execute on function public.booking_blocks_payout_eligibility(uuid) to service_role;
grant execute on function public.booking_blocks_payout_eligibility(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Unlink earning from unpaid payout periods + recompute totals
-- ---------------------------------------------------------------------------
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
              and p.status <> 'paid' then 'cancelled'
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
      where p.id = e.payout_period_id and p.status <> 'paid'
    );

  return jsonb_build_object('ok', true, 'periods_touched', coalesce(v_periods, 0));
end;
$$;

revoke all on function public.commercial_unlink_earning_from_unpaid_periods(uuid) from public;
grant execute on function public.commercial_unlink_earning_from_unpaid_periods(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Post-PAID recovery: never erase paid period; record supplier_recovery debt
-- ---------------------------------------------------------------------------
create or replace function public.commercial_record_post_payout_recovery(
  p_booking_id uuid,
  p_supplier_delta_minor bigint,
  p_reason text default 'Post-payout refund recovery'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_currency text;
  v_id uuid;
  v_delta bigint := coalesce(p_supplier_delta_minor, 0);
  v_source text;
begin
  if v_delta <= 0 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_positive_delta');
  end if;

  select e.supplier_id, e.currency
    into v_supplier, v_currency
  from public.supplier_earning_items e
  where e.booking_id = p_booking_id;

  if v_supplier is null then
    select s.supplier_id, s.currency
      into v_supplier, v_currency
    from public.booking_commercial_snapshots s
    where s.booking_id = p_booking_id;
  end if;

  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'supplier_not_found');
  end if;

  -- Stable idempotency per remaining-delta snapshot moment via source suffix of delta
  v_source := p_booking_id::text || ':recovery:' || v_delta::text;

  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  ) values (
    v_supplier,
    p_booking_id,
    'supplier_recovery',
    - public.commercial_minor_to_amount(v_delta),
    upper(trim(coalesce(v_currency, 'EUR'))),
    coalesce(nullif(btrim(p_reason), ''), 'Post-payout refund recovery'),
    v_source,
    'traverion_financial_recovery_v1'
  )
  on conflict (kind, source_id) do nothing
  returning id into v_id;

  -- Auto financial hold while recovery outstanding for this booking
  if not exists (
    select 1 from public.booking_financial_holds h
    where h.booking_id = p_booking_id and h.active and h.reason_code = 'negative_balance'
  ) then
    insert into public.booking_financial_holds (
      booking_id, supplier_id, reason_code, note, active, created_by
    ) values (
      p_booking_id, v_supplier, 'negative_balance',
      'Auto-hold: post-payout recovery outstanding (OWNER POLICY: who bears chargeback/refund liability TBD)',
      true, null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'recovery_id', v_id,
    'supplier_id', v_supplier,
    'recovery_minor', v_delta,
    'already', v_id is null
  );
end;
$$;

revoke all on function public.commercial_record_post_payout_recovery(uuid, bigint, text) from public;
grant execute on function public.commercial_record_post_payout_recovery(uuid, bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- Replace reverse: unlink READY + recovery if already paid
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
  v_recovery jsonb;
begin
  select status, amount_minor
    into v_item_status, v_amount_minor
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

  -- If already paid out, do NOT erase paid period — record recovery debt
  if v_item_status = 'paid' and coalesce(v_amount_minor, 0) > 0 then
    v_recovery := public.commercial_record_post_payout_recovery(
      p_booking_id,
      v_amount_minor,
      'Full refund after supplier payout recorded'
    );
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
    'was_paid', v_item_status = 'paid'
  );
end;
$$;

comment on function public.reverse_paid_booking_earnings(uuid) is
  'Full reverse + unlink READY periods; if earning already paid, records supplier_recovery without erasing paid period.';

-- ---------------------------------------------------------------------------
-- Shrink: update READY period items; recovery if paid
-- ---------------------------------------------------------------------------
create or replace function public.shrink_paid_booking_earnings(
  p_booking_id uuid,
  p_remaining numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bps integer;
  v_currency text;
  v_remain_minor bigint;
  v_comm_minor bigint;
  v_supp_minor bigint;
  v_before_supp numeric;
  v_before_comm numeric;
  v_item_status text;
  v_before_item_minor bigint;
  v_delta bigint;
  v_recovery jsonb;
  v_period_id uuid;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_required');
  end if;
  if p_remaining is null or not (p_remaining >= 0) or not (p_remaining = p_remaining) then
    return jsonb_build_object('ok', false, 'error', 'remaining_invalid');
  end if;

  v_remain_minor := public.commercial_amount_to_minor(p_remaining);

  select commission_bps, currency
    into v_bps, v_currency
  from public.booking_commercial_snapshots
  where booking_id = p_booking_id;

  if v_bps is null then
    select amount into v_before_supp
    from public.supplier_ledger_entries
    where kind = 'booking_earnings' and booking_id = p_booking_id;
    if v_before_supp is null then
      return jsonb_build_object('ok', true, 'shrunk', false, 'reason', 'no_earnings');
    end if;
    if v_before_supp <= p_remaining then
      return jsonb_build_object('ok', true, 'shrunk', false, 'reason', 'already_at_or_below', 'amount', v_before_supp);
    end if;
    update public.supplier_ledger_entries
      set amount = p_remaining, reason = 'Paid booking (after partial Stripe refund)'
    where kind = 'booking_earnings' and booking_id = p_booking_id;
    return jsonb_build_object('ok', true, 'shrunk', true, 'amount', p_remaining, 'legacy', true);
  end if;

  select commission_minor, supplier_minor
    into v_comm_minor, v_supp_minor
  from public.commercial_split_minor(v_remain_minor, v_bps);

  select amount into v_before_supp
  from public.supplier_ledger_entries
  where kind = 'booking_earnings' and booking_id = p_booking_id;

  select amount into v_before_comm
  from public.supplier_ledger_entries
  where kind = 'platform_commission' and booking_id = p_booking_id;

  select status, amount_minor, payout_period_id
    into v_item_status, v_before_item_minor, v_period_id
  from public.supplier_earning_items
  where booking_id = p_booking_id;

  update public.booking_commercial_snapshots
    set remaining_gross_minor = v_remain_minor,
        remaining_commission_minor = v_comm_minor,
        remaining_supplier_minor = v_supp_minor,
        remaining_platform_minor = v_comm_minor,
        updated_at = now()
  where booking_id = p_booking_id;

  update public.supplier_ledger_entries
    set amount = public.commercial_minor_to_amount(v_supp_minor),
        reason = 'Supplier entitlement after partial refund'
  where kind = 'booking_earnings' and booking_id = p_booking_id;

  if v_comm_minor > 0 then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    )
    select supplier_id, booking_id, 'platform_commission',
           public.commercial_minor_to_amount(v_comm_minor), currency,
           'Platform commission after partial refund',
           booking_id::text, 'traverion_commercial_v1'
    from public.booking_commercial_snapshots
    where booking_id = p_booking_id
    on conflict (kind, source_id) do update
      set amount = excluded.amount,
          reason = excluded.reason;
  elsif v_before_comm is not null then
    update public.supplier_ledger_entries
      set amount = 0, reason = 'Platform commission cleared after partial refund'
    where kind = 'platform_commission' and booking_id = p_booking_id;
  end if;

  v_delta := greatest(coalesce(v_before_item_minor, 0) - coalesce(v_supp_minor, 0), 0);

  if v_item_status = 'paid' and v_delta > 0 then
    v_recovery := public.commercial_record_post_payout_recovery(
      p_booking_id,
      v_delta,
      'Partial refund after supplier payout recorded'
    );
    update public.supplier_earning_items
      set amount_minor = v_supp_minor,
          status = case when v_supp_minor = 0 then 'reversed' else 'paid' end,
          updated_at = now()
    where booking_id = p_booking_id;
  elsif v_item_status = 'included' then
    if v_supp_minor = 0 then
      perform public.commercial_unlink_earning_from_unpaid_periods(p_booking_id);
      update public.supplier_earning_items
        set amount_minor = 0, status = 'reversed', payout_period_id = null, updated_at = now()
      where booking_id = p_booking_id;
    else
      update public.supplier_earning_items
        set amount_minor = v_supp_minor, updated_at = now()
      where booking_id = p_booking_id;
      update public.supplier_payout_period_items pi
        set amount_minor = v_supp_minor
      where pi.earning_item_id = (
        select id from public.supplier_earning_items where booking_id = p_booking_id
      );
      if v_period_id is not null then
        update public.supplier_payout_periods p
          set amount_minor = coalesce((
                select sum(i.amount_minor) from public.supplier_payout_period_items i where i.period_id = p.id
              ), 0),
              item_count = coalesce((
                select count(*)::integer from public.supplier_payout_period_items i where i.period_id = p.id
              ), 0),
              updated_at = now()
        where p.id = v_period_id and p.status in ('drafting', 'ready', 'processing');
      end if;
    end if;
  else
    update public.supplier_earning_items
      set amount_minor = v_supp_minor,
          status = case
            when v_supp_minor = 0 then 'reversed'
            when public.booking_blocks_payout_eligibility(p_booking_id) then 'pending'
            else status
          end,
          updated_at = now()
    where booking_id = p_booking_id
      and status not in ('reversed', 'paid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'shrunk', true,
    'remaining_gross_minor', v_remain_minor,
    'commission_minor', v_comm_minor,
    'supplier_minor', v_supp_minor,
    'before_supplier', v_before_supp,
    'before_commission', v_before_comm,
    'recovery', v_recovery,
    'item_status', v_item_status
  );
end;
$$;

comment on function public.shrink_paid_booking_earnings(uuid, numeric) is
  'Recompute from remaining gross; update READY period items; record supplier_recovery if already paid.';

-- ---------------------------------------------------------------------------
-- Trigger on cancel refund: also unlink READY periods
-- ---------------------------------------------------------------------------
create or replace function public.trg_reverse_platform_commission_on_earnings_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_status text;
  v_amount_minor bigint;
begin
  if new.kind = 'refund' and new.booking_id is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    )
    select
      e.supplier_id, e.booking_id, 'adjustment', - abs(e.amount), e.currency,
      'Platform commission reversal',
      e.booking_id::text || ':commission_rev',
      'traverion_commercial_v1'
    from public.supplier_ledger_entries e
    where e.kind = 'platform_commission' and e.booking_id = new.booking_id
    on conflict (kind, source_id) do nothing;

    select status, amount_minor into v_item_status, v_amount_minor
    from public.supplier_earning_items
    where booking_id = new.booking_id;

    if v_item_status = 'paid' and coalesce(v_amount_minor, 0) > 0 then
      perform public.commercial_record_post_payout_recovery(
        new.booking_id,
        v_amount_minor,
        'Cancel/refund after supplier payout recorded'
      );
      update public.supplier_earning_items
        set status = 'reversed', amount_minor = 0, updated_at = now()
      where booking_id = new.booking_id and status <> 'reversed';
    else
      perform public.commercial_unlink_earning_from_unpaid_periods(new.booking_id);
      update public.supplier_earning_items
        set status = 'reversed', amount_minor = 0, payout_period_id = null, updated_at = now()
      where booking_id = new.booking_id and status <> 'reversed';
    end if;

    update public.booking_commercial_snapshots
      set remaining_gross_minor = 0,
          remaining_commission_minor = 0,
          remaining_supplier_minor = 0,
          remaining_platform_minor = 0,
          updated_at = now()
    where booking_id = new.booking_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Eligibility: 48h hold + never promote blocked bookings
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
begin
  -- Demote / reverse eligibility when booking is blocked
  update public.supplier_earning_items e
    set status = case when e.amount_minor = 0 then 'reversed' else 'pending' end,
        updated_at = now()
  where e.status = 'eligible'
    and public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_demoted = row_count;

  update public.supplier_earning_items e
    set status = 'eligible', updated_at = now()
  where e.status = 'pending'
    and e.eligible_at is not null
    and e.eligible_at <= p_now
    and e.amount_minor > 0
    and not public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'promoted', v_n, 'demoted', coalesce(v_demoted, 0));
end;
$$;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;

-- prepare_due: skip blocked bookings even if somehow eligible
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
  v_reused integer := 0;
  v_items integer := 0;
  v_period_key text;
  v_period_start date;
begin
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

    -- Supplier-level hold: any active negative_balance/fraud hold blocks all payout prep
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

    update public.supplier_payout_periods
      set amount_minor = v_amount,
          item_count = v_count,
          status = case when v_count = 0 then 'cancelled' else 'ready' end,
          updated_at = now()
    where id = v_period_id;

    if v_count = 0 then
      v_reused := v_reused; -- no-op keep counters honest
    elsif v_amount > 0 then
      v_created := v_created + 1;
    end if;
    v_items := v_items + v_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'periods_touched', v_created + v_reused,
    'items_included', v_items,
    'as_of', v_now,
    'timezone', 'UTC',
    'hold_hours', (select value_int from public.commercial_runtime_config where key = 'payout_hold_hours')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: financial hold set/release
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_booking_financial_hold(
  p_booking_id uuid,
  p_reason_code text,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_id uuid;
  v_reason text := lower(btrim(coalesce(p_reason_code, '')));
begin
  if v_reason not in (
    'refund_investigation', 'chargeback', 'fraud_review', 'verification',
    'manual_review', 'negative_balance', 'other'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;

  select l.supplier_id into v_supplier
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;
  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  insert into public.booking_financial_holds (
    booking_id, supplier_id, reason_code, note, active, created_by
  ) values (
    p_booking_id, v_supplier, v_reason,
    nullif(btrim(coalesce(p_note, '')), ''),
    true, p_actor_id
  )
  returning id into v_id;

  insert into public.financial_audit_log (
    actor_id, action, booking_id, supplier_id, reason, after_state
  ) values (
    p_actor_id, 'financial_hold_set', p_booking_id, v_supplier, v_reason,
    jsonb_build_object('hold_id', v_id, 'note', p_note)
  );

  -- Demote eligibility immediately
  update public.supplier_earning_items
    set status = case when status = 'eligible' then 'pending' else status end,
        updated_at = now()
  where booking_id = p_booking_id and status = 'eligible';

  perform public.commercial_unlink_earning_from_unpaid_periods(p_booking_id);

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.admin_set_booking_financial_hold(uuid, text, text, uuid) from public;
revoke all on function public.admin_set_booking_financial_hold(uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.admin_set_booking_financial_hold(uuid, text, text, uuid) to service_role;

create or replace function public.admin_release_booking_financial_hold(
  p_hold_id uuid,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.booking_financial_holds;
begin
  select * into v_hold from public.booking_financial_holds where id = p_hold_id for update;
  if v_hold.id is null then
    return jsonb_build_object('ok', false, 'error', 'hold_not_found');
  end if;
  if not v_hold.active then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.booking_financial_holds
    set active = false,
        released_at = now(),
        released_by = p_actor_id,
        release_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_hold_id;

  insert into public.financial_audit_log (
    actor_id, action, booking_id, supplier_id, reason, after_state
  ) values (
    p_actor_id, 'financial_hold_release', v_hold.booking_id, v_hold.supplier_id, v_hold.reason_code,
    jsonb_build_object('hold_id', p_hold_id, 'release_note', p_note)
  );

  perform public.refresh_supplier_earning_eligibility(now());

  return jsonb_build_object('ok', true, 'id', p_hold_id);
end;
$$;

revoke all on function public.admin_release_booking_financial_hold(uuid, text, uuid) from public;
revoke all on function public.admin_release_booking_financial_hold(uuid, text, uuid) from anon, authenticated;
grant execute on function public.admin_release_booking_financial_hold(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- prepare_refund_instruction — deterministic READY instruction, no Stripe call
-- ---------------------------------------------------------------------------
create or replace function public.prepare_refund_instruction(
  p_booking_id uuid,
  p_kind text,
  p_amount_minor bigint default null,
  p_reason text default null,
  p_actor_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay text;
  v_status text;
  v_currency text;
  v_amount_paid numeric;
  v_gross_minor bigint;
  v_amount_minor bigint;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_key text;
  v_id uuid;
  v_existing public.booking_refund_instructions;
begin
  select
    lower(trim(coalesce(payment_status, ''))),
    lower(trim(coalesce(status, ''))),
    upper(trim(coalesce(nullif(currency, ''), 'EUR'))),
    amount_paid
  into v_pay, v_status, v_currency, v_amount_paid
  from public.bookings
  where id = p_booking_id;

  if v_pay is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;
  if v_kind not in ('full', 'partial', 'remaining') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  v_gross_minor := public.commercial_amount_to_minor(coalesce(v_amount_paid, 0));
  if v_kind in ('full', 'remaining') then
    v_amount_minor := v_gross_minor;
  else
    v_amount_minor := p_amount_minor;
  end if;

  if v_amount_minor is null or v_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'amount_required');
  end if;
  if v_amount_minor > v_gross_minor then
    return jsonb_build_object('ok', false, 'error', 'amount_exceeds_collected');
  end if;

  v_key := coalesce(
    nullif(btrim(coalesce(p_idempotency_key, '')), ''),
    'refund:' || p_booking_id::text || ':' || v_kind || ':' || v_amount_minor::text
  );

  select * into v_existing from public.booking_refund_instructions where idempotency_key = v_key;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'already', true, 'id', v_existing.id, 'status', v_existing.status);
  end if;

  insert into public.booking_refund_instructions (
    booking_id, idempotency_key, kind, amount_minor, currency, reason, status, created_by, note
  ) values (
    p_booking_id, v_key, v_kind, v_amount_minor, v_currency,
    nullif(btrim(coalesce(p_reason, '')), ''),
    'ready', p_actor_id,
    'Prepared only — Stripe refund must be executed separately (TEST Dashboard or future execute worker).'
  )
  returning id into v_id;

  insert into public.financial_audit_log (
    actor_id, action, booking_id, amount_minor, currency, reason, after_state
  ) values (
    p_actor_id, 'prepare_refund_instruction', p_booking_id, v_amount_minor, v_currency, p_reason,
    jsonb_build_object('instruction_id', v_id, 'kind', v_kind, 'idempotency_key', v_key)
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', 'ready',
    'amount_minor', v_amount_minor,
    'currency', v_currency,
    'executes_stripe', false
  );
end;
$$;

revoke all on function public.prepare_refund_instruction(uuid, text, bigint, text, uuid, text) from public;
revoke all on function public.prepare_refund_instruction(uuid, text, bigint, text, uuid, text) from anon, authenticated;
grant execute on function public.prepare_refund_instruction(uuid, text, bigint, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Apply dispute status (service_role / webhook)
-- ---------------------------------------------------------------------------
create or replace function public.apply_booking_dispute_event(
  p_booking_id uuid,
  p_stripe_event_id text,
  p_stripe_dispute_id text,
  p_event_type text,
  p_status text,
  p_amount_minor bigint,
  p_currency text,
  p_reason text,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_mapped text;
  v_supplier uuid;
begin
  if p_stripe_event_id is null or btrim(p_stripe_event_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'event_id_required');
  end if;

  insert into public.booking_dispute_events (
    booking_id, stripe_event_id, stripe_dispute_id, event_type, status,
    amount_minor, currency, reason, payload
  ) values (
    p_booking_id, p_stripe_event_id, p_stripe_dispute_id, p_event_type, p_status,
    p_amount_minor, p_currency, p_reason, p_payload
  )
  on conflict (stripe_event_id) do nothing;

  if p_booking_id is null then
    return jsonb_build_object('ok', true, 'booking', false);
  end if;

  v_mapped := case
    when v_status in ('warning_needs_response', 'needs_response') then 'needs_response'
    when v_status in ('warning_under_review', 'under_review') then 'under_review'
    when v_status in ('warning_closed') then 'warning_closed'
    when v_status in ('won') then 'won'
    when v_status in ('lost') then 'lost'
    when v_status in ('charge_refunded') then 'lost'
    when v_status in ('closed') then 'closed'
    else 'open'
  end;

  update public.bookings
    set dispute_status = v_mapped,
        dispute_id = coalesce(p_stripe_dispute_id, dispute_id),
        dispute_amount_minor = coalesce(p_amount_minor, dispute_amount_minor),
        dispute_currency = coalesce(nullif(upper(trim(p_currency)), ''), dispute_currency),
        dispute_updated_at = now()
  where id = p_booking_id;

  select l.supplier_id into v_supplier
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_mapped in ('open', 'needs_response', 'under_review', 'lost') and v_supplier is not null then
    if not exists (
      select 1 from public.booking_financial_holds h
      where h.booking_id = p_booking_id and h.active and h.reason_code = 'chargeback'
    ) then
      insert into public.booking_financial_holds (
        booking_id, supplier_id, reason_code, note, active
      ) values (
        p_booking_id, v_supplier, 'chargeback',
        'Auto-hold from Stripe dispute ' || coalesce(p_stripe_dispute_id, p_stripe_event_id)
          || '. OWNER POLICY: chargeback economic liability not assigned in software.',
        true
      );
    end if;
    update public.supplier_earning_items
      set status = case when status in ('eligible', 'pending') then 'pending' else status end,
          updated_at = now()
    where booking_id = p_booking_id and status in ('eligible', 'pending');
    perform public.commercial_unlink_earning_from_unpaid_periods(p_booking_id);
  end if;

  if v_mapped in ('won', 'closed', 'warning_closed') then
    update public.booking_financial_holds
      set active = false,
          released_at = now(),
          release_note = 'Auto-release: dispute ' || v_mapped
    where booking_id = p_booking_id
      and active
      and reason_code = 'chargeback';
    perform public.refresh_supplier_earning_eligibility(now());
  end if;

  if v_mapped = 'lost' and v_supplier is not null then
    -- Represent loss: if earning was paid, record recovery for remaining supplier entitlement
    perform public.commercial_record_post_payout_recovery(
      p_booking_id,
      coalesce((
        select amount_minor from public.supplier_earning_items where booking_id = p_booking_id
      ), 0),
      'Chargeback lost — recovery representation (OWNER POLICY: liability TBD)'
    );
  end if;

  insert into public.financial_audit_log (
    action, booking_id, supplier_id, amount_minor, currency, reason, provider_ref, after_state
  ) values (
    'dispute_event', p_booking_id, v_supplier, p_amount_minor, p_currency, p_reason, p_stripe_event_id,
    jsonb_build_object('dispute_status', v_mapped, 'event_type', p_event_type)
  );

  return jsonb_build_object('ok', true, 'dispute_status', v_mapped);
end;
$$;

revoke all on function public.apply_booking_dispute_event(uuid, text, text, text, text, bigint, text, text, jsonb) from public;
grant execute on function public.apply_booking_dispute_event(uuid, text, text, text, text, bigint, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Booking financial investigation snapshot (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_booking_financial_investigation(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking jsonb;
  v_snap jsonb;
  v_item jsonb;
  v_ledger jsonb;
  v_holds jsonb;
  v_disputes jsonb;
  v_refunds jsonb;
  v_period jsonb;
  v_recovery_minor bigint;
begin
  select to_jsonb(b) - 'purchase_snapshot' into v_booking
  from public.bookings b where b.id = p_booking_id;
  if v_booking is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  select to_jsonb(s) into v_snap
  from public.booking_commercial_snapshots s where s.booking_id = p_booking_id;

  select to_jsonb(e) into v_item
  from public.supplier_earning_items e where e.booking_id = p_booking_id;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), '[]'::jsonb) into v_ledger
  from public.supplier_ledger_entries l where l.booking_id = p_booking_id;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb) into v_holds
  from public.booking_financial_holds h where h.booking_id = p_booking_id;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb) into v_disputes
  from public.booking_dispute_events d where d.booking_id = p_booking_id;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) into v_refunds
  from public.booking_refund_instructions r where r.booking_id = p_booking_id;

  select to_jsonb(p) into v_period
  from public.supplier_payout_periods p
  where p.id = (select payout_period_id from public.supplier_earning_items where booking_id = p_booking_id);

  select coalesce(sum(public.commercial_amount_to_minor(abs(l.amount))), 0) into v_recovery_minor
  from public.supplier_ledger_entries l
  where l.booking_id = p_booking_id and l.kind = 'supplier_recovery';

  return jsonb_build_object(
    'ok', true,
    'booking', v_booking,
    'snapshot', v_snap,
    'earning_item', v_item,
    'ledger', v_ledger,
    'holds', v_holds,
    'disputes', v_disputes,
    'refund_instructions', v_refunds,
    'payout_period', v_period,
    'supplier_recovery_minor', v_recovery_minor,
    'blocks_payout', public.booking_blocks_payout_eligibility(p_booking_id),
    'payout_hold_hours', (select value_int from public.commercial_runtime_config where key = 'payout_hold_hours')
  );
end;
$$;

revoke all on function public.admin_booking_financial_investigation(uuid) from public;
revoke all on function public.admin_booking_financial_investigation(uuid) from anon, authenticated;
grant execute on function public.admin_booking_financial_investigation(uuid) to service_role;

-- Experience timezone: prefer purchase_snapshot.departureTimezone (align with cancel window)
create or replace function public.booking_experience_at(p_booking_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date date;
  v_checkout date;
  v_start text;
  v_tz text;
  v_kind text;
  v_snap jsonb;
begin
  select
    b.booking_date,
    b.check_out,
    b.start_time,
    lower(trim(coalesce(l.experience_kind, l.style, ''))),
    b.purchase_snapshot
  into v_date, v_checkout, v_start, v_kind, v_snap
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_date is null then
    return null;
  end if;

  v_tz := coalesce(
    nullif(btrim(coalesce(v_snap ->> 'departureTimezone', '')), ''),
    nullif(btrim(coalesce(v_snap ->> 'timezone', '')), ''),
    'Europe/Helsinki'
  );

  if v_kind like '%stay%' or v_checkout is not null then
    return (coalesce(v_checkout, v_date)::timestamp at time zone v_tz);
  end if;

  if v_start is not null and length(trim(v_start)) >= 4 then
    begin
      return ((v_date::text || ' ' || trim(v_start))::timestamp at time zone v_tz);
    exception when others then
      return (v_date::timestamp at time zone v_tz);
    end;
  end if;

  return (v_date::timestamp at time zone v_tz);
end;
$$;

comment on function public.booking_experience_at(uuid) is
  'Experience instant for payout eligibility. TZ from purchase_snapshot.departureTimezone else Europe/Helsinki.';

-- Recompute eligible_at for unsettled earning items with new 48h hold
-- (only pending/eligible not yet included/paid — do not rewrite paid history)
update public.supplier_earning_items e
set experience_at = public.booking_experience_at(e.booking_id),
    eligible_at = public.booking_experience_at(e.booking_id)
      + make_interval(hours => coalesce((
          select value_int from public.commercial_runtime_config where key = 'payout_hold_hours'
        ), 48)),
    status = case
      when e.status = 'eligible'
        and (
          public.booking_experience_at(e.booking_id)
          + make_interval(hours => coalesce((
              select value_int from public.commercial_runtime_config where key = 'payout_hold_hours'
            ), 48))
        ) > now()
        then 'pending'
      else e.status
    end,
    updated_at = now()
where e.status in ('pending', 'eligible')
  and e.amount_minor > 0;
