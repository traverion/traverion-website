-- P8.1: LIVE Connect mode separation, commission snapshot backfill from
-- booking_commercial_snapshots, pilot isolation fixture.
-- Does NOT enable payout flags. Does NOT create READY periods or transfers.

-- ---------------------------------------------------------------------------
-- 1) Explicit LIVE vs TEST Connect account marker
-- ---------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists connect_account_livemode boolean;

comment on column public.supplier_profiles.connect_account_livemode is
  'True when stripe_connected_account_id belongs to LIVE Stripe; false for TEST; null unknown/legacy.';

-- ---------------------------------------------------------------------------
-- 2) Pilot isolation (selection only — never auto-prepares)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payout_pilot_selections (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  earning_item_id uuid not null references public.supplier_earning_items (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  public_reference text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'EUR',
  status text not null default 'selected'
    check (status in ('selected', 'excluded', 'consumed', 'cancelled')),
  pilot_label text not null default 'p81_rn_first_live',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_label, earning_item_id)
);

create index if not exists supplier_payout_pilot_selections_supplier_idx
  on public.supplier_payout_pilot_selections (supplier_id, status);

alter table public.supplier_payout_pilot_selections enable row level security;
revoke all on table public.supplier_payout_pilot_selections from anon, authenticated;
grant select on table public.supplier_payout_pilot_selections to authenticated;
grant all on table public.supplier_payout_pilot_selections to service_role;

drop policy if exists supplier_payout_pilot_selections_admin_select on public.supplier_payout_pilot_selections;
create policy supplier_payout_pilot_selections_admin_select
  on public.supplier_payout_pilot_selections for select
  using (public.is_traverion_panel_admin());

comment on table public.supplier_payout_pilot_selections is
  'Explicit pilot booking isolation. Selection does not allocate earnings or create READY periods.';

-- ---------------------------------------------------------------------------
-- 3) Backfill frozen commission columns from authoritative checkout snapshots
--     Only when earning amount_minor matches snapshot supplier_minor.
--     Never invent commission from current terms alone.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_updated int := 0;
begin
  for r in
    select
      e.id as earning_item_id,
      e.booking_id,
      e.supplier_id,
      e.amount_minor,
      e.status as earning_status,
      s.gross_minor,
      s.commission_minor,
      s.commission_bps,
      s.supplier_minor,
      s.terms_id,
      s.plan_code,
      s.frozen_at_checkout_at
    from public.supplier_earning_items e
    join public.booking_commercial_snapshots s on s.booking_id = e.booking_id
    where e.gross_minor is null
       or e.commission_minor is null
       or e.commission_bps is null
  loop
    if r.amount_minor is distinct from r.supplier_minor then
      insert into public.financial_audit_log (
        actor_id, action, supplier_id, booking_id, amount_minor, currency, reason, provider_ref, after_state
      ) values (
        null,
        'p81_commission_snapshot_blocked_mismatch',
        r.supplier_id,
        r.booking_id,
        r.amount_minor,
        'EUR',
        'Earning amount_minor does not match booking_commercial_snapshots.supplier_minor — manual review required',
        r.earning_item_id::text,
        jsonb_build_object(
          'earning_item_id', r.earning_item_id,
          'amount_minor', r.amount_minor,
          'snapshot_supplier_minor', r.supplier_minor,
          'snapshot_gross_minor', r.gross_minor,
          'snapshot_commission_minor', r.commission_minor,
          'snapshot_commission_bps', r.commission_bps
        )
      );
      continue;
    end if;

    update public.supplier_earning_items
      set gross_minor = r.gross_minor,
          commission_minor = r.commission_minor,
          commission_bps = r.commission_bps,
          updated_at = now()
    where id = r.earning_item_id
      and amount_minor = r.supplier_minor
      and (gross_minor is null or commission_minor is null or commission_bps is null);

    if found then
      v_updated := v_updated + 1;
      insert into public.financial_audit_log (
        actor_id, action, supplier_id, booking_id, amount_minor, currency, reason, provider_ref, after_state
      ) values (
        null,
        'p81_commission_snapshot_backfill',
        r.supplier_id,
        r.booking_id,
        r.amount_minor,
        'EUR',
        'Backfilled frozen commission fields from booking_commercial_snapshots; supplier amount_minor preserved',
        r.earning_item_id::text,
        jsonb_build_object(
          'earning_item_id', r.earning_item_id,
          'gross_minor', r.gross_minor,
          'commission_minor', r.commission_minor,
          'commission_bps', r.commission_bps,
          'terms_id', r.terms_id,
          'plan_code', r.plan_code,
          'frozen_at_checkout_at', r.frozen_at_checkout_at,
          'source', 'booking_commercial_snapshots'
        )
      );
    end if;
  end loop;

  raise notice 'p81 commission snapshot backfill updated=%', v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Archive Royal Nordic TEST Connect account; clear false LIVE-complete status
--     Does not create a LIVE account here (Stripe API via Edge).
-- ---------------------------------------------------------------------------
do $$
declare
  v_supplier uuid := '9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18';
  v_test_acct text;
begin
  select stripe_connected_account_id into v_test_acct
  from public.supplier_profiles
  where id = v_supplier;

  if v_test_acct is null then
    return;
  end if;

  -- Only archive known TEST sandbox account from P8 audit.
  if v_test_acct <> 'acct_1UTo53Fe0IP0EMwC' then
    raise notice 'p81 RN connect archive skipped — unexpected account %', v_test_acct;
    return;
  end if;

  update public.supplier_profiles
    set connect_legacy_account_id = coalesce(connect_legacy_account_id, v_test_acct),
        stripe_connected_account_id = null,
        connect_account_type = null,
        connect_account_livemode = null,
        connect_onboarding_status = 'not_started',
        connect_charges_enabled = false,
        connect_payouts_enabled = false,
        connect_details_submitted = false,
        connect_disabled_reason = 'archived_test_account_pending_live_onboarding',
        connect_requirements_currently_due = '{}',
        connect_requirements_past_due = '{}',
        payout_rail = 'manual_iban',
        connect_last_synced_at = now(),
        updated_at = now()
  where id = v_supplier;

  insert into public.financial_audit_log (
    actor_id, action, supplier_id, amount_minor, currency, reason, provider_ref, after_state
  ) values (
    null,
    'p81_archive_test_connect_account',
    v_supplier,
    0,
    'EUR',
    'Archived TEST Connect account; LIVE onboarding required before Verified status',
    v_test_acct,
    jsonb_build_object(
      'archived_account_id', v_test_acct,
      'connect_onboarding_status', 'not_started',
      'connect_account_livemode', null
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Pilot selection: one €85 frozen-OK confirmed booking (TV-FNFQEA87)
--     Exclude retained cancel TV-PDTAS6JD from pilot fixture.
-- ---------------------------------------------------------------------------
insert into public.supplier_payout_pilot_selections (
  supplier_id, earning_item_id, booking_id, public_reference, amount_minor, currency, status, pilot_label, note
)
select
  e.supplier_id,
  e.id,
  e.booking_id,
  b.public_reference,
  e.amount_minor,
  coalesce(nullif(upper(e.currency), ''), 'EUR'),
  'selected',
  'p81_rn_first_live',
  'Pilot isolation only — no READY period / no transfer. Prefer frozen-OK €85 confirmed booking.'
from public.supplier_earning_items e
join public.bookings b on b.id = e.booking_id
where b.public_reference = 'TV-FNFQEA87'
  and e.supplier_id = '9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18'
  and e.status = 'eligible'
  and e.amount_minor = 8500
on conflict (pilot_label, earning_item_id) do update
  set status = excluded.status,
      note = excluded.note,
      updated_at = now();

insert into public.supplier_payout_pilot_selections (
  supplier_id, earning_item_id, booking_id, public_reference, amount_minor, currency, status, pilot_label, note
)
select
  e.supplier_id,
  e.id,
  e.booking_id,
  b.public_reference,
  e.amount_minor,
  coalesce(nullif(upper(e.currency), ''), 'EUR'),
  'excluded',
  'p81_rn_first_live',
  'Retained no_refund cancel — contractually payable per booking_is_supplier_retained_cancel, but excluded from first pilot until explicit approval.'
from public.supplier_earning_items e
join public.bookings b on b.id = e.booking_id
where b.public_reference = 'TV-PDTAS6JD'
  and e.supplier_id = '9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18'
on conflict (pilot_label, earning_item_id) do update
  set status = excluded.status,
      note = excluded.note,
      updated_at = now();

insert into public.financial_audit_log (
  actor_id, action, supplier_id, booking_id, amount_minor, currency, reason, provider_ref, after_state
)
select
  null,
  'p81_pilot_selection',
  p.supplier_id,
  p.booking_id,
  p.amount_minor,
  p.currency,
  p.note,
  p.public_reference,
  jsonb_build_object(
    'pilot_label', p.pilot_label,
    'status', p.status,
    'earning_item_id', p.earning_item_id
  )
from public.supplier_payout_pilot_selections p
where p.pilot_label = 'p81_rn_first_live';
