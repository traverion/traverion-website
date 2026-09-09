-- Reverse posted booking_earnings when Stripe fully refunds a charge.
-- Idempotent on (kind, source_id) = ('refund', booking_id).

create or replace function public.reverse_paid_booking_earnings(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_amount numeric;
begin
  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  )
  select
    e.supplier_id,
    e.booking_id,
    'refund',
    - abs(e.amount),
    e.currency,
    'Stripe full refund earnings reversal',
    e.booking_id::text,
    'traverion_supplier_ledger_v1'
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings'
    and e.booking_id = p_booking_id
  on conflict (kind, source_id) do nothing
  returning id, amount into v_id, v_amount;

  if v_id is null then
    select id, amount into v_id, v_amount
    from public.supplier_ledger_entries
    where kind = 'refund' and source_id = p_booking_id::text;
    if v_id is null then
      return jsonb_build_object('ok', true, 'reversed', false, 'reason', 'no_earnings_or_already');
    end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'already', true, 'amount', v_amount);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'already', false, 'amount', v_amount);
end;
$$;

comment on function public.reverse_paid_booking_earnings(uuid) is
  'Posts one refund ledger row reversing booking_earnings after a full Stripe refund. Idempotent on (kind, source_id).';

revoke all on function public.reverse_paid_booking_earnings(uuid) from public;
revoke all on function public.reverse_paid_booking_earnings(uuid) from anon;
revoke all on function public.reverse_paid_booking_earnings(uuid) from authenticated;
grant execute on function public.reverse_paid_booking_earnings(uuid) to service_role;
