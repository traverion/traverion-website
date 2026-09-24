-- Phase 587: close a payout-readiness honesty gap in the admin Finance panel.
--
-- AdminFinancePanel.tsx already displays, per currency, "Paid out to
-- suppliers" ("Recorded payout periods, status Paid") and "Pending payout"
-- ("Payout periods not yet marked Paid"), sourced from
-- admin-supplier-verification's finance_summary action, which reads
-- public.supplier_earnings.status. supplier_earnings (migration 002) is a
-- per-period payout-batch table -- supplier_id, period_start, period_end,
-- amount, currency, status in ('pending','paid','cancelled') -- with RLS
-- that already denies ALL client insert/update ("system only"), by design.
--
-- Grepping every migration, every Edge Function, and all of src for
-- `.from('supplier_earnings')` / `into public.supplier_earnings` turns up
-- exactly one write path: none. The table has never been inserted into or
-- updated anywhere in this codebase since migration 002 created it. It is
-- permanently empty. That means finance_summary's paidOut and
-- pendingPayout buckets are structurally guaranteed to read 0 / 0 forever,
-- for every currency, regardless of how many real manual payouts the
-- founder actually sends to suppliers outside the system -- yet the UI
-- presents these as real, computed, labeled figures ("Recorded payout
-- periods, status Paid"), not as an unbuilt feature. That is exactly the
-- "placeholder functionality presented as real" pattern the mission's
-- hard constraints forbid, sitting in the platform's own money-truth
-- panel: a founder relying on "Paid out to suppliers" to sanity-check
-- Traverion's obligations, or a supplier eventually shown the same
-- collected-minus-paid-out balance, would see a number that can never
-- reflect a real payout.
--
-- This does not build automatic payout computation (period cadence,
-- auto-generated pending batches) -- that is a genuine unbuilt feature
-- (Phase 400's own "WHAT IS NOT BUILT: Automatic payouts"), and inventing
-- a cadence/policy here would be a product decision this mission should
-- not make unilaterally. It closes the narrower, provable gap: there is
-- currently NO way, anywhere, for anyone -- including the founder acting
-- through admin -- to record that a payout happened, which is a Priority
-- Zero "payout readiness" transaction-truth gap independent of whether
-- payouts are ever automated. The UI copy already promises this is how
-- it works ("Payouts are manual, so this page never invents a transfer" --
-- AdminFinancePanel.tsx; "Payouts are manual — this page never invents a
-- transfer" — SupplierEarnings.tsx) -- this migration is what makes that
-- promise true instead of aspirational.
--
-- Adds two columns supplier_earnings never had (both nullable, additive,
-- no data migration needed since the table is empty): `note` for an
-- optional human reference (e.g. a bank transfer reference/date) and
-- `recorded_by` for which admin recorded it, matching the accountability
-- expectation for a manually-triggered, money-affecting admin action in a
-- codebase with no separate admin-audit-log table.
--
-- New RPC `admin_record_supplier_payout`, following the exact same trust
-- pattern already used by record_paid_booking_earnings (056) and
-- reverse_paid_booking_earnings (070): SECURITY DEFINER, granted ONLY to
-- service_role, so it is reachable only through admin-supplier-
-- verification's existing assertAdmin() gate (JWT + app_metadata.role +
-- sole-admin-row cross-check) -- never directly by an authenticated or
-- anonymous client. Validates supplier existence, a positive amount, a
-- real currency, a valid period, and status in ('pending','paid') before
-- inserting -- rejecting bad input with a clear error rather than a
-- constraint-violation 500.
--
-- Verified against a scratch Postgres 16 instance (see
-- supabase/tests/admin_record_supplier_payout.test.sql): a real payout
-- recorded as 'paid' inserts correctly and is readable by finance_summary-
-- style aggregation; an authenticated (non-service-role) caller cannot
-- execute the function directly (permission denied) and cannot bypass it
-- to insert into supplier_earnings directly either (pre-existing RLS,
-- reconfirmed unregressed); a supplier cannot read another supplier's
-- earnings row (pre-existing RLS, reconfirmed unregressed); invalid input
-- (non-positive amount, unknown supplier, empty currency, inverted period,
-- bad status) is rejected with ok:false rather than a raw SQL error.

alter table public.supplier_earnings
  add column if not exists note text,
  add column if not exists recorded_by uuid references auth.users(id) on delete set null;

comment on column public.supplier_earnings.note is
  'Optional human reference for a manually recorded payout (e.g. a bank transfer reference/date). Never required.';
comment on column public.supplier_earnings.recorded_by is
  'auth.users id of the admin who recorded this payout via admin_record_supplier_payout. Null for any pre-existing/legacy row.';

create or replace function public.admin_record_supplier_payout(
  p_supplier_id uuid,
  p_amount numeric,
  p_currency text,
  p_period_start date,
  p_period_end date,
  p_status text default 'paid',
  p_note text default null,
  p_recorded_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_status text := lower(trim(coalesce(p_status, 'paid')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if p_supplier_id is null then
    return jsonb_build_object('ok', false, 'error', 'supplier_id is required');
  end if;
  if not exists (select 1 from auth.users where id = p_supplier_id) then
    return jsonb_build_object('ok', false, 'error', 'supplier not found');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'amount must be a positive number');
  end if;
  if v_currency = '' or length(v_currency) <> 3 then
    return jsonb_build_object('ok', false, 'error', 'currency must be a 3-letter code');
  end if;
  if v_status not in ('pending', 'paid') then
    return jsonb_build_object('ok', false, 'error', 'status must be pending or paid');
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    return jsonb_build_object('ok', false, 'error', 'period_start/period_end must be a valid, non-inverted range');
  end if;

  insert into public.supplier_earnings (
    supplier_id, period_start, period_end, amount, currency, status, note, recorded_by
  ) values (
    p_supplier_id, p_period_start, p_period_end, p_amount, v_currency, v_status, v_note, p_recorded_by
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status, 'amount', p_amount, 'currency', v_currency);
end;
$$;

comment on function public.admin_record_supplier_payout(uuid, numeric, text, date, date, text, text, uuid) is
  'Admin-only (service_role via admin-supplier-verification assertAdmin): records a manually completed or pending supplier payout period. The only write path into supplier_earnings, which client RLS still denies entirely.';

revoke all on function public.admin_record_supplier_payout(uuid, numeric, text, date, date, text, text, uuid) from public;
revoke all on function public.admin_record_supplier_payout(uuid, numeric, text, date, date, text, text, uuid) from anon;
revoke all on function public.admin_record_supplier_payout(uuid, numeric, text, date, date, text, text, uuid) from authenticated;
grant execute on function public.admin_record_supplier_payout(uuid, numeric, text, date, date, text, text, uuid) to service_role;
