-- Mission 2 Phase 1: Stripe Connect SCAT foundation (additive).
-- Money movement remains DISABLED until STRIPE_CONNECT_TRANSFERS_ENABLED=test
-- is set on Edge Functions. No live activation in this migration.

-- ---------------------------------------------------------------------------
-- Supplier Connect + payout rail configuration
-- ---------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists stripe_connected_account_id text;

alter table public.supplier_profiles
  add column if not exists payout_rail text not null default 'manual_iban';

alter table public.supplier_profiles
  drop constraint if exists supplier_profiles_payout_rail_check;

alter table public.supplier_profiles
  add constraint supplier_profiles_payout_rail_check
  check (payout_rail in ('manual_iban', 'stripe_connect'));

alter table public.supplier_profiles
  add column if not exists connect_onboarding_status text not null default 'not_started';

alter table public.supplier_profiles
  drop constraint if exists supplier_profiles_connect_onboarding_status_check;

alter table public.supplier_profiles
  add constraint supplier_profiles_connect_onboarding_status_check
  check (connect_onboarding_status in (
    'not_started', 'pending', 'restricted', 'complete', 'rejected'
  ));

alter table public.supplier_profiles
  add column if not exists connect_charges_enabled boolean not null default false;

alter table public.supplier_profiles
  add column if not exists connect_payouts_enabled boolean not null default false;

alter table public.supplier_profiles
  add column if not exists connect_details_submitted boolean not null default false;

alter table public.supplier_profiles
  add column if not exists connect_disabled_reason text;

alter table public.supplier_profiles
  add column if not exists connect_requirements_currently_due jsonb not null default '[]'::jsonb;

alter table public.supplier_profiles
  add column if not exists connect_requirements_past_due jsonb not null default '[]'::jsonb;

alter table public.supplier_profiles
  add column if not exists connect_default_currency text;

alter table public.supplier_profiles
  add column if not exists connect_country text;

alter table public.supplier_profiles
  add column if not exists connect_last_synced_at timestamptz;

alter table public.supplier_profiles
  add column if not exists connect_debit_negative_balances boolean not null default false;

comment on column public.supplier_profiles.stripe_connected_account_id is
  'Stripe Connect account id (acct_...). Null until onboarding starts.';
comment on column public.supplier_profiles.payout_rail is
  'manual_iban = legacy Traverion IBAN; stripe_connect = SCAT transfers.';
comment on column public.supplier_profiles.connect_debit_negative_balances is
  'Must remain false at launch — never auto-debit supplier bank.';

create unique index if not exists supplier_profiles_stripe_connected_account_uidx
  on public.supplier_profiles (stripe_connected_account_id)
  where stripe_connected_account_id is not null;

-- ---------------------------------------------------------------------------
-- Platform liquidity snapshot (never treat raw Stripe available as funded)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_liquidity_snapshots (
  id uuid primary key default gen_random_uuid(),
  currency text not null,
  stripe_available_minor bigint not null check (stripe_available_minor >= 0),
  stripe_pending_minor bigint not null default 0 check (stripe_pending_minor >= 0),
  reserved_for_transfers_minor bigint not null default 0 check (reserved_for_transfers_minor >= 0),
  reserved_for_refunds_minor bigint not null default 0 check (reserved_for_refunds_minor >= 0),
  reserved_operating_minor bigint not null default 0 check (reserved_operating_minor >= 0),
  transferable_minor bigint not null check (transferable_minor >= 0),
  outstanding_supplier_liability_minor bigint not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists platform_liquidity_snapshots_created_idx
  on public.platform_liquidity_snapshots (created_at desc);

alter table public.platform_liquidity_snapshots enable row level security;
revoke all on table public.platform_liquidity_snapshots from anon, authenticated;
grant select on table public.platform_liquidity_snapshots to authenticated;
grant all on table public.platform_liquidity_snapshots to service_role;

drop policy if exists platform_liquidity_snapshots_admin_select on public.platform_liquidity_snapshots;
create policy platform_liquidity_snapshots_admin_select
  on public.platform_liquidity_snapshots for select
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Transfer batches (cron run) + per-period attempts
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_transfer_batches (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'partial')),
  environment text not null default 'test'
    check (environment in ('test', 'live')),
  live_money_enabled boolean not null default false,
  suppliers_considered integer not null default 0,
  transfers_attempted integer not null default 0,
  transfers_succeeded integer not null default 0,
  transfers_failed integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Hard safety: live batches must never be enabled by migration defaults.
alter table public.supplier_transfer_batches
  drop constraint if exists supplier_transfer_batches_no_live_money;
alter table public.supplier_transfer_batches
  add constraint supplier_transfer_batches_no_live_money
  check (live_money_enabled = false and environment = 'test');

create table if not exists public.supplier_transfer_attempts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.supplier_transfer_batches (id) on delete set null,
  payout_period_id uuid not null references public.supplier_payout_periods (id) on delete restrict,
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  currency text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  debt_applied_minor bigint not null default 0 check (debt_applied_minor >= 0),
  status text not null default 'queued'
    check (status in (
      'queued', 'reserved', 'transfer_pending', 'transfer_completed',
      'transfer_failed', 'reversed', 'skipped', 'cancelled'
    )),
  skip_reason text,
  idempotency_key text not null,
  stripe_transfer_id text,
  stripe_balance_transaction_id text,
  stripe_destination_account_id text,
  error_code text,
  error_message text,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  reserved_at timestamptz,
  transferred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (stripe_transfer_id)
);

create index if not exists supplier_transfer_attempts_period_idx
  on public.supplier_transfer_attempts (payout_period_id, created_at desc);
create index if not exists supplier_transfer_attempts_supplier_status_idx
  on public.supplier_transfer_attempts (supplier_id, status);
create index if not exists supplier_transfer_attempts_batch_idx
  on public.supplier_transfer_attempts (batch_id);

-- At most one non-terminal successful transfer reservation per period
create unique index if not exists supplier_transfer_attempts_period_active_uidx
  on public.supplier_transfer_attempts (payout_period_id)
  where status in ('queued', 'reserved', 'transfer_pending', 'transfer_completed');

create table if not exists public.supplier_transfer_allocations (
  id uuid primary key default gen_random_uuid(),
  transfer_attempt_id uuid not null references public.supplier_transfer_attempts (id) on delete cascade,
  earning_item_id uuid not null references public.supplier_earning_items (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0),
  created_at timestamptz not null default now(),
  unique (transfer_attempt_id, earning_item_id)
);

create index if not exists supplier_transfer_allocations_booking_idx
  on public.supplier_transfer_allocations (booking_id);

-- ---------------------------------------------------------------------------
-- Connected-account bank payout tracking (distinct from Transfer)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_bank_payout_attempts (
  id uuid primary key default gen_random_uuid(),
  transfer_attempt_id uuid references public.supplier_transfer_attempts (id) on delete set null,
  payout_period_id uuid not null references public.supplier_payout_periods (id) on delete restrict,
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  currency text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  status text not null default 'pending'
    check (status in (
      'pending', 'in_transit', 'paid', 'failed', 'canceled', 'unknown'
    )),
  idempotency_key text not null,
  stripe_payout_id text,
  stripe_balance_transaction_id text,
  arrival_date date,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (stripe_payout_id)
);

create index if not exists supplier_bank_payout_attempts_period_idx
  on public.supplier_bank_payout_attempts (payout_period_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reconciliation + exceptions
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payout_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.supplier_profiles (id) on delete set null,
  payout_period_id uuid references public.supplier_payout_periods (id) on delete set null,
  transfer_attempt_id uuid references public.supplier_transfer_attempts (id) on delete set null,
  bank_payout_attempt_id uuid references public.supplier_bank_payout_attempts (id) on delete set null,
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warn', 'error')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists supplier_payout_reconciliation_events_created_idx
  on public.supplier_payout_reconciliation_events (created_at desc);
create index if not exists supplier_payout_reconciliation_events_type_idx
  on public.supplier_payout_reconciliation_events (event_type, created_at desc);

create table if not exists public.supplier_payout_exceptions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.supplier_profiles (id) on delete set null,
  payout_period_id uuid references public.supplier_payout_periods (id) on delete set null,
  transfer_attempt_id uuid references public.supplier_transfer_attempts (id) on delete set null,
  reason_code text not null,
  detail text,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create index if not exists supplier_payout_exceptions_open_idx
  on public.supplier_payout_exceptions (status, created_at desc)
  where status = 'open';

-- Extend payout periods with Connect lifecycle (additive; READY ≠ bank paid)
alter table public.supplier_payout_periods
  add column if not exists connect_lifecycle text not null default 'internal_only';

alter table public.supplier_payout_periods
  drop constraint if exists supplier_payout_periods_connect_lifecycle_check;

alter table public.supplier_payout_periods
  add constraint supplier_payout_periods_connect_lifecycle_check
  check (connect_lifecycle in (
    'internal_only',
    'transfer_pending',
    'transfer_completed',
    'bank_payout_pending',
    'bank_payout_paid',
    'bank_payout_failed',
    'failed',
    'reversed'
  ));

alter table public.supplier_payout_periods
  add column if not exists latest_transfer_attempt_id uuid;

alter table public.supplier_payout_periods
  add column if not exists latest_bank_payout_attempt_id uuid;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.supplier_transfer_batches enable row level security;
alter table public.supplier_transfer_attempts enable row level security;
alter table public.supplier_transfer_allocations enable row level security;
alter table public.supplier_bank_payout_attempts enable row level security;
alter table public.supplier_payout_reconciliation_events enable row level security;
alter table public.supplier_payout_exceptions enable row level security;

revoke all on table public.supplier_transfer_batches from anon, authenticated;
revoke all on table public.supplier_transfer_attempts from anon, authenticated;
revoke all on table public.supplier_transfer_allocations from anon, authenticated;
revoke all on table public.supplier_bank_payout_attempts from anon, authenticated;
revoke all on table public.supplier_payout_reconciliation_events from anon, authenticated;
revoke all on table public.supplier_payout_exceptions from anon, authenticated;

grant select on table public.supplier_transfer_attempts to authenticated;
grant select on table public.supplier_transfer_allocations to authenticated;
grant select on table public.supplier_bank_payout_attempts to authenticated;
grant select on table public.supplier_payout_exceptions to authenticated;

grant all on table public.supplier_transfer_batches to service_role;
grant all on table public.supplier_transfer_attempts to service_role;
grant all on table public.supplier_transfer_allocations to service_role;
grant all on table public.supplier_bank_payout_attempts to service_role;
grant all on table public.supplier_payout_reconciliation_events to service_role;
grant all on table public.supplier_payout_exceptions to service_role;

drop policy if exists supplier_transfer_attempts_select on public.supplier_transfer_attempts;
create policy supplier_transfer_attempts_select
  on public.supplier_transfer_attempts for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

drop policy if exists supplier_transfer_allocations_select on public.supplier_transfer_allocations;
create policy supplier_transfer_allocations_select
  on public.supplier_transfer_allocations for select
  using (
    public.is_traverion_panel_admin()
    or exists (
      select 1 from public.supplier_transfer_attempts a
      where a.id = transfer_attempt_id
        and public.is_supplier_account_side(a.supplier_id)
    )
  );

drop policy if exists supplier_bank_payout_attempts_select on public.supplier_bank_payout_attempts;
create policy supplier_bank_payout_attempts_select
  on public.supplier_bank_payout_attempts for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

drop policy if exists supplier_payout_exceptions_select on public.supplier_payout_exceptions;
create policy supplier_payout_exceptions_select
  on public.supplier_payout_exceptions for select
  using (
    public.is_traverion_panel_admin()
    or (supplier_id is not null and public.is_supplier_account_side(supplier_id))
  );

-- Admin-only on batches / reconciliation
drop policy if exists supplier_transfer_batches_admin_select on public.supplier_transfer_batches;
create policy supplier_transfer_batches_admin_select
  on public.supplier_transfer_batches for select
  using (public.is_traverion_panel_admin());

grant select on table public.supplier_transfer_batches to authenticated;
grant select on table public.supplier_payout_reconciliation_events to authenticated;

drop policy if exists supplier_payout_reconciliation_events_admin_select
  on public.supplier_payout_reconciliation_events;
create policy supplier_payout_reconciliation_events_admin_select
  on public.supplier_payout_reconciliation_events for select
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Liquidity helper (ledger liabilities vs optional stripe available input)
-- ---------------------------------------------------------------------------
create or replace function public.compute_platform_transferable_minor(
  p_currency text,
  p_stripe_available_minor bigint,
  p_refund_reserve_minor bigint default null,
  p_operating_reserve_minor bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur text := upper(trim(coalesce(p_currency, 'EUR')));
  v_available bigint := greatest(coalesce(p_stripe_available_minor, 0), 0);
  v_liability bigint := 0;
  v_refund_reserve bigint;
  v_operating bigint;
  v_transferable bigint;
begin
  -- Outstanding eligible+included supplier-net not yet bank-confirmed via Connect
  select coalesce(sum(e.amount_minor), 0) into v_liability
  from public.supplier_earning_items e
  where upper(trim(coalesce(e.currency, 'EUR'))) = v_cur
    and e.status in ('eligible', 'included')
    and e.amount_minor > 0;

  v_refund_reserve := coalesce(
    p_refund_reserve_minor,
    (select value_int from public.commercial_runtime_config where key = 'platform_refund_reserve_minor'),
    50000
  );
  v_operating := coalesce(
    p_operating_reserve_minor,
    (select value_int from public.commercial_runtime_config where key = 'platform_operating_reserve_minor'),
    100000
  );

  v_transferable := greatest(v_available - v_refund_reserve - v_operating, 0);

  return jsonb_build_object(
    'ok', true,
    'currency', v_cur,
    'stripe_available_minor', v_available,
    'outstanding_supplier_liability_minor', v_liability,
    'reserved_for_refunds_minor', v_refund_reserve,
    'reserved_operating_minor', v_operating,
    'transferable_minor', v_transferable,
    'fully_funded', v_transferable >= v_liability,
    'note', 'Never treat raw Stripe available as fully fundable for supplier liabilities'
  );
end;
$$;

revoke all on function public.compute_platform_transferable_minor(text, bigint, bigint, bigint) from public;
grant execute on function public.compute_platform_transferable_minor(text, bigint, bigint, bigint) to service_role;
grant execute on function public.compute_platform_transferable_minor(text, bigint, bigint, bigint) to authenticated;

insert into public.commercial_runtime_config (key, value_int, note)
values
  ('platform_refund_reserve_minor', 50000, 'EUR cents reserved against refunds before SCAT transfers (TEST default)'),
  ('platform_operating_reserve_minor', 100000, 'EUR cents operating reserve before SCAT transfers (TEST default)'),
  ('stripe_connect_transfers_enabled', 0, '0=disabled, 1=TEST transfers allowed on Edge. Live never enabled by config alone.')
on conflict (key) do nothing;

-- Seed config if conflict target differs
do $$
begin
  if not exists (select 1 from public.commercial_runtime_config where key = 'platform_refund_reserve_minor') then
    insert into public.commercial_runtime_config (key, value_int, note)
    values ('platform_refund_reserve_minor', 50000, 'EUR cents reserved against refunds before SCAT transfers');
  end if;
  if not exists (select 1 from public.commercial_runtime_config where key = 'platform_operating_reserve_minor') then
    insert into public.commercial_runtime_config (key, value_int, note)
    values ('platform_operating_reserve_minor', 100000, 'EUR cents operating reserve before SCAT transfers');
  end if;
  if not exists (select 1 from public.commercial_runtime_config where key = 'stripe_connect_transfers_enabled') then
    insert into public.commercial_runtime_config (key, value_int, note)
    values ('stripe_connect_transfers_enabled', 0, '0=disabled, 1=TEST only');
  end if;
exception when others then
  null;
end $$;
