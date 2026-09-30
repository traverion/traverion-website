-- Phase 1781: admin_record_supplier_payout requires a supplier_profiles row.
-- auth.users alone allowed recording payouts against traveler UUIDs.

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
  -- Phase 1781: must be a partner account, not any auth.users id.
  if not exists (select 1 from public.supplier_profiles where id = p_supplier_id) then
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
  'Phase 1781: admin payout record requires supplier_profiles.id (not bare auth.users).';
