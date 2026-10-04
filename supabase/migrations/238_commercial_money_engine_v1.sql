-- =============================================================================
-- Traverion commercial money engine V1
-- STANDARD 15% monthly · FAST 18% semimonthly
-- Integer minor-unit economics · immutable booking snapshots · payout prep only
-- Legacy paid bookings without a snapshot remain 0% (honest history).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Config: post-activity hold hours (OWNER DECISION — default 0 for TEST)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_runtime_config (
  key text primary key,
  value_int integer not null,
  note text,
  updated_at timestamptz not null default now()
);

insert into public.commercial_runtime_config (key, value_int, note)
values (
  'payout_hold_hours',
  0,
  'OWNER DECISION: hours after experience start before earning becomes payout-eligible. 0 = eligible at experience start (TEST default). Do not invent production hold without Miro.'
)
on conflict (key) do nothing;

revoke all on table public.commercial_runtime_config from anon, authenticated;
grant select on table public.commercial_runtime_config to authenticated;

alter table public.commercial_runtime_config enable row level security;
drop policy if exists commercial_runtime_config_select on public.commercial_runtime_config;
create policy commercial_runtime_config_select
  on public.commercial_runtime_config for select
  using (public.is_traverion_panel_admin());

-- ---------------------------------------------------------------------------
-- Supplier commercial terms (history + effective dating)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  plan_code text not null,
  commission_bps integer not null check (commission_bps >= 0 and commission_bps <= 10000),
  payout_cadence text not null check (payout_cadence in ('monthly', 'semimonthly')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  status text not null default 'active' check (status in ('active', 'superseded')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  note text,
  constraint supplier_commercial_terms_plan_check
    check (plan_code in ('standard', 'fast', 'custom', 'legacy_zero')),
  constraint supplier_commercial_terms_window_check
    check (effective_until is null or effective_until > effective_from),
  constraint supplier_commercial_terms_note_len check (note is null or char_length(note) <= 2000)
);

create unique index if not exists supplier_commercial_terms_one_open
  on public.supplier_commercial_terms (supplier_id)
  where status = 'active' and effective_until is null;

create index if not exists supplier_commercial_terms_supplier_from_idx
  on public.supplier_commercial_terms (supplier_id, effective_from desc);

comment on table public.supplier_commercial_terms is
  'Authoritative supplier commercial terms history. Suppliers cannot self-modify.';

alter table public.supplier_commercial_terms enable row level security;
revoke all on table public.supplier_commercial_terms from anon, authenticated;
grant select on table public.supplier_commercial_terms to authenticated;

drop policy if exists supplier_commercial_terms_select on public.supplier_commercial_terms;
create policy supplier_commercial_terms_select
  on public.supplier_commercial_terms for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

-- Seed STANDARD for existing suppliers that have no terms yet.
insert into public.supplier_commercial_terms (
  supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
)
select
  sp.id,
  'standard',
  1500,
  'monthly',
  now(),
  'active',
  'Seeded STANDARD 15% monthly for commercial engine V1 activation'
from public.supplier_profiles sp
where not exists (
  select 1 from public.supplier_commercial_terms t
  where t.supplier_id = sp.id and t.status = 'active' and t.effective_until is null
);

-- ---------------------------------------------------------------------------
-- Booking commercial snapshot (immutable economics)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_commercial_snapshots (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  supplier_id uuid not null references public.supplier_profiles (id) on delete restrict,
  terms_id uuid references public.supplier_commercial_terms (id) on delete set null,
  plan_code text not null,
  commission_bps integer not null check (commission_bps >= 0 and commission_bps <= 10000),
  payout_cadence text not null check (payout_cadence in ('monthly', 'semimonthly')),
  currency text not null,
  gross_minor bigint not null check (gross_minor >= 0),
  commission_minor bigint not null check (commission_minor >= 0),
  supplier_minor bigint not null check (supplier_minor >= 0),
  platform_minor bigint not null check (platform_minor >= 0),
  remaining_gross_minor bigint not null check (remaining_gross_minor >= 0),
  remaining_commission_minor bigint not null check (remaining_commission_minor >= 0),
  remaining_supplier_minor bigint not null check (remaining_supplier_minor >= 0),
  remaining_platform_minor bigint not null check (remaining_platform_minor >= 0),
  policy_id text not null default 'traverion_commercial_v1',
  frozen_at_checkout_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_commercial_snapshots_split_check
    check (commission_minor + supplier_minor = gross_minor),
  constraint booking_commercial_snapshots_remaining_split_check
    check (remaining_commission_minor + remaining_supplier_minor = remaining_gross_minor),
  constraint booking_commercial_snapshots_platform_eq_commission
    check (platform_minor = commission_minor and remaining_platform_minor = remaining_commission_minor)
);

create index if not exists booking_commercial_snapshots_supplier_idx
  on public.booking_commercial_snapshots (supplier_id);

comment on table public.booking_commercial_snapshots is
  'Immutable commercial economics for a booking. Terms frozen at checkout; amounts settled at paid.';

alter table public.booking_commercial_snapshots enable row level security;
revoke all on table public.booking_commercial_snapshots from anon, authenticated;
grant select on table public.booking_commercial_snapshots to authenticated;

drop policy if exists booking_commercial_snapshots_select on public.booking_commercial_snapshots;
create policy booking_commercial_snapshots_select
  on public.booking_commercial_snapshots for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

-- Freeze pointer on booking (set at checkout create; settled uses snapshot row)
alter table public.bookings
  add column if not exists commercial_terms_id uuid references public.supplier_commercial_terms (id) on delete set null;

create index if not exists bookings_commercial_terms_id_idx
  on public.bookings (commercial_terms_id)
  where commercial_terms_id is not null;

-- ---------------------------------------------------------------------------
-- Supplier earning items (payout eligibility lifecycle)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_earning_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  currency text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'eligible', 'included', 'paid', 'reversed')),
  experience_at timestamptz,
  eligible_at timestamptz,
  payout_period_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists supplier_earning_items_supplier_status_idx
  on public.supplier_earning_items (supplier_id, status, currency);

create index if not exists supplier_earning_items_eligible_idx
  on public.supplier_earning_items (supplier_id, currency, eligible_at)
  where status = 'eligible';

comment on table public.supplier_earning_items is
  'Per-booking supplier entitlement lifecycle for payout preparation. Not client-writable.';

alter table public.supplier_earning_items enable row level security;
revoke all on table public.supplier_earning_items from anon, authenticated;
grant select on table public.supplier_earning_items to authenticated;

drop policy if exists supplier_earning_items_select on public.supplier_earning_items;
create policy supplier_earning_items_select
  on public.supplier_earning_items for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

-- ---------------------------------------------------------------------------
-- Payout periods (preparation only — no bank transfer)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payout_periods (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  currency text not null,
  cadence text not null check (cadence in ('monthly', 'semimonthly')),
  period_key text not null,
  period_start date not null,
  period_end date not null,
  scheduled_for date not null,
  status text not null default 'ready'
    check (status in ('drafting', 'ready', 'processing', 'paid', 'failed', 'cancelled')),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_via text,
  note text,
  unique (supplier_id, currency, period_key)
);

create table if not exists public.supplier_payout_period_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.supplier_payout_periods (id) on delete cascade,
  earning_item_id uuid not null references public.supplier_earning_items (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0),
  created_at timestamptz not null default now(),
  unique (earning_item_id)
);

create index if not exists supplier_payout_periods_status_idx
  on public.supplier_payout_periods (status, scheduled_for);

alter table public.supplier_earning_items
  drop constraint if exists supplier_earning_items_payout_period_id_fkey;
alter table public.supplier_earning_items
  add constraint supplier_earning_items_payout_period_id_fkey
  foreign key (payout_period_id) references public.supplier_payout_periods (id) on delete set null;

alter table public.supplier_payout_periods enable row level security;
alter table public.supplier_payout_period_items enable row level security;
revoke all on table public.supplier_payout_periods from anon, authenticated;
revoke all on table public.supplier_payout_period_items from anon, authenticated;
grant select on table public.supplier_payout_periods to authenticated;
grant select on table public.supplier_payout_period_items to authenticated;

drop policy if exists supplier_payout_periods_select on public.supplier_payout_periods;
create policy supplier_payout_periods_select
  on public.supplier_payout_periods for select
  using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
  );

drop policy if exists supplier_payout_period_items_select on public.supplier_payout_period_items;
create policy supplier_payout_period_items_select
  on public.supplier_payout_period_items for select
  using (
    exists (
      select 1 from public.supplier_payout_periods p
      where p.id = period_id
        and (
          public.is_traverion_panel_admin()
          or public.is_supplier_account_side(p.supplier_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.commercial_amount_to_minor(p_amount numeric)
returns bigint
language sql
immutable
as $$
  select round(coalesce(p_amount, 0) * 100)::bigint;
$$;

create or replace function public.commercial_minor_to_amount(p_minor bigint)
returns numeric
language sql
immutable
as $$
  select (coalesce(p_minor, 0)::numeric / 100);
$$;

create or replace function public.commercial_split_minor(p_gross_minor bigint, p_bps integer)
returns table (commission_minor bigint, supplier_minor bigint)
language sql
immutable
as $$
  select
    (p_gross_minor * p_bps) / 10000,
    p_gross_minor - ((p_gross_minor * p_bps) / 10000);
$$;

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
begin
  select
    b.booking_date,
    b.check_out,
    b.start_time,
    coalesce(nullif(l.timezone, ''), 'Europe/Helsinki'),
    lower(trim(coalesce(l.experience_kind, l.style, '')))
  into v_date, v_checkout, v_start, v_tz, v_kind
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_date is null then
    return null;
  end if;

  -- Stays: experience completes on check-out day (local midnight).
  if v_kind like '%stay%' or v_checkout is not null then
    return (coalesce(v_checkout, v_date)::timestamp at time zone v_tz);
  end if;

  -- Tours: wall-clock start when start_time present.
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

revoke all on function public.booking_experience_at(uuid) from public;
grant execute on function public.booking_experience_at(uuid) to authenticated;
grant execute on function public.booking_experience_at(uuid) to service_role;

-- Active terms as of a timestamp (for freeze / settle)
create or replace function public.supplier_active_commercial_terms(
  p_supplier_id uuid,
  p_at timestamptz default now()
)
returns public.supplier_commercial_terms
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.supplier_commercial_terms;
begin
  select * into v_row
  from public.supplier_commercial_terms t
  where t.supplier_id = p_supplier_id
    and t.effective_from <= p_at
    and (t.effective_until is null or t.effective_until > p_at)
  order by t.effective_from desc
  limit 1;

  if v_row.id is null then
    -- Fallback STANDARD if somehow missing
    select * into v_row
    from public.supplier_commercial_terms t
    where t.supplier_id = p_supplier_id
    order by t.effective_from desc
    limit 1;
  end if;

  return v_row;
end;
$$;

revoke all on function public.supplier_active_commercial_terms(uuid, timestamptz) from public;
grant execute on function public.supplier_active_commercial_terms(uuid, timestamptz) to service_role;
grant execute on function public.supplier_active_commercial_terms(uuid, timestamptz) to authenticated;

-- Freeze terms onto booking at checkout (idempotent if already frozen)
create or replace function public.freeze_booking_commercial_terms(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_terms public.supplier_commercial_terms;
  v_existing uuid;
begin
  select l.supplier_id, b.commercial_terms_id
    into v_supplier, v_existing
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'terms_id', v_existing, 'already', true);
  end if;

  v_terms := public.supplier_active_commercial_terms(v_supplier, now());
  if v_terms.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_commercial_terms');
  end if;

  update public.bookings
    set commercial_terms_id = v_terms.id
  where id = p_booking_id
    and commercial_terms_id is null;

  return jsonb_build_object('ok', true, 'terms_id', v_terms.id, 'already', false, 'plan_code', v_terms.plan_code, 'commission_bps', v_terms.commission_bps);
end;
$$;

revoke all on function public.freeze_booking_commercial_terms(uuid) from public;
grant execute on function public.freeze_booking_commercial_terms(uuid) to service_role;

-- Admin: set new commercial terms (supersedes open row)
create or replace function public.admin_set_supplier_commercial_terms(
  p_supplier_id uuid,
  p_plan_code text,
  p_commission_bps integer,
  p_payout_cadence text,
  p_effective_from timestamptz,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := lower(btrim(coalesce(p_plan_code, '')));
  v_cadence text := lower(btrim(coalesce(p_payout_cadence, '')));
  v_from timestamptz := coalesce(p_effective_from, now());
  v_id uuid;
begin
  -- AuthZ: service_role only (admin edge assertAdmin). Not callable by suppliers/travelers.
  if not exists (select 1 from public.supplier_profiles where id = p_supplier_id) then
    return jsonb_build_object('ok', false, 'error', 'supplier_not_found');
  end if;
  if v_plan not in ('standard', 'fast', 'custom') then
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  if v_cadence not in ('monthly', 'semimonthly') then
    return jsonb_build_object('ok', false, 'error', 'invalid_cadence');
  end if;
  if p_commission_bps is null or p_commission_bps < 0 or p_commission_bps > 10000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_bps');
  end if;
  if v_plan = 'standard' and (p_commission_bps <> 1500 or v_cadence <> 'monthly') then
    -- Allow custom bps only via custom plan; standard/fast are locked shapes.
    return jsonb_build_object('ok', false, 'error', 'standard_must_be_1500_monthly');
  end if;
  if v_plan = 'fast' and (p_commission_bps <> 1800 or v_cadence <> 'semimonthly') then
    return jsonb_build_object('ok', false, 'error', 'fast_must_be_1800_semimonthly');
  end if;

  update public.supplier_commercial_terms
    set effective_until = v_from,
        status = 'superseded'
  where supplier_id = p_supplier_id
    and status = 'active'
    and effective_until is null
    and effective_from < v_from;

  insert into public.supplier_commercial_terms (
    supplier_id, plan_code, commission_bps, payout_cadence,
    effective_from, status, created_by, note
  ) values (
    p_supplier_id, v_plan, p_commission_bps, v_cadence,
    v_from, 'active', p_actor_id, nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.admin_set_supplier_commercial_terms(uuid, text, integer, text, timestamptz, text, uuid) from public;
revoke all on function public.admin_set_supplier_commercial_terms(uuid, text, integer, text, timestamptz, text, uuid) from anon, authenticated;
grant execute on function public.admin_set_supplier_commercial_terms(uuid, text, integer, text, timestamptz, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Settle + record earnings (replaces 100% gross posting)
-- ---------------------------------------------------------------------------
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

  -- Idempotent if snapshot already settled
  if exists (
    select 1 from public.booking_commercial_snapshots s
    where s.booking_id = p_booking_id and s.settled_at is not null
  ) then
    select id into v_earn_id
    from public.supplier_ledger_entries
    where kind = 'booking_earnings' and source_id = p_booking_id::text;
    return jsonb_build_object('ok', true, 'already', true, 'id', v_earn_id);
  end if;

  -- Resolve terms: frozen at checkout, else active now, else legacy 0%
  if v_terms_id is not null then
    select * into v_terms from public.supplier_commercial_terms where id = v_terms_id;
  end if;
  if v_terms.id is null then
    v_terms := public.supplier_active_commercial_terms(v_supplier, now());
  end if;

  v_gross_minor := public.commercial_amount_to_minor(v_amount);

  if v_terms.id is null then
    -- Honest legacy: no terms → 0% commission (pre-engine bookings)
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

  -- Ensure snapshot amounts loaded (conflict path)
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
  'Commercial V1: snapshot terms, post supplier entitlement + platform_commission, create earning item. Idempotent.';

-- Reverse supplier + platform commission + earning item
create or replace function public.reverse_paid_booking_earnings(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund_id uuid;
  v_comm_rev_id uuid;
begin
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

  -- Unlink from unpaid payout periods so READY totals stay honest
  with target as (
    select e.id as earning_item_id, e.payout_period_id as period_id
    from public.supplier_earning_items e
    where e.booking_id = p_booking_id
      and e.status <> 'reversed'
  ),
  dropped as (
    delete from public.supplier_payout_period_items pi
    using target t, public.supplier_payout_periods p
    where pi.earning_item_id = t.earning_item_id
      and pi.period_id = p.id
      and p.status in ('drafting', 'ready', 'processing', 'cancelled')
    returning pi.period_id
  ),
  _mark as (
    update public.supplier_earning_items e
      set status = 'reversed',
          amount_minor = 0,
          payout_period_id = null,
          updated_at = now()
    where e.booking_id = p_booking_id
      and e.status <> 'reversed'
    returning e.id
  )
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
    and p.status <> 'paid';

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
    'commission_reversal_id', v_comm_rev_id
  );
end;
$$;

comment on function public.reverse_paid_booking_earnings(uuid) is
  'Commercial V1: reverse supplier earnings + platform commission; mark earning item reversed.';

-- Partial refund: recompute from remaining gross with snapshotted bps
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
    -- Legacy booking without snapshot: shrink earnings to remaining gross (0% model)
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

  update public.supplier_earning_items
    set amount_minor = v_supp_minor,
        status = case when status in ('included', 'paid') then status
                      when v_supp_minor = 0 then 'reversed'
                      else status end,
        updated_at = now()
  where booking_id = p_booking_id
    and status not in ('reversed');

  return jsonb_build_object(
    'ok', true,
    'shrunk', true,
    'remaining_gross_minor', v_remain_minor,
    'commission_minor', v_comm_minor,
    'supplier_minor', v_supp_minor,
    'before_supplier', v_before_supp,
    'before_commission', v_before_comm
  );
end;
$$;

comment on function public.shrink_paid_booking_earnings(uuid, numeric) is
  'Commercial V1: recompute supplier/platform from remaining gross using snapshotted bps.';

-- When cancel paths insert refund, also reverse platform commission
create or replace function public.trg_reverse_platform_commission_on_earnings_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

    update public.supplier_earning_items
      set status = 'reversed', amount_minor = 0, payout_period_id = null, updated_at = now()
    where booking_id = new.booking_id and status <> 'reversed';

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

drop trigger if exists trg_commercial_refund_commission on public.supplier_ledger_entries;
create trigger trg_commercial_refund_commission
  after insert on public.supplier_ledger_entries
  for each row
  when (new.kind = 'refund')
  execute function public.trg_reverse_platform_commission_on_earnings_refund();

-- Promote pending → eligible when experience + hold elapsed
create or replace function public.refresh_supplier_earning_eligibility(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
begin
  update public.supplier_earning_items
    set status = 'eligible', updated_at = now()
  where status = 'pending'
    and eligible_at is not null
    and eligible_at <= p_now
    and amount_minor > 0;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'promoted', v_n);
end;
$$;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- prepare_due_supplier_payouts — future cron entrypoint (NO money transfer)
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
  v_reused integer := 0;
  v_items integer := 0;
  v_period_key text;
  v_period_start date;
begin
  perform public.refresh_supplier_earning_eligibility(v_now);

  for r in
    select distinct e.supplier_id, e.currency
    from public.supplier_earning_items e
    where e.status = 'eligible' and e.amount_minor > 0
  loop
    v_terms := public.supplier_active_commercial_terms(r.supplier_id, v_now);
    if v_terms.id is null then
      continue;
    end if;

    -- Only prepare on intended run days for the supplier cadence
    if v_terms.payout_cadence = 'monthly' and v_day <> 1 then
      continue;
    end if;
    if v_terms.payout_cadence = 'semimonthly' and v_day not in (1, 15) then
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

    if found then
      -- distinguish create vs reuse via prior item_count
      select item_count into v_count from public.supplier_payout_periods where id = v_period_id;
      if coalesce(v_count, 0) = 0 then
        v_created := v_created + 1;
      else
        v_reused := v_reused + 1;
      end if;
    end if;

    -- Lock eligible items into this period exactly once
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

    v_items := v_items + v_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'periods_touched', v_created + v_reused,
    'items_included', v_items,
    'as_of', v_now
  );
end;
$$;

comment on function public.prepare_due_supplier_payouts(timestamptz) is
  'Future cron entrypoint: refresh eligibility, create/reuse payout periods, lock earnings. NO bank transfer.';

revoke all on function public.prepare_due_supplier_payouts(timestamptz) from public;
grant execute on function public.prepare_due_supplier_payouts(timestamptz) to service_role;

-- Mark period paid (manual / future provider) — links to admin_record pattern
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
declare
  v_period public.supplier_payout_periods;
  v_earn_id uuid;
begin
  -- AuthZ: service_role only (admin edge assertAdmin).

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

  insert into public.supplier_earnings (
    supplier_id, period_start, period_end, amount, currency, status, note, recorded_by
  ) values (
    v_period.supplier_id,
    v_period.period_start,
    v_period.period_end,
    public.commercial_minor_to_amount(v_period.amount_minor),
    v_period.currency,
    'paid',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Payout period ' || v_period.period_key),
    p_actor_id
  )
  returning id into v_earn_id;

  update public.supplier_earning_items
    set status = 'paid', updated_at = now()
  where payout_period_id = p_period_id and status = 'included';

  update public.supplier_payout_periods
    set status = 'paid',
        paid_at = now(),
        paid_via = 'manual_admin',
        note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
        updated_at = now()
  where id = p_period_id;

  return jsonb_build_object('ok', true, 'supplier_earnings_id', v_earn_id, 'period_id', p_period_id);
end;
$$;

revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid) from public;
revoke all on function public.admin_mark_payout_period_paid(uuid, text, uuid) from anon, authenticated;
grant execute on function public.admin_mark_payout_period_paid(uuid, text, uuid) to service_role;

-- Auto-seed STANDARD terms for newly created supplier profiles
create or replace function public.trg_seed_supplier_commercial_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.supplier_commercial_terms t
    where t.supplier_id = new.id and t.status = 'active' and t.effective_until is null
  ) then
    insert into public.supplier_commercial_terms (
      supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
    ) values (
      new.id, 'standard', 1500, 'monthly', now(), 'active',
      'Auto-seeded STANDARD 15% monthly on supplier create'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seed_supplier_commercial_terms on public.supplier_profiles;
create trigger trg_seed_supplier_commercial_terms
  after insert on public.supplier_profiles
  for each row
  execute function public.trg_seed_supplier_commercial_terms();
