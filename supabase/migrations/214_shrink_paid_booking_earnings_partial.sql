-- Phase 1739: keep booking_earnings journal aligned with amount_paid after
-- Stripe partial refunds (Phase 1735). Available already uses amount_paid;
-- the Ledger UI still showed the original gross booking_earnings row.

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
  v_id uuid;
  v_before numeric;
  v_after numeric;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_required');
  end if;
  if p_remaining is null or not (p_remaining >= 0) or not (p_remaining = p_remaining) then
    return jsonb_build_object('ok', false, 'error', 'remaining_invalid');
  end if;

  select id, amount
    into v_id, v_before
  from public.supplier_ledger_entries
  where kind = 'booking_earnings'
    and booking_id = p_booking_id
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok', true, 'shrunk', false, 'reason', 'no_earnings');
  end if;

  -- Only shrink; never inflate earnings via this path.
  if v_before is null or v_before <= p_remaining then
    return jsonb_build_object(
      'ok', true,
      'shrunk', false,
      'reason', 'already_at_or_below',
      'id', v_id,
      'amount', v_before
    );
  end if;

  update public.supplier_ledger_entries
  set
    amount = p_remaining,
    reason = 'Paid booking (after partial Stripe refund)'
  where id = v_id
  returning amount into v_after;

  return jsonb_build_object(
    'ok', true,
    'shrunk', true,
    'id', v_id,
    'before', v_before,
    'amount', v_after
  );
end;
$$;

comment on function public.shrink_paid_booking_earnings(uuid, numeric) is
  'Phase 1739: shrink booking_earnings to remaining amount_paid after a Stripe partial refund. Service-role only. Never increases amount.';

revoke all on function public.shrink_paid_booking_earnings(uuid, numeric) from public;
revoke all on function public.shrink_paid_booking_earnings(uuid, numeric) from anon;
revoke all on function public.shrink_paid_booking_earnings(uuid, numeric) from authenticated;
grant execute on function public.shrink_paid_booking_earnings(uuid, numeric) to service_role;
